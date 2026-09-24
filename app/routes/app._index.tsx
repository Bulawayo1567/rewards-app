import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProgram } from "../lib/rewards/program.server";
import { fmtDate, fmtInt } from "../lib/rewards/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const program = await getProgram(shop);
  const since30 = new Date(Date.now() - 30 * 86_400_000);

  const [customers, outstanding, awarded30, redeemed30, tiers, recent] = await Promise.all([
    prisma.customer.count({ where: { shop } }),
    prisma.customer.aggregate({ where: { shop }, _sum: { balance: true } }),
    prisma.pointsLedger.aggregate({ where: { shop, points: { gt: 0 }, createdAt: { gte: since30 } }, _sum: { points: true } }),
    prisma.pointsLedger.aggregate({ where: { shop, type: "REDEEM", createdAt: { gte: since30 } }, _sum: { points: true } }),
    prisma.tier.count({ where: { shop } }),
    prisma.pointsLedger.findMany({
      where: { shop }, orderBy: { createdAt: "desc" }, take: 15,
      include: { customer: { select: { id: true, email: true, firstName: true, lastName: true } } },
    }),
  ]);

  return {
    program,
    stats: {
      customers,
      outstanding: outstanding._sum.balance ?? 0,
      awarded30: awarded30._sum.points ?? 0,
      redeemed30: Math.abs(redeemed30._sum.points ?? 0),
      tiers,
    },
    recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
};

export default function Dashboard() {
  const { program, stats, recent } = useLoaderData<typeof loader>();
  return (
    <s-page heading={program.name} inlineSize="large">
      {stats.tiers === 0 && (
        <s-banner tone="warning" heading="No tiers yet">
          Customers earn the base rate until you add tiers. <s-link href="/app/tiers">Set up tiers</s-link>
        </s-banner>
      )}
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
        <Stat label="Members" value={fmtInt(stats.customers)} />
        <Stat label="Points outstanding" value={fmtInt(stats.outstanding)} />
        <Stat label="Awarded (30d)" value={fmtInt(stats.awarded30)} />
        <Stat label="Redeemed (30d)" value={fmtInt(stats.redeemed30)} />
      </s-grid>

      <s-section heading="Recent activity" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Customer</s-table-header>
            <s-table-header>Type</s-table-header>
            <s-table-header format="numeric">Points</s-table-header>
            <s-table-header listSlot="secondary">Note</s-table-header>
            <s-table-header>When</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {recent.map((r) => (
              <s-table-row key={r.id}>
                <s-table-cell>
                  <s-link href={`/app/customers/${r.customer.id}`}>
                    {[r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ") || r.customer.email}
                  </s-link>
                </s-table-cell>
                <s-table-cell><s-badge tone={r.points < 0 ? "critical" : "success"}>{r.type}</s-badge></s-table-cell>
                <s-table-cell>{r.points > 0 ? `+${fmtInt(r.points)}` : fmtInt(r.points)}</s-table-cell>
                <s-table-cell>{r.note ?? ""}</s-table-cell>
                <s-table-cell>{fmtDate(r.createdAt)}</s-table-cell>
              </s-table-row>
            ))}
            {recent.length === 0 && (
              <s-table-row><s-table-cell>No activity yet.</s-table-cell></s-table-row>
            )}
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
