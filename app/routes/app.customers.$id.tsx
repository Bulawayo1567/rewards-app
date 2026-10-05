import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, Link, useLoaderData, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";
import { redeemReward, reverseRedemption, RedeemError } from "../lib/rewards/redeem.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { fmtDate, fmtInt, fmtMoney, str, num } from "../lib/rewards/format";
import { Hero, UIStyles, Card, Field, Empty, Pill } from "../lib/rewards/ui";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [customer, rewards] = await Promise.all([
    prisma.customer.findFirst({
      where: { shop, id: params.id },
      include: { tier: true, ledger: { orderBy: { createdAt: "desc" }, take: 100 }, redemptions: { orderBy: { createdAt: "desc" }, take: 20, include: { reward: true } } },
    }),
    prisma.reward.findMany({ where: { shop, active: true }, orderBy: [{ sortOrder: "asc" }, { pointsCost: "asc" }] }),
  ]);
  if (!customer) throw new Response("Not found", { status: 404 });
  return {
    customer: {
      id: customer.id, email: customer.email, firstName: customer.firstName, lastName: customer.lastName,
      balance: customer.balance, pendingBalance: customer.pendingBalance, lifetimePoints: customer.lifetimePoints,
      lifetimeSpend: Number(customer.lifetimeSpend), tier: customer.tier ? { name: customer.tier.name, rank: customer.tier.rank } : null,
      birthday: customer.birthday?.toISOString() ?? null, newsletterAwarded: customer.newsletterAwarded, signupAwarded: customer.signupAwarded,
      ledger: customer.ledger.map((l) => ({ id: l.id, type: l.type, status: l.status, points: l.points, note: l.note, orderName: l.orderName, staffEmail: l.staffEmail, createdAt: l.createdAt.toISOString(), availableAt: l.availableAt?.toISOString() ?? null })),
      redemptions: customer.redemptions.map((r) => ({ id: r.id, name: r.reward.name, discountCode: r.discountCode, pointsSpent: r.pointsSpent, status: r.status, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString() })),
    },
    rewards: rewards.map((r) => ({ id: r.id, name: r.name, pointsCost: r.pointsCost, minTierRank: r.minTierRank })),
    shopifyAdminUrl: customer.shopifyId ? `shopify:admin/customers/${customer.shopifyId.split("/").pop()}` : null,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = str(fd, "intent");
  const staff = session.email ?? null;

  const customer = await prisma.customer.findFirst({ where: { shop, id: params.id } });
  if (!customer) throw new Response("Not found", { status: 404 });

  try {
    if (intent === "redeem") {
      const { code, expiresAt } = await redeemReward(shop, admin.graphql, customer.id, str(fd, "rewardId"), staff);
      return { ok: true, message: `Issued code ${code}, valid until ${fmtDate(expiresAt)}` };
    }
    if (intent === "reverse") {
      await reverseRedemption(shop, admin.graphql, str(fd, "redemptionId"), staff);
      return { ok: true, message: "Redemption reversed — points returned and code deactivated." };
    }
    // adjust
    const points = Math.floor(num(fd, "points"));
    const note = str(fd, "note");
    if (!points) return { error: "Enter a non-zero amount" };
    if (!note) return { error: "A reason is required" };
    await prisma.pointsLedger.create({ data: { shop, customerId: customer.id, type: "ADJUSTMENT", points, note, staffEmail: staff } });
    const updated = await recalcCustomer(shop, customer.id);
    await syncCustomerMetafields(admin.graphql, updated);
    return { ok: true, message: `Applied ${points > 0 ? "+" : ""}${points} points` };
  } catch (e) {
    if (e instanceof RedeemError) return { error: e.message };
    console.error("[rewards] customer action failed", e);
    return { error: (e as Error).message ?? "Something went wrong" };
  }
};

