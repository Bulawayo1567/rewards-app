import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseCsv, findCol } from "../lib/rewards/csv";
import { recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";
import { fmtDate, fmtInt, str } from "../lib/rewards/format";
import { Hero, UIStyles, Tabs, SETTINGS_TABS, Card, Empty } from "../lib/rewards/ui";

interface Row { email: string; points: number; firstName?: string; lastName?: string; smileId?: string }

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const batches = await prisma.importBatch.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 10 });
  return { batches: batches.map((b) => ({ ...b, createdAt: b.createdAt.toISOString(), committedAt: b.committedAt?.toISOString() ?? null })) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = str(fd, "intent");

  // ── Step 1: preview ──
  if (intent === "preview") {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose the Smile.io CSV export first." };
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return { error: "The file has no data rows." };
    const headers = rows[0];
    const iEmail = findCol(headers, ["email", "customer email"]);
    const iPoints = findCol(headers, ["points balance", "point balance", "balance", "points"]);
    const iFirst = findCol(headers, ["first name", "first_name", "firstname"]);
    const iLast = findCol(headers, ["last name", "last_name", "lastname"]);
    const iSmile = findCol(headers, ["customer id", "smile id", "id"]);
    if (iEmail < 0 || iPoints < 0) return { error: `Couldn't find email/points columns. Headers seen: ${headers.join(" | ")}` };

    const seen = new Map<string, Row>();
    let dupes = 0, badPoints = 0, zero = 0;
    for (const r of rows.slice(1)) {
      const email = (r[iEmail] ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) continue;
      const points = Math.round(Number(String(r[iPoints] ?? "").replace(/[^0-9.-]/g, "")));
      if (!Number.isFinite(points)) { badPoints++; continue; }
      if (points === 0) zero++;
      const row: Row = { email, points, firstName: iFirst >= 0 ? r[iFirst]?.trim() : undefined, lastName: iLast >= 0 ? r[iLast]?.trim() : undefined, smileId: iSmile >= 0 ? r[iSmile]?.trim() : undefined };
      if (seen.has(email)) { dupes++; seen.set(email, { ...row, points: Math.max(points, seen.get(email)!.points) }); }
      else seen.set(email, row);
    }
    const list = [...seen.values()];
    const existing = await prisma.customer.findMany({ where: { shop, email: { in: list.map((r) => r.email) } }, select: { email: true } });
    const alreadyMigrated = await prisma.pointsLedger.findMany({ where: { shop, type: "MIGRATION", customer: { email: { in: list.map((r) => r.email) } } }, select: { customer: { select: { email: true } } } });
    const migratedSet = new Set(alreadyMigrated.map((x) => x.customer.email));

    const preview = {
      fileName: file.name,
      rowCount: rows.length - 1,
      importable: list.filter((r) => !migratedSet.has(r.email)),
      skippedMigrated: list.filter((r) => migratedSet.has(r.email)).length,
      existingMembers: existing.length,
      dupes, badPoints, zero,
    };
    const totalPoints = preview.importable.reduce((s, r) => s + r.points, 0);
    return { preview: { ...preview, totalPoints, sample: preview.importable.slice(0, 10), payload: JSON.stringify(preview.importable) } };
  }

  // ── Step 2: commit ──
  if (intent === "commit") {
    const list: Row[] = JSON.parse(str(fd, "payload") || "[]");
    const fileName = str(fd, "fileName") || "smile-export.csv";
    if (!list.length) return { error: "Nothing to import." };

    const batch = await prisma.importBatch.create({ data: { shop, fileName, rowCount: list.length, status: "COMMITTED", staffEmail: session.email ?? null, committedAt: new Date() } });
    let imported = 0, skipped = 0, totalPoints = 0;

    for (const r of list) {
      const customer = await prisma.customer.upsert({
        where: { shop_email: { shop, email: r.email } },
        update: { ...(r.firstName ? { firstName: r.firstName } : {}), ...(r.lastName ? { lastName: r.lastName } : {}), ...(r.smileId ? { smileId: r.smileId } : {}) },
        create: { shop, email: r.email, firstName: r.firstName || null, lastName: r.lastName || null, smileId: r.smileId || null },
      });
      const done = await prisma.pointsLedger.findFirst({ where: { shop, customerId: customer.id, type: "MIGRATION" } });
      if (done) { skipped++; continue; }
      if (r.points !== 0) {
        await prisma.pointsLedger.create({ data: { shop, customerId: customer.id, type: "MIGRATION", points: r.points, note: `Smile.io opening balance (batch ${batch.id.slice(-6)})` } });
        totalPoints += r.points;
      }
      await recalcCustomer(shop, customer.id);
      imported++;
    }
    await prisma.importBatch.update({ where: { id: batch.id }, data: { imported, skipped, totalPoints } });

    // Metafield sync only for customers that already have a Shopify id; the rest sync when they next appear in a webhook.
    const withIds = await prisma.customer.findMany({ where: { shop, email: { in: list.map((r) => r.email) }, shopifyId: { not: null } }, include: { tier: true } });
    for (const c of withIds) await syncCustomerMetafields(admin.graphql, c);

    return { committed: { imported, skipped, totalPoints } };
  }
  return { error: "Unknown action" };
};

