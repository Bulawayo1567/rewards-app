import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";
import { fmtDate, fmtInt, fmtMoney, str, num } from "../lib/rewards/format";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const customer = await prisma.customer.findFirst({
    where: { shop: session.shop, id: params.id },
    include: { tier: true, ledger: { orderBy: { createdAt: "desc" }, take: 100 }, redemptions: { orderBy: { createdAt: "desc" }, take: 20, include: { reward: true } } },
  });
  if (!customer) throw new Response("Not found", { status: 404 });
  return {
    customer: {
      ...customer,
      lifetimeSpend: Number(customer.lifetimeSpend),
      birthday: customer.birthday?.toISOString() ?? null,
      createdAt: customer.createdAt.toISOString(), updatedAt: customer.updatedAt.toISOString(),
      tierAssignedAt: customer.tierAssignedAt?.toISOString() ?? null,
      ledger: customer.ledger.map((l) => ({ ...l, createdAt: l.createdAt.toISOString(), availableAt: l.availableAt?.toISOString() ?? null, expiresAt: l.expiresAt?.toISOString() ?? null })),
      redemptions: customer.redemptions.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), expiresAt: r.expiresAt.toISOString(), reward: { ...r.reward, value: r.reward.value == null ? null : Number(r.reward.value), minOrderSubtotal: r.reward.minOrderSubtotal == null ? null : Number(r.reward.minOrderSubtotal), createdAt: r.reward.createdAt.toISOString(), updatedAt: r.reward.updatedAt.toISOString() } })),
    },
    shopifyAdminUrl: customer.shopifyId ? `shopify:admin/customers/${customer.shopifyId.split("/").pop()}` : null,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const points = Math.floor(num(fd, "points"));
  const note = str(fd, "note");
  if (!points) return { error: "Enter a non-zero amount" };
  if (!note) return { error: "A reason is required" };

  const customer = await prisma.customer.findFirst({ where: { shop, id: params.id } });
  if (!customer) throw new Response("Not found", { status: 404 });

  await prisma.pointsLedger.create({
    data: { shop, customerId: customer.id, type: "ADJUSTMENT", points, note, staffEmail: session.email ?? null },
  });
  const updated = await recalcCustomer(shop, customer.id);
  await syncCustomerMetafields(admin.graphql, updated);
  return { ok: true };
};

export default function CustomerDetail() {
  const { customer: c, shopifyAdminUrl } = useLoaderData<typeof loader>();
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;
  return (
    <s-page heading={name} inlineSize="large">
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

      <s-section heading="Adjust points">
        <Form method="post">
          <s-grid gridTemplateColumns="160px 1fr auto" gap="base" alignItems="end">
            <s-number-field name="points" label="Points (+ / −)" placeholder="250 or -100" required />
            <s-text-field name="note" label="Reason (shown in history)" placeholder="Goodwill for delayed order #1234" required />
            <s-button type="submit" variant="primary">Apply</s-button>
          </s-grid>
        </Form>
      </s-section>

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
            </s-table-header-row>
            <s-table-body>
              {c.redemptions.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{fmtDate(r.createdAt)}</s-table-cell>
                  <s-table-cell>{r.reward.name}</s-table-cell>
                  <s-table-cell><code>{r.discountCode}</code></s-table-cell>
                  <s-table-cell>{fmtInt(r.pointsSpent)}</s-table-cell>
                  <s-table-cell><s-badge>{r.status}</s-badge></s-table-cell>
                  <s-table-cell>{fmtDate(r.expiresAt)}</s-table-cell>
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
