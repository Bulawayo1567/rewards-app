import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { fmtDate, fmtInt } from "../lib/rewards/format";
import { Hero, UIStyles } from "../lib/rewards/ui";

const d90 = () => new Date(Date.now() - 90 * 86_400_000);
// "Activity" = a real points event (orders, redemptions, bonuses, adjustments) — not imports or record edits.
const realActivity = { type: { not: "MIGRATION" as const } };

const SEGMENTS: Record<string, { label: string; where: (shop: string) => any; order: any }> = {
  top: { label: "Top balances", where: (shop) => ({ shop, balance: { gt: 0 } }), order: { balance: "desc" } },
  dormant: { label: "Dormant with points", where: (shop) => ({ shop, balance: { gt: 0 }, ledger: { none: { ...realActivity, createdAt: { gte: d90() } } } }), order: { balance: "desc" } },
  pending: { label: "Pending points", where: (shop) => ({ shop, pendingBalance: { gt: 0 } }), order: { pendingBalance: "desc" } },
  negative: { label: "Negative balances", where: (shop) => ({ shop, balance: { lt: 0 } }), order: { balance: "asc" } },
  noaccount: { label: "No Shopify account yet", where: (shop) => ({ shop, shopifyId: null }), order: { balance: "desc" } },
  birthdays: { label: "Birthday on file", where: (shop) => ({ shop, birthday: { not: null } }), order: { birthday: "asc" } },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const seg = url.searchParams.get("segment") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const take = 50;
  const s = SEGMENTS[seg];
  const where = s ? s.where(shop) : {
    shop,
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, all, customers, ...segCounts] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.count({ where: { shop } }),
    prisma.customer.findMany({ where, include: { tier: true }, orderBy: s ? s.order : { lifetimePoints: "desc" }, skip: (page - 1) * take, take }),
    ...Object.values(SEGMENTS).map((x) => prisma.customer.count({ where: x.where(shop) })),
  ]);
  const last = customers.length
    ? await prisma.pointsLedger.groupBy({ by: ["customerId"], where: { shop, customerId: { in: customers.map((c) => c.id) }, ...realActivity }, _max: { createdAt: true } })
    : [];
  const lastMap = new Map(last.map((l) => [l.customerId, l._max.createdAt?.toISOString() ?? null]));
  return {
    q, seg, segLabel: s?.label ?? "", page, pages: Math.max(1, Math.ceil(total / take)), total, all,
    segments: Object.entries(SEGMENTS).map(([k, v], i) => ({ key: k, label: v.label, count: segCounts[i] as number })),
    customers: customers.map((c) => ({ id: c.id, email: c.email, name: [c.firstName, c.lastName].filter(Boolean).join(" "), balance: c.balance, pending: c.pendingBalance, lifetime: c.lifetimePoints, tier: c.tier?.name ?? null, linked: !!c.shopifyId, last: lastMap.get(c.id) ?? null })),
  };
};

export default function Customers() {
  const { q, seg, segLabel, page, pages, total, all, segments, customers } = useLoaderData<typeof loader>();
  const link = (p: number) => `/app/customers?${new URLSearchParams({ ...(q ? { q } : {}), ...(seg ? { segment: seg } : {}), page: String(p) })}`;
  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title={segLabel || "Members"} sub={<>{fmtInt(total)} {segLabel || q ? "matching" : "members"}{segLabel || q ? ` of ${fmtInt(all)}` : ""}</>} />

      <div className="aas-panel">
        <div className="aas-bar">
          <Form method="get" className="aas-find">
            <s-text-field name="q" label="Search members" labelAccessibilityVisibility="exclusive" placeholder="Search by email or name" defaultValue={q} />
            <s-button type="submit" variant="primary">Search</s-button>
          </Form>
          <div className="aas-actions">
            <s-button href="/app/export/members" target="_top">Export CSV</s-button>
          </div>
        </div>
        <div className="aas-chips">
          <a href="/app/customers" className={`aas-chip${!seg ? " on" : ""}`}>All <span className="c">{fmtInt(all)}</span></a>
          {segments.map((x) => (
            <a key={x.key} href={`/app/customers?segment=${x.key}`} className={`aas-chip${seg === x.key ? " on" : ""}`}>{x.label} <span className="c">{fmtInt(x.count)}</span></a>
          ))}
        </div>
      </div>

      <div className="aas-panel">
        <div className="aas-tblwrap">
          <table className="aas-tbl">
            <thead><tr><th>Member</th><th>Email</th><th>Tier</th><th className="num">Balance</th><th className="num">Pending</th><th className="num">Lifetime</th><th>Account</th><th>Last activity</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td><s-link href={`/app/customers/${c.id}`}>{c.name || "(no name)"}</s-link></td>
                  <td className="dim">{c.email}</td>
                  <td>{c.tier ? <span className="aas-pill tier">{c.tier}</span> : <span className="aas-muted">—</span>}</td>
                  <td className="num"><b>{fmtInt(c.balance)}</b></td>
                  <td className="num dim">{fmtInt(c.pending)}</td>
                  <td className="num dim">{fmtInt(c.lifetime)}</td>
                  <td>{c.linked ? <span className="aas-pill">linked</span> : <span className="aas-pill warn">not yet</span>}</td>
                  <td className="dim" style={{ whiteSpace: "nowrap" }}>{c.last ? fmtDate(c.last) : "—"}</td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={8} className="aas-muted">No members found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="aas-pager">
          <span className="aas-muted">Page {page} of {pages}</span>
          <div className="aas-actions">
            <s-button href={link(page - 1)} disabled={page <= 1}>Previous</s-button>
            <s-button href={link(page + 1)} disabled={page >= pages}>Next</s-button>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
