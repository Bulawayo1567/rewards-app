import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseCsv, findCol } from "../lib/rewards/csv";
import { recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";
import { fmtDate, fmtInt, str } from "../lib/rewards/format";

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

  return (
    <s-page heading="Import from Smile.io">
      {result && "error" in result && result.error && <s-banner tone="critical" heading="Import problem">{result.error}</s-banner>}
      {result && "committed" in result && result.committed && (
        <s-banner tone="success" heading="Import complete">
          {fmtInt(result.committed.imported)} members imported with {fmtInt(result.committed.totalPoints)} points; {result.committed.skipped} skipped (already migrated).
        </s-banner>
      )}

      {!p && (
        <s-section heading="1. Upload the export">
          <s-paragraph>In Smile.io: <b>Customers → Export</b>. Upload that CSV here. Nothing is written until you confirm the preview.</s-paragraph>
          <Form method="post" encType="multipart/form-data">
            <input type="hidden" name="intent" value="preview" />
            <input type="file" name="file" accept=".csv,text/csv" required />
            <s-button type="submit" variant="primary" loading={busy}>Preview import</s-button>
          </Form>
        </s-section>
      )}

      {p && (
        <>
          <s-section heading="2. Review">
            <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
              <Stat label="Rows in file" value={fmtInt(p.rowCount)} />
              <Stat label="Will import" value={fmtInt(p.importable.length)} />
              <Stat label="Total points" value={fmtInt(p.totalPoints)} />
              <Stat label="Already members here" value={fmtInt(p.existingMembers)} />
              <Stat label="Skip (already migrated)" value={fmtInt(p.skippedMigrated)} />
              <Stat label="Zero-balance rows" value={fmtInt(p.zero)} />
            </s-grid>
            {(p.dupes > 0 || p.badPoints > 0) && (
              <s-banner tone="warning" heading="Data notes">
                {p.dupes > 0 && <>{p.dupes} duplicate emails (kept the higher balance). </>}
                {p.badPoints > 0 && <>{p.badPoints} rows had unreadable points and were dropped.</>}
              </s-banner>
            )}
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Email</s-table-header>
                <s-table-header>Name</s-table-header>
                <s-table-header format="numeric">Points</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {p.sample.map((r) => (
                  <s-table-row key={r.email}>
                    <s-table-cell>{r.email}</s-table-cell>
                    <s-table-cell>{[r.firstName, r.lastName].filter(Boolean).join(" ")}</s-table-cell>
                    <s-table-cell>{fmtInt(r.points)}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
            <s-text color="subdued">Showing first {p.sample.length} of {fmtInt(p.importable.length)}.</s-text>
          </s-section>
          <s-section heading="3. Commit">
            <s-paragraph>This writes one <b>MIGRATION</b> ledger entry per member. Members who already have one are skipped, so re-running is safe.</s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="commit" />
              <input type="hidden" name="payload" value={p.payload} />
              <input type="hidden" name="fileName" value={p.fileName} />
              <s-stack direction="inline" gap="base">
                <s-button type="submit" variant="primary" loading={busy}>Import {fmtInt(p.importable.length)} members</s-button>
                <s-button href="/app/import" variant="secondary">Cancel</s-button>
              </s-stack>
            </Form>
          </s-section>
        </>
      )}

      {batches.length > 0 && (
        <s-section heading="Past imports" padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header>When</s-table-header>
              <s-table-header listSlot="primary">File</s-table-header>
              <s-table-header format="numeric">Imported</s-table-header>
              <s-table-header format="numeric">Skipped</s-table-header>
              <s-table-header format="numeric">Points</s-table-header>
              <s-table-header>By</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {batches.map((b) => (
                <s-table-row key={b.id}>
                  <s-table-cell>{fmtDate(b.createdAt)}</s-table-cell>
                  <s-table-cell>{b.fileName}</s-table-cell>
                  <s-table-cell>{fmtInt(b.imported)}</s-table-cell>
                  <s-table-cell>{fmtInt(b.skipped)}</s-table-cell>
                  <s-table-cell>{fmtInt(b.totalPoints)}</s-table-cell>
                  <s-table-cell>{b.staffEmail ?? ""}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <s-box padding="base" background="subdued" border="base" borderRadius="base">
      <s-text color="subdued">{label}</s-text>
      <s-heading>{value}</s-heading>
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
