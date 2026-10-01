import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProgram } from "../lib/rewards/program.server";
import { fmtDate, fmtInt, fmtMoney } from "../lib/rewards/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const program = await getProgram(shop);
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d90 = new Date(now.getTime() - 90 * 86_400_000);
  const d7 = new Date(now.getTime() + 7 * 86_400_000);

  const [
    members, newMembers, outstanding, pendingPts, awarded30, redeemed30, redemptions30, orders30,
    activeCodes, expiringCodes, plays30, liveCampaign, tiers, tierCounts, topRewards, negative, recent, daily,
  ] = await Promise.all([
    prisma.customer.count({ where: { shop } }),
    prisma.customer.count({ where: { shop, createdAt: { gte: d30 } } }),
    prisma.customer.aggregate({ where: { shop }, _sum: { balance: true } }),
    prisma.customer.aggregate({ where: { shop }, _sum: { pendingBalance: true } }),
    prisma.pointsLedger.aggregate({ where: { shop, points: { gt: 0 }, type: { not: "MIGRATION" }, createdAt: { gte: d30 } }, _sum: { points: true } }),
    prisma.pointsLedger.aggregate({ where: { shop, type: "REDEEM", createdAt: { gte: d30 } }, _sum: { points: true } }),
    prisma.redemption.count({ where: { shop, createdAt: { gte: d30 } } }),
    prisma.pointsLedger.count({ where: { shop, type: "ORDER", createdAt: { gte: d30 } } }),
    prisma.redemption.count({ where: { shop, status: "ISSUED", expiresAt: { gt: now } } }),
    prisma.redemption.findMany({ where: { shop, status: "ISSUED", expiresAt: { gt: now, lte: d7 } }, include: { customer: true, reward: true }, orderBy: { expiresAt: "asc" }, take: 10 }),
    prisma.campaignPlay.count({ where: { shop, createdAt: { gte: d30 } } }),
    prisma.campaign.findFirst({ where: { shop, active: true }, select: { id: true, name: true, kind: true } }),
    prisma.tier.findMany({ where: { shop }, orderBy: { rank: "asc" } }),
    prisma.customer.groupBy({ by: ["tierId"], where: { shop }, _count: { _all: true } }),
    prisma.redemption.groupBy({ by: ["rewardId"], where: { shop, createdAt: { gte: d90 }, status: { not: "REVERSED" } }, _count: { _all: true }, orderBy: { _count: { rewardId: "desc" } }, take: 5 }),
    prisma.customer.findMany({ where: { shop, balance: { lt: 0 } }, orderBy: { balance: "asc" }, take: 10 }),
    prisma.pointsLedger.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 12, include: { customer: { select: { id: true, email: true, firstName: true, lastName: true } } } }),
    prisma.pointsLedger.findMany({ where: { shop, createdAt: { gte: d30 }, type: { in: ["ORDER", "BIRTHDAY", "NEWSLETTER", "SIGNUP", "REVIEW", "REFERRAL", "CAMPAIGN", "ADJUSTMENT", "REDEEM"] } }, select: { createdAt: true, points: true, type: true } }),
  ]);

  const rewardNames = await prisma.reward.findMany({ where: { id: { in: topRewards.map((r) => r.rewardId) } }, select: { id: true, name: true } });

  // near next tier (lifetime-points tiers only; cheap to compute)
  const nearTier: { id: string; name: string; tier: string; needed: number }[] = [];
  for (let i = 0; i < tiers.length - 1; i++) {
    const next = tiers[i + 1];
    if (next.basis !== "LIFETIME_POINTS") continue;
    const th = Number(next.threshold);
    const rows = await prisma.customer.findMany({ where: { shop, tierId: tiers[i].id, lifetimePoints: { gte: Math.floor(th * 0.9), lt: th } }, take: 10, orderBy: { lifetimePoints: "desc" } });
    for (const c of rows) nearTier.push({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email, tier: next.name, needed: th - c.lifetimePoints });
  }

  // daily series
  const days: { label: string; awarded: number; redeemed: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    days.push({ label: d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }), awarded: 0, redeemed: 0 });
  }
  for (const r of daily) {
    const idx = 29 - Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000);
    if (idx < 0 || idx > 29) continue;
    if (r.type === "REDEEM") days[idx].redeemed += Math.abs(r.points); else if (r.points > 0) days[idx].awarded += r.points;
  }

  const pointValue = Number(program.pointValueCents ?? 1) / 100;
  const tierMix = [{ id: null as string | null, name: "No tier", count: tierCounts.find((t) => t.tierId === null)?._count._all ?? 0 }, ...tiers.map((t) => ({ id: t.id, name: t.name, count: tierCounts.find((x) => x.tierId === t.id)?._count._all ?? 0 }))];

  return {
    program: { name: program.name, active: program.active, pointsName: program.pointsName },
    liveCampaign,
    kpis: {
      members, newMembers, outstanding: outstanding._sum.balance ?? 0, pending: pendingPts._sum.pendingBalance ?? 0,
      liability: (outstanding._sum.balance ?? 0) * pointValue,
      awarded30: awarded30._sum.points ?? 0, redeemed30: Math.abs(redeemed30._sum.points ?? 0),
      redemptions30, orders30, activeCodes, plays30,
      redemptionRate: orders30 ? Math.round((redemptions30 / orders30) * 100) : 0,
    },
    days, tierMix,
    topRewards: topRewards.map((r) => ({ name: rewardNames.find((n) => n.id === r.rewardId)?.name ?? "(deleted)", count: r._count._all })),
    attention: {
      expiring: expiringCodes.map((r) => ({ id: r.id, customerId: r.customerId, who: [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ") || r.customer.email, reward: r.reward.name, code: r.discountCode, expiresAt: r.expiresAt.toISOString() })),
      negative: negative.map((c) => ({ id: c.id, who: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email, balance: c.balance })),
      nearTier,
    },
    recent: recent.map((r) => ({ id: r.id, type: r.type, points: r.points, note: r.note, createdAt: r.createdAt.toISOString(), customer: r.customer })),
  };
};

export default function Dashboard() {
  const { program, liveCampaign, kpis, days, tierMix, topRewards, attention, recent } = useLoaderData<typeof loader>();
  const maxDay = Math.max(1, ...days.map((d) => Math.max(d.awarded, d.redeemed)));
  const maxTier = Math.max(1, ...tierMix.map((t) => t.count));
  const attnCount = attention.expiring.length + attention.negative.length + attention.nearTier.length;

  return (
    <s-page heading={program.name} inlineSize="large">
      {/* Health strip */}
      <s-banner tone={program.active ? "success" : "warning"} heading={program.active ? "Program is live" : "Program is paused — no points are being awarded"}>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-text>{liveCampaign ? `Pop-up live: ${liveCampaign.name}` : "No pop-up campaign is live"}</s-text>
          <s-link href="/app/settings">Settings</s-link>
          <s-link href="/app/campaigns">Campaigns</s-link>
        </s-stack>
      </s-banner>

      {/* Quick lookup + actions */}
      <s-section>
        <Form method="get" action="/app/customers">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field name="q" label="Find a member" placeholder="Email or name" />
            <s-button type="submit" variant="primary">Look up</s-button>
            <s-button href="/app/customers">All members</s-button>
            <s-button href="/app/campaigns">New campaign</s-button>
            <s-button href="/app/import">Import</s-button>
          </s-stack>
        </Form>
      </s-section>

      {/* KPIs */}
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(170px, 1fr))" gap="base">
        <Stat label="Members" value={fmtInt(kpis.members)} sub={`+${fmtInt(kpis.newMembers)} in 30d`} />
        <Stat label={`${program.pointsName} outstanding`} value={fmtInt(kpis.outstanding)} sub={`${fmtMoney(kpis.liability)} liability${kpis.pending ? ` · ${fmtInt(kpis.pending)} pending` : ""}`} />
        <Stat label="Awarded (30d)" value={fmtInt(kpis.awarded30)} sub={`${fmtInt(kpis.orders30)} orders`} />
        <Stat label="Redeemed (30d)" value={fmtInt(kpis.redeemed30)} sub={`${fmtInt(kpis.redemptions30)} redemptions · ${kpis.redemptionRate}% of orders`} />
        <Stat label="Active codes" value={fmtInt(kpis.activeCodes)} sub={`${attention.expiring.length} expiring this week`} />
        <Stat label="Pop-up plays (30d)" value={fmtInt(kpis.plays30)} sub={liveCampaign ? liveCampaign.kind.toLowerCase() : "no live campaign"} />
      </s-grid>

      {/* Chart */}
      <s-section heading={`${program.pointsName} awarded vs redeemed — last 30 days`}>
        <svg viewBox="0 0 900 220" width="100%" style={{ display: "block" }} role="img" aria-label="Daily points awarded and redeemed">
          {days.map((d, i) => {
            const x = 20 + i * 29, ah = (d.awarded / maxDay) * 170, rh = (d.redeemed / maxDay) * 170;
            return (
              <g key={d.label}>
                <rect x={x} y={190 - ah} width={12} height={ah} fill="#c60d11" rx="2"><title>{d.label}: +{fmtInt(d.awarded)}</title></rect>
                <rect x={x + 13} y={190 - rh} width={12} height={rh} fill="#1f1f1f" rx="2"><title>{d.label}: −{fmtInt(d.redeemed)}</title></rect>
                {i % 5 === 0 && <text x={x + 12} y={210} fontSize="10" textAnchor="middle" fill="#666">{d.label}</text>}
              </g>
            );
          })}
          <line x1="20" y1="190" x2="890" y2="190" stroke="#ddd" />
        </svg>
        <s-stack direction="inline" gap="base"><s-badge tone="critical">Awarded</s-badge><s-badge>Redeemed</s-badge></s-stack>
      </s-section>

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(320px, 1fr))" gap="base">
        {/* Tier mix */}
        <s-section heading="Tier mix">
          {tierMix.map((t) => (
            <s-stack key={t.id ?? "none"} gap="none">
              <s-stack direction="inline" justifyContent="space-between"><s-text>{t.name}</s-text><s-text emphasis="bold">{fmtInt(t.count)}</s-text></s-stack>
              <div style={{ height: 8, background: "#eee", borderRadius: 4, marginBottom: 10 }}><div style={{ width: `${(t.count / maxTier) * 100}%`, height: "100%", background: "#c60d11", borderRadius: 4 }} /></div>
            </s-stack>
          ))}
          <s-link href="/app/tiers">Manage tiers</s-link>
        </s-section>

        {/* Top rewards */}
        <s-section heading="Top rewards (90d)">
          {topRewards.length === 0 ? <s-text color="subdued">No redemptions yet.</s-text> : topRewards.map((r) => (
            <s-stack key={r.name} direction="inline" justifyContent="space-between"><s-text>{r.name}</s-text><s-text emphasis="bold">{fmtInt(r.count)}</s-text></s-stack>
          ))}
          <s-link href="/app/rewards">Manage rewards</s-link>
        </s-section>
      </s-grid>

      {/* Attention */}
      <s-section heading={`Needs attention${attnCount ? ` (${attnCount})` : ""}`}>
        {attnCount === 0 && <s-text color="subdued">Nothing outstanding.</s-text>}
        {attention.nearTier.length > 0 && (
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>Close to the next tier — worth a nudge</s-heading>
            {attention.nearTier.map((c) => <s-paragraph key={c.id}><s-link href={`/app/customers/${c.id}`}>{c.name}</s-link> needs {fmtInt(c.needed)} more for <b>{c.tier}</b></s-paragraph>)}
          </s-box>
        )}
        {attention.expiring.length > 0 && (
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>Codes expiring within 7 days</s-heading>
            {attention.expiring.map((r) => <s-paragraph key={r.id}><s-link href={`/app/customers/${r.customerId}`}>{r.who}</s-link> — {r.reward} <code>{r.code}</code> · {fmtDate(r.expiresAt)}</s-paragraph>)}
          </s-box>
        )}
        {attention.negative.length > 0 && (
          <s-box padding="base" border="base" borderRadius="base">
            <s-heading>Negative balances (refund clawbacks)</s-heading>
            {attention.negative.map((c) => <s-paragraph key={c.id}><s-link href={`/app/customers/${c.id}`}>{c.who}</s-link> · {fmtInt(c.balance)}</s-paragraph>)}
          </s-box>
        )}
      </s-section>

      {/* Recent activity */}
      <s-section heading="Recent activity" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Member</s-table-header>
            <s-table-header>Type</s-table-header>
            <s-table-header format="numeric">Points</s-table-header>
            <s-table-header listSlot="secondary">Note</s-table-header>
            <s-table-header>When</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {recent.map((r) => (
              <s-table-row key={r.id}>
                <s-table-cell><s-link href={`/app/customers/${r.customer.id}`}>{[r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ") || r.customer.email}</s-link></s-table-cell>
                <s-table-cell><s-badge tone={r.points < 0 ? "critical" : "success"}>{r.type}</s-badge></s-table-cell>
                <s-table-cell>{r.points > 0 ? `+${fmtInt(r.points)}` : fmtInt(r.points)}</s-table-cell>
                <s-table-cell>{r.note ?? ""}</s-table-cell>
                <s-table-cell>{fmtDate(r.createdAt)}</s-table-cell>
              </s-table-row>
            ))}
            {recent.length === 0 && <s-table-row><s-table-cell>No activity yet.</s-table-cell></s-table-row>}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <s-box padding="base" background="subdued" border="base" borderRadius="base">
      <s-text color="subdued">{label}</s-text>
      <s-heading>{value}</s-heading>
      {sub && <s-text color="subdued">{sub}</s-text>}
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
