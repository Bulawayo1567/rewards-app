import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";
import { redeemReward, reverseRedemption, RedeemError } from "../lib/rewards/redeem.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { fmtDate, fmtInt, fmtMoney, str, num } from "../lib/rewards/format";

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
  return (
    <s-page heading={name} inlineSize="large">
      {result?.error && <s-banner tone="critical" heading="Not applied">{result.error}</s-banner>}
      {result?.ok && <s-banner tone="success" heading="Done">{result.message}</s-banner>}

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
        <Stat label="Available" value={fmtInt(c.balance)} />
        <Stat label="Pending" value={fmtInt(c.pendingBalance)} />
        <Stat label="Lifetime points" value={fmtInt(c.lifetimePoints)} />
        <Stat label="Lifetime spend" value={fmtMoney(c.lifetimeSpend)} />
        <Stat label="Tier" value={c.tier?.name ?? "—"} />
      </s-grid>

      <s-section heading="Details">
        <s-paragraph>{c.email}{shopifyAdminUrl && <> · <s-link href={shopifyAdminUrl}>Open in Shopify customers</s-link></>}</s-paragraph>
        <s-paragraph>Birthday: {c.birthday ? c.birthday.slice(5, 10) : "not set"} · Newsletter bonus: {c.newsletterAwarded ? "granted" : "no"} · Signup bonus: {c.signupAwarded ? "granted" : "no"}</s-paragraph>
      </s-section>

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(320px, 1fr))" gap="base">
        <s-section heading="Adjust points">
          <Form method="post">
            <input type="hidden" name="intent" value="adjust" />
            <s-number-field name="points" label="Points (+ / −)" placeholder="250 or -100" required />
            <s-text-field name="note" label="Reason (shown in history)" placeholder="Goodwill for delayed order #1234" required />
            <s-button type="submit" variant="primary">Apply</s-button>
          </Form>
        </s-section>

        <s-section heading="Redeem on their behalf">
          <Form method="post">
            <input type="hidden" name="intent" value="redeem" />
            <s-select name="rewardId" label="Reward">
              {rewards.map((r) => <s-option key={r.id} value={r.id} disabled={r.pointsCost > c.balance}>{r.name} — {fmtInt(r.pointsCost)} pts</s-option>)}
            </s-select>
            <s-paragraph>Mints a single-use code locked to this customer and deducts the points. Give them the code in store or by email.</s-paragraph>
            <s-button type="submit" variant="primary" disabled={rewards.length === 0}>Redeem</s-button>
          </Form>
        </s-section>
      </s-grid>

      {c.redemptions.length > 0 && (
        <s-section heading="Redemptions" padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header>When</s-table-header>
              <s-table-header listSlot="primary">Reward</s-table-header>
              <s-table-header>Code</s-table-header>
              <s-table-header format="numeric">Points</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Expires</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {c.redemptions.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{fmtDate(r.createdAt)}</s-table-cell>
                  <s-table-cell>{r.name}</s-table-cell>
                  <s-table-cell><code>{r.discountCode}</code></s-table-cell>
                  <s-table-cell>{fmtInt(r.pointsSpent)}</s-table-cell>
                  <s-table-cell><s-badge tone={r.status === "USED" ? "success" : r.status === "REVERSED" ? "critical" : "info"}>{r.status}</s-badge></s-table-cell>
                  <s-table-cell>{fmtDate(r.expiresAt)}</s-table-cell>
                  <s-table-cell>
                    {r.status !== "REVERSED" && (
                      <Form method="post" onSubmit={(e) => { if (!confirm(`Reverse ${r.discountCode}? Points are returned and the code is deactivated.`)) e.preventDefault(); }}>
                        <input type="hidden" name="intent" value="reverse" /><input type="hidden" name="redemptionId" value={r.id} />
                        <s-button type="submit" tone="critical" variant="tertiary">Reverse</s-button>
                      </Form>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-section heading="History" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header>When</s-table-header>
            <s-table-header>Type</s-table-header>
            <s-table-header format="numeric">Points</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header listSlot="primary">Note</s-table-header>
            <s-table-header>Order</s-table-header>
            <s-table-header>By</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {c.ledger.map((l) => (
              <s-table-row key={l.id}>
                <s-table-cell>{fmtDate(l.createdAt)}</s-table-cell>
                <s-table-cell><s-badge tone={l.points < 0 ? "critical" : "success"}>{l.type}</s-badge></s-table-cell>
                <s-table-cell>{l.points > 0 ? `+${fmtInt(l.points)}` : fmtInt(l.points)}</s-table-cell>
                <s-table-cell>{l.status}{l.status === "PENDING" && l.availableAt ? ` until ${fmtDate(l.availableAt)}` : ""}</s-table-cell>
                <s-table-cell>{l.note ?? ""}</s-table-cell>
                <s-table-cell>{l.orderName ?? ""}</s-table-cell>
                <s-table-cell>{l.staffEmail ?? ""}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
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