export default function Import() {
  const { batches } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const p = result && "preview" in result ? result.preview : null;
  const Stat = ({ l, v }: { l: string; v: string }) => <div className="aas-stat"><div className="l">{l}</div><div className="v">{v}</div></div>;

  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title="Settings" sub="Bring balances over from Smile.io" />
      <Tabs items={SETTINGS_TABS} active="import" />
      {result && "error" in result && result.error && <s-banner tone="critical" heading="Import problem">{result.error}</s-banner>}
      {result && "committed" in result && result.committed && (
        <s-banner tone="success" heading="Import complete">{fmtInt(result.committed.imported)} members imported with {fmtInt(result.committed.totalPoints)} points; {result.committed.skipped} skipped (already migrated).</s-banner>
      )}

      {!p && (
        <Card icon="📥" title="1 · Upload the export" sub="In Smile.io: Customers → Export. Nothing is written until you confirm the preview.">
          <Form method="post" encType="multipart/form-data" className="st-form">
            <input type="hidden" name="intent" value="preview" />
            <div className="st-foot">
              <label className="st-btn secondary" style={{ cursor: "pointer" }}>Choose CSV…<input type="file" name="file" accept=".csv,text/csv" required style={{ display: "none" }} onChange={(ev) => { const n = ev.target.files?.[0]?.name; const o = document.getElementById("aas-file-name"); if (o) o.textContent = n ?? ""; }} /></label>
              <span id="aas-file-name" className="aas-muted" />
              <button className="st-btn primary" type="submit" disabled={busy}>{busy ? "Reading…" : "Preview import"}</button>
            </div>
          </Form>
        </Card>
      )}

      {p && (
        <>
          <Card icon="🔍" title="2 · Review" sub={`${p.fileName} · ${fmtInt(p.rowCount)} rows`}>
            <div className="aas-kpis" style={{ gap: 10 }}>
              <Stat l="Will import" v={fmtInt(p.importable.length)} />
              <Stat l="Total points" v={fmtInt(p.totalPoints)} />
              <Stat l="Already members" v={fmtInt(p.existingMembers)} />
              <Stat l="Skip (migrated)" v={fmtInt(p.skippedMigrated)} />
              <Stat l="Zero balance" v={fmtInt(p.zero)} />
              <Stat l="Dropped rows" v={fmtInt(p.badPoints)} />
            </div>
            {p.dupes > 0 && <div className="aas-muted" style={{ margin: "10px 0" }}>{p.dupes} duplicate emails — the higher balance was kept.</div>}
            <div className="aas-tblwrap" style={{ marginTop: 12 }}><table className="aas-tbl"><thead><tr><th>Email</th><th>Name</th><th className="num">Points</th></tr></thead><tbody>
              {p.sample.map((r) => <tr key={r.email}><td>{r.email}</td><td className="dim">{[r.firstName, r.lastName].filter(Boolean).join(" ")}</td><td className="num"><b>{fmtInt(r.points)}</b></td></tr>)}
            </tbody></table></div>
            <div className="aas-muted" style={{ marginTop: 8 }}>Showing first {p.sample.length} of {fmtInt(p.importable.length)}.</div>
          </Card>
          <Card icon="✅" title="3 · Commit" sub="Writes one MIGRATION ledger entry per member. Members who already have one are skipped, so re-running is safe.">
            <Form method="post" className="st-form">
              <input type="hidden" name="intent" value="commit" /><input type="hidden" name="payload" value={p.payload} /><input type="hidden" name="fileName" value={p.fileName} />
              <div className="st-foot">
                <button className="st-btn primary" type="submit" disabled={busy}>{busy ? "Importing…" : `Import ${fmtInt(p.importable.length)} members`}</button>
                <a className="st-btn ghost" href="/app/import">Cancel</a>
              </div>
            </Form>
          </Card>
        </>
      )}

      <Card icon="📚" title="Past imports" sub={batches.length ? `${batches.length} batch${batches.length === 1 ? "" : "es"}` : "none yet"}>
        {batches.length === 0 ? <Empty>No imports yet.</Empty> : (
          <div className="aas-tblwrap"><table className="aas-tbl"><thead><tr><th>When</th><th>File</th><th className="num">Imported</th><th className="num">Skipped</th><th className="num">Points</th><th>By</th></tr></thead><tbody>
            {batches.map((b) => <tr key={b.id}><td className="dim" style={{ whiteSpace: "nowrap" }}>{fmtDate(b.createdAt)}</td><td>{b.fileName}</td><td className="num">{fmtInt(b.imported)}</td><td className="num dim">{fmtInt(b.skipped)}</td><td className="num"><b>{fmtInt(b.totalPoints)}</b></td><td className="dim">{b.staffEmail ?? ""}</td></tr>)}
          </tbody></table></div>
        )}
      </Card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
