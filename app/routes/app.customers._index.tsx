import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { fmtDate, fmtInt } from "../lib/rewards/format";

const SEGMENTS: Record<string, { label: string; where: (shop: string) => any; order: any }> = {
  top: { label: "Top balances", where: (shop) => ({ shop, balance: { gt: 0 } }), order: { balance: "desc" } },
  dormant: { label: "Dormant with points (no activity 90d)", where: (shop) => ({ shop, balance: { gt: 0 }, updatedAt: { lt: new Date(Date.now() - 90 * 86_400_000) } }), order: { balance: "desc" } },
  pending: { label: "Holding pending points", where: (shop) => ({ shop, pendingBalance: { gt: 0 } }), order: { pendingBalance: "desc" } },
  negative: { label: "Negative balances", where: (shop) => ({ shop, balance: { lt: 0 } }), order: { balance: "asc" } },
  noaccount: { label: "No Shopify account yet", where: (shop) => ({ shop, shopifyId: null }), order: { balance: "desc" } },
  birthdays: { label: "Birthday on file", where: (shop) => ({ shop, birthday: { not: null } }), order: { birthday: "asc" } },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const seg = url.searchParams.get("segment") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const take = 50;
  const s = SEGMENTS[seg];
  const where = s ? s.where(session.shop) : {
    shop: session.shop,
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({ where, include: { tier: true }, orderBy: s ? s.order : { updatedAt: "desc" }, skip: (page - 1) * take, take }),
  ]);
  return {
    q, seg, segLabel: s?.label ?? "", page, pages: Math.max(1, Math.ceil(total / take)), total,
    segments: Object.entries(SEGMENTS).map(([k, v]) => ({ key: k, label: v.label })),
    customers: customers.map((c) => ({ id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName, balance: c.balance, pendingBalance: c.pendingBalance, lifetimePoints: c.lifetimePoints, tier: c.tier ? { name: c.tier.name } : null, shopifyId: c.shopifyId, updatedAt: c.updatedAt.toISOString() })),
  };
};

export default function Customers() {
  const { q, seg, segLabel, page, pages, total, segments, customers } = useLoaderData<typeof loader>();
  const link = (p: number) => `/app/customers?${new URLSearchParams({ ...(q ? { q } : {}), ...(seg ? { segment: seg } : {}), page: String(p) })}`;
  return (
    <s-page heading={segLabel || "Members"} inlineSize="large">
      <s-section>
        <Form method="get">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field name="q" label="Search by email or name" defaultValue={q} />
            <s-button type="submit">Search</s-button>
            <s-button href="/app/export/members" target="_top">Export CSV</s-button>
          </s-stack>
        </Form>
        <s-stack direction="inline" gap="small" style={{ marginTop: 10 }}>
          <s-button href="/app/customers" variant={!seg ? "primary" : "secondary"}>All</s-button>
          {segments.map((x) => <s-button key={x.key} href={`/app/customers?segment=${x.key}`} variant={seg === x.key ? "primary" : "secondary"}>{x.label}</s-button>)}
        </s-stack>
      </s-section>
      <s-section padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Member</s-table-header>
            <s-table-header>Email</s-table-header>
            <s-table-header>Tier</s-table-header>
            <s-table-header format="numeric">Balance</s-table-header>
            <s-table-header format="numeric">Pending</s-table-header>
            <s-table-header format="numeric">Lifetime</s-table-header>
            <s-table-header>Account</s-table-header>
            <s-table-header>Last activity</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {customers.map((c) => (
              <s-table-row key={c.id}>
                <s-table-cell><s-link href={`/app/customers/${c.id}`}>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "(no name)"}</s-link></s-table-cell>
                <s-table-cell>{c.email}</s-table-cell>
                <s-table-cell>{c.tier ? <s-badge>{c.tier.name}</s-badge> : "—"}</s-table-cell>
                <s-table-cell>{fmtInt(c.balance)}</s-table-cell>
                <s-table-cell>{fmtInt(c.pendingBalance)}</s-table-cell>
                <s-table-cell>{fmtInt(c.lifetimePoints)}</s-table-cell>
                <s-table-cell>{c.shopifyId ? <s-badge tone="success">linked</s-badge> : <s-badge tone="warning">not yet</s-badge>}</s-table-cell>
                <s-table-cell>{fmtDate(c.updatedAt)}</s-table-cell>
              </s-table-row>
            ))}
            {customers.length === 0 && <s-table-row><s-table-cell>No members found.</s-table-cell></s-table-row>}
          </s-table-body>
        </s-table>
      </s-section>
      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-text color="subdued">{fmtInt(total)} members · page {page} of {pages}</s-text>
          <s-stack direction="inline" gap="small">
            <s-button href={link(page - 1)} disabled={page <= 1}>Previous</s-button>
            <s-button href={link(page + 1)} disabled={page >= pages}>Next</s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