export default function CustomerDetail() {
  const { customer: c, rewards, shopifyAdminUrl } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  useActionToast();
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;
  const Stat = ({ l, v, hot }: { l: string; v: string; hot?: boolean }) => <div className={`aas-stat${hot ? " hot" : ""}`}><div className="l">{l}</div><div className="v">{v}</div></div>;
  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title={name} sub={<>{c.email}{c.tier ? <> · {c.tier.name}</> : null}{shopifyAdminUrl && <> · <a href={shopifyAdminUrl} style={{ color: "#c60d11" }}>Open in Shopify customers</a></>}</>} right={<Link to="/app/customers" className="st-btn secondary sm">← Members</Link>} />
      {result?.error && <s-banner tone="critical" heading="Not applied">{result.error}</s-banner>}
      {result?.ok && <s-banner tone="success" heading="Done">{result.message}</s-banner>}

      <div className="aas-panel">
        <div className="aas-kpis" style={{ gap: 10 }}>
          <Stat l="Available" v={fmtInt(c.balance)} hot />
          <Stat l="Pending" v={fmtInt(c.pendingBalance)} />
          <Stat l="Lifetime points" v={fmtInt(c.lifetimePoints)} />
          <Stat l="Lifetime spend" v={fmtMoney(c.lifetimeSpend)} />
          <Stat l="Tier" v={c.tier?.name ?? "—"} />
          <Stat l="Birthday" v={c.birthday ? c.birthday.slice(5, 10) : "not set"} />
        </div>
        <div className="aas-muted" style={{ marginTop: 10, fontSize: 12 }}>Newsletter bonus: {c.newsletterAwarded ? "granted" : "no"} · Signup bonus: {c.signupAwarded ? "granted" : "no"}</div>
      </div>

      <div className="st-grid two" style={{ marginTop: 8 }}>
        <Card icon="✏️" title="Adjust points" sub="Logged with your name and reason.">
          <Form method="post" className="st-form">
            <input type="hidden" name="intent" value="adjust" />
            <Field label="Points (+ / −)" unit="pts"><input name="points" type="number" placeholder="250 or -100" required /></Field>
            <div style={{ marginTop: 12 }}><Field label="Reason"><input className="txt" name="note" placeholder="Goodwill for delayed order #1234" required /></Field></div>
            <div className="st-foot" style={{ marginTop: 14 }}><button className="st-btn primary" type="submit">Apply</button></div>
          </Form>
        </Card>
        <Card icon="🎁" title="Redeem on their behalf" sub="Mints a single-use code locked to this customer and deducts the points.">
          <Form method="post" className="st-form">
            <input type="hidden" name="intent" value="redeem" />
            <Field label="Reward"><select name="rewardId">{rewards.map((r) => <option key={r.id} value={r.id} disabled={r.pointsCost > c.balance}>{r.name} — {fmtInt(r.pointsCost)} pts</option>)}</select></Field>
            <div className="st-foot" style={{ marginTop: 14 }}><button className="st-btn primary" type="submit" disabled={rewards.length === 0}>Redeem</button></div>
          </Form>
        </Card>
      </div>

      {c.redemptions.length > 0 && (
        <Card icon="🧺" title="Redemptions" sub={`${c.redemptions.length} most recent`}>
          <div className="aas-tblwrap"><table className="aas-tbl"><thead><tr><th>When</th><th>Reward</th><th>Code</th><th className="num">Points</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>
            {c.redemptions.map((r) => (
              <tr key={r.id}><td className="dim" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.createdAt)}</td><td>{r.name}</td><td><code>{r.discountCode}</code></td><td className="num">{fmtInt(r.pointsSpent)}</td>
                <td><Pill tone={r.status === "USED" ? "ok" : r.status === "REVERSED" ? "neg" : "info"}>{r.status}</Pill></td><td className="dim">{fmtDate(r.expiresAt)}</td>
                <td>{r.status !== "REVERSED" && <Form method="post" onSubmit={(e) => { if (!confirm(`Reverse ${r.discountCode}? Points are returned and the code is deactivated.`)) e.preventDefault(); }}><input type="hidden" name="intent" value="reverse" /><input type="hidden" name="redemptionId" value={r.id} /><button className="st-btn danger sm" type="submit">Reverse</button></Form>}</td></tr>
            ))}
          </tbody></table></div>
        </Card>
      )}

      <Card icon="📋" title="History" sub={`${c.ledger.length} most recent entries`}>
        {c.ledger.length === 0 ? <Empty>No activity yet.</Empty> : (
          <div className="aas-tblwrap"><table className="aas-tbl"><thead><tr><th>When</th><th>Type</th><th className="num">Points</th><th>Status</th><th>Note</th><th>Order</th><th>By</th></tr></thead><tbody>
            {c.ledger.map((l) => (
              <tr key={l.id}><td className="dim" style={{ whiteSpace: "nowrap" }}>{fmtDate(l.createdAt)}</td><td><Pill tone={l.points < 0 ? "neg" : "ok"}>{l.type}</Pill></td><td className="num"><b>{l.points > 0 ? `+${fmtInt(l.points)}` : fmtInt(l.points)}</b></td><td className="dim">{l.status}{l.status === "PENDING" && l.availableAt ? ` until ${fmtDate(l.availableAt)}` : ""}</td><td className="dim">{l.note ?? ""}</td><td>{l.orderName ?? ""}</td><td className="dim">{l.staffEmail ?? ""}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </Card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
