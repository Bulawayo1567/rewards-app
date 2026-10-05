import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { fmtDate, fmtInt, str } from "../lib/rewards/format";
import { scanShop } from "../lib/rewards/spam.server";
import { Hero, UIStyles, Tabs, MEMBERS_TABS, Card, Empty, Pill } from "../lib/rewards/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const view = new URL(request.url).searchParams.get("view") === "spam" ? "spam" : "suspicious";
  const [rows, counts] = await Promise.all([
    prisma.customer.findMany({ where: { shop, spam: view }, orderBy: [{ spamScore: "desc" }, { createdAt: "desc" }], take: 200 }),
    prisma.customer.groupBy({ by: ["spam"], where: { shop }, _count: { _all: true } }),
  ]);
  const n = (k: string) => counts.find((c) => c.spam === k)?._count._all ?? 0;
  return { view, suspicious: n("suspicious"), spam: n("spam"), trusted: n("trusted"),
    rows: rows.map((c) => ({ id: c.id, email: c.email, name: [c.firstName, c.lastName].filter(Boolean).join(" ") || "(no name)", score: c.spamScore, reasons: (c.spamReasons ?? "").split("; ").filter(Boolean), balance: c.balance, createdAt: c.createdAt.toISOString(), linked: !!c.shopifyId })) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = str(fd, "intent");
  if (intent === "scan") { const r = await scanShop(shop); return { ok: true, message: `Scanned ${fmtInt(r.scanned)} members — ${fmtInt(r.suspicious)} suspicious` }; }
  if (intent === "mark") {
    const status = str(fd, "status"); const id = str(fd, "id");
    if (!["spam", "trusted", "ok"].includes(status)) return { error: "Bad status" };
    await prisma.customer.updateMany({ where: { shop, id }, data: { spam: status } });
    return { ok: true, message: status === "spam" ? "Marked as spam" : status === "trusted" ? "Marked as a real member" : "Cleared" };
  }
  if (intent === "confirm-all") {
    const r = await prisma.customer.updateMany({ where: { shop, spam: "suspicious", lifetimeSpend: 0 }, data: { spam: "spam" } });
    return { ok: true, message: `${fmtInt(r.count)} accounts confirmed as spam` };
  }
  return { error: "Unknown action" };
};

export default function Spam() {
  const { view, suspicious, spam, trusted, rows } = useLoaderData<typeof loader>();
  useActionToast();
  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title="Suspicious accounts" sub={<>{fmtInt(suspicious)} to review · {fmtInt(spam)} confirmed spam · {fmtInt(trusted)} marked real</>}
        right={<Form method="post"><input type="hidden" name="intent" value="scan" /><button className="st-btn secondary" type="submit">Rescan all members</button></Form>} />
      <Tabs items={MEMBERS_TABS} active="spam" />
      <div className="aas-actions" style={{ margin: "4px 0 10px" }}>
        <a className={`st-btn ${view === "suspicious" ? "primary" : "secondary"} sm`} href="/app/spam">To review ({fmtInt(suspicious)})</a>
        <a className={`st-btn ${view === "spam" ? "primary" : "secondary"} sm`} href="/app/spam?view=spam">Confirmed spam ({fmtInt(spam)})</a>
      </div>

      <Card icon={view === "spam" ? "🚫" : "🔍"} title={view === "spam" ? "Confirmed spam" : "To review"} sub={view === "spam" ? "These accounts earn nothing and are excluded from counts, liability and emails." : "Scored from the email/name mismatch, repeated names, sign-up bursts and known throwaway domains. Any paid order clears the flag."}
        actions={view === "suspicious" && suspicious > 0 ? <Form method="post" onSubmit={(e) => { if (!confirm(`Confirm ALL ${suspicious} suspicious accounts as spam?\n\nOnly accounts with no paid orders are affected. They stop earning and drop out of counts. You can mark any of them as real later.`)) e.preventDefault(); }}><input type="hidden" name="intent" value="confirm-all" /><button className="st-btn danger sm" type="submit">Confirm all as spam</button></Form> : null}>
        {rows.length === 0 ? <Empty>{view === "spam" ? "Nothing confirmed yet." : "Nothing to review — run a rescan after new sign-ups."}</Empty> : (
          <div className="st-list">
            {rows.map((c) => (
              <div key={c.id} className="st-item">
                <div className="ic">{c.score >= 80 ? "🤖" : "❓"}</div>
                <div>
                  <div className="ttl"><s-link href={`/app/customers/${c.id}`}>{c.name}</s-link> <Pill tone={c.score >= 80 ? "neg" : "warn"}>score {c.score}</Pill> {c.balance > 0 && <Pill tone="info">{fmtInt(c.balance)} pts</Pill>}</div>
                  <div className="meta"><span>{c.email}</span><span>·</span><span>joined {fmtDate(c.createdAt)}</span><span>·</span><span>{c.linked ? "Shopify account" : "no Shopify account"}</span></div>
                  <div>{c.reasons.map((r) => <span key={r} className="st-reason">{r}</span>)}</div>
                </div>
                <div className="acts">
                  {view !== "spam" && <Form method="post"><input type="hidden" name="intent" value="mark" /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="spam" /><button className="st-btn danger sm" type="submit">Spam</button></Form>}
                  <Form method="post"><input type="hidden" name="intent" value="mark" /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="trusted" /><button className="st-btn secondary sm" type="submit">Real member</button></Form>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
