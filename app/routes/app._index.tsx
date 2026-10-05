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
  const url = new URL(request.url);
  const range = [7, 30, 90].includes(Number(url.searchParams.get("range"))) ? Number(url.searchParams.get("range")) : 30;
  const now = new Date();
  const since = new Date(now.getTime() - range * 86_400_000);
  const d90 = new Date(now.getTime() - 90 * 86_400_000);
  const d7 = new Date(now.getTime() + 7 * 86_400_000);
  const pointValue = Number(program.pointValueCents ?? 1) / 100;

  const [
    members, newMembers, outstanding, pendingPts, awarded, redeemed, redemptions, orders,
    codesIssued, codesUsed, activeCodes, expiringCodes, plays, playsWithCode, playCodesUsed, liveCampaign,
    tiers, tierAgg, rewardsCount, earnRulesCount, topRewards, negative, recent, daily,
    segTop, segDormant, segPending, segNegative, segNoAccount, migratedCount, ruleCount, campaignCount,
  ] = await Promise.all([
    prisma.customer.count({ where: { shop } }),
    prisma.customer.count({ where: { shop, createdAt: { gte: since } } }),
    prisma.customer.aggregate({ where: { shop }, _sum: { balance: true } }),
    prisma.customer.aggregate({ where: { shop }, _sum: { pendingBalance: true } }),
    prisma.pointsLedger.aggregate({ where: { shop, points: { gt: 0 }, type: { notIn: ["MIGRATION", "REDEEM_REVERSAL"] }, createdAt: { gte: since } }, _sum: { points: true } }),
    prisma.pointsLedger.aggregate({ where: { shop, type: "REDEEM", createdAt: { gte: since } }, _sum: { points: true } }),
    prisma.redemption.count({ where: { shop, createdAt: { gte: since } } }),
    prisma.pointsLedger.count({ where: { shop, type: "ORDER", createdAt: { gte: since } } }),
    prisma.redemption.count({ where: { shop, createdAt: { gte: since } } }),
    prisma.redemption.count({ where: { shop, createdAt: { gte: since }, status: "USED" } }),
    prisma.redemption.count({ where: { shop, status: "ISSUED", expiresAt: { gt: now } } }),
    prisma.redemption.findMany({ where: { shop, status: "ISSUED", expiresAt: { gt: now, lte: d7 } }, include: { customer: true, reward: true }, orderBy: { expiresAt: "asc" }, take: 10 }),
    prisma.campaignPlay.count({ where: { shop, createdAt: { gte: since } } }),
    prisma.campaignPlay.count({ where: { shop, createdAt: { gte: since }, discountCode: { not: null } } }),
    prisma.campaignPlay.count({ where: { shop, createdAt: { gte: since }, discountCode: { not: null }, customer: { ledger: { some: { type: "ORDER", createdAt: { gte: since } } } } } }),
    prisma.campaign.findFirst({ where: { shop, active: true }, select: { id: true, name: true, kind: true } }),
    prisma.tier.findMany({ where: { shop }, orderBy: { rank: "asc" } }),
    prisma.customer.groupBy({ by: ["tierId"], where: { shop }, _count: { _all: true }, _sum: { balance: true } }),
    prisma.reward.count({ where: { shop, active: true } }),
    prisma.earnRule.count({ where: { shop, active: true, points: { gt: 0 } } }),
    prisma.redemption.groupBy({ by: ["rewardId"], where: { shop, createdAt: { gte: d90 }, status: { not: "REVERSED" } }, _count: { _all: true }, orderBy: { _count: { rewardId: "desc" } }, take: 5 }),
    prisma.customer.findMany({ where: { shop, balance: { lt: 0 } }, orderBy: { balance: "asc" }, take: 10 }),
    prisma.pointsLedger.findMany({ where: { shop, type: { not: "MIGRATION" } }, orderBy: { createdAt: "desc" }, take: 12, include: { customer: { select: { id: true, email: true, firstName: true, lastName: true } } } }),
    prisma.pointsLedger.findMany({ where: { shop, createdAt: { gte: since }, type: { notIn: ["MIGRATION", "EXPIRY", "ORDER_REVERSAL", "REDEEM_REVERSAL"] } }, select: { createdAt: true, points: true, type: true } }),
    prisma.customer.count({ where: { shop, balance: { gt: 0 } } }),
    prisma.customer.count({ where: { shop, balance: { gt: 0 }, updatedAt: { lt: d90 } } }),
    prisma.customer.count({ where: { shop, pendingBalance: { gt: 0 } } }),
    prisma.customer.count({ where: { shop, balance: { lt: 0 } } }),
    prisma.customer.count({ where: { shop, shopifyId: null } }),
    prisma.importBatch.count({ where: { shop, status: "COMMITTED" } }),
    prisma.productRule.count({ where: { shop, active: true } }),
    prisma.campaign.count({ where: { shop } }),
  ]);

  const rewardNames = await prisma.reward.findMany({ where: { id: { in: topRewards.map((r) => r.rewardId) } }, select: { id: true, name: true } });

  const nearTier: { id: string; name: string; tier: string; needed: number }[] = [];
  for (let i = 0; i < tiers.length - 1; i++) {
    const next = tiers[i + 1];
    if (next.basis !== "LIFETIME_POINTS") continue;
    const th = Number(next.threshold);
    const rows = await prisma.customer.findMany({ where: { shop, tierId: tiers[i].id, lifetimePoints: { gte: Math.floor(th * 0.9), lt: th } }, take: 8, orderBy: { lifetimePoints: "desc" } });
    for (const c of rows) nearTier.push({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email, tier: next.name, needed: th - c.lifetimePoints });
  }

  const bucket = range === 90 ? 3 : 1;
  const n = Math.ceil(range / bucket);
  const days: { label: string; awarded: number; redeemed: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * bucket * 86_400_000);
    days.push({ label: d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }), awarded: 0, redeemed: 0 });
  }
  for (const r of daily) {
    const idx = n - 1 - Math.floor((now.getTime() - r.createdAt.getTime()) / (bucket * 86_400_000));
    if (idx < 0 || idx >= n) continue;
    if (r.type === "REDEEM") days[idx].redeemed += Math.abs(r.points); else if (r.points > 0) days[idx].awarded += r.points;
  }

  const tierMix = [
    { id: null as string | null, name: "No tier", count: tierAgg.find((t) => t.tierId === null)?._count._all ?? 0, points: tierAgg.find((t) => t.tierId === null)?._sum.balance ?? 0 },
    ...tiers.map((t) => ({ id: t.id, name: t.name, count: tierAgg.find((x) => x.tierId === t.id)?._count._all ?? 0, points: tierAgg.find((x) => x.tierId === t.id)?._sum.balance ?? 0 })),
  ].map((t) => ({ ...t, liability: t.points * pointValue }));

  const checklist = [
    { ok: tiers.length > 0, label: "Create your tiers", href: "/app/tiers" },
    { ok: rewardsCount > 0, label: "Add at least one reward", href: "/app/rewards" },
    { ok: earnRulesCount > 0, label: "Set bonus ways to earn (signup, newsletter, birthday)", href: "/app/earn-rules" },
    { ok: Number(program.pointValueCents ?? 0) > 0, label: "Set what a point is worth", href: "/app/settings" },
    { ok: migratedCount > 0, label: "Import Smile.io balances", href: "/app/import" },
    { ok: program.active, label: "Switch the program on", href: "/app/settings" },
    { ok: !!liveCampaign, label: "Launch a pop-up campaign", href: "/app/campaigns" },
  ];

  const tiles = [
    { href: "/app/customers", icon: "🧵", label: "Members", sub: `${fmtInt(members)} total` },
    { href: "/app/tiers", icon: "🏷️", label: "Tiers", sub: tiers.length ? tiers.map((t) => t.name).join(" · ") : "none yet" },
    { href: "/app/earn-rules", icon: "🪡", label: "Ways to earn", sub: `${earnRulesCount} bonus rules` },
    { href: "/app/product-rules", icon: "📏", label: "Product rules", sub: `${ruleCount} active` },
    { href: "/app/rewards", icon: "🎁", label: "Rewards", sub: `${rewardsCount} active` },
    { href: "/app/campaigns", icon: "🎡", label: "Campaigns", sub: liveCampaign ? `live: ${liveCampaign.name}` : `${campaignCount} saved` },
    { href: "/app/import", icon: "📥", label: "Import", sub: migratedCount ? `${migratedCount} batch${migratedCount > 1 ? "es" : ""} done` : "Smile.io" },
    { href: "/app/settings", icon: "⚙️", label: "Settings", sub: `${program.pointsPerDollar} pt/$ · ${Number(program.pointValueCents ?? 1)}¢/pt` },
  ];

  return {
    range, tiles,
    program: { name: program.name, active: program.active, pointsName: program.pointsName, pointValue },
    liveCampaign,
    checklist,
    kpis: {
      members, newMembers, outstanding: outstanding._sum.balance ?? 0, pending: pendingPts._sum.pendingBalance ?? 0,
      liability: (outstanding._sum.balance ?? 0) * pointValue,
      awarded: awarded._sum.points ?? 0, redeemed: Math.abs(redeemed._sum.points ?? 0), redemptions, orders,
      redemptionRate: orders ? Math.round((redemptions / orders) * 100) : 0,
      codesIssued, codesUsed, codeUseRate: codesIssued ? Math.round((codesUsed / codesIssued) * 100) : 0, activeCodes,
      plays, playsWithCode, playCodesUsed,
    },
    days, tierMix,
    segments: [
      { key: "top", label: "Members with points", count: segTop },
      { key: "dormant", label: "Dormant, holding points", count: segDormant },
      { key: "pending", label: "Pending points", count: segPending },
      { key: "noaccount", label: "No Shopify account yet", count: segNoAccount },
      { key: "negative", label: "Negative balances", count: segNegative },
    ],
    topRewards: topRewards.map((r) => ({ name: rewardNames.find((x) => x.id === r.rewardId)?.name ?? "(deleted)", count: r._count._all })),
    attention: {
      expiring: expiringCodes.map((r) => ({ id: r.id, customerId: r.customerId, who: [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ") || r.customer.email, reward: r.reward.name, code: r.discountCode, expiresAt: r.expiresAt.toISOString() })),
      negative: negative.map((c) => ({ id: c.id, who: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email, balance: c.balance })),
      nearTier,
    },
    recent: recent.map((r) => ({ id: r.id, type: r.type, points: r.points, note: r.note, createdAt: r.createdAt.toISOString(), customer: r.customer })),
  };
};

export default function Dashboard() {
  const { range, tiles, program, liveCampaign, checklist, kpis, days, tierMix, segments, topRewards, attention, recent } = useLoaderData<typeof loader>();
  const maxDay = Math.max(1, ...days.map((d) => Math.max(d.awarded, d.redeemed)));
  const maxTier = Math.max(1, ...tierMix.map((t) => t.count));
  const attnCount = attention.expiring.length + attention.negative.length + attention.nearTier.length;
  const todo = checklist.filter((c) => !c.ok);
  const barW = Math.max(6, Math.floor(860 / days.length) - 4);

  return (
    <s-page inlineSize="large">
      {/* Hero band */}
      <div style={{
        position: "relative", borderRadius: 16, padding: "22px 26px", marginBottom: 4, overflow: "hidden",
        backgroundColor: "#f4eee4",
        backgroundImage: "repeating-linear-gradient(0deg, rgba(198,13,17,.13) 0 14px, transparent 14px 28px), repeating-linear-gradient(90deg, rgba(198,13,17,.13) 0 14px, transparent 14px 28px), repeating-linear-gradient(0deg, rgba(255,255,255,.5) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(255,255,255,.5) 0 1px, transparent 1px 3px)",
      }}>
        <div style={{ position: "absolute", inset: 10, border: "2px dashed rgba(31,31,31,.3)", borderRadius: 10, pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <img src="/img/icon" alt="" width={64} height={64} style={{ borderRadius: 14, boxShadow: "0 4px 12px rgba(0,0,0,.15)" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1f1f1f", letterSpacing: "-.01em" }}>{program.name}</div>
            <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>{fmtInt(kpis.members)} members · {fmtInt(kpis.outstanding)} {program.pointsName} outstanding · {fmtMoney(kpis.liability)} liability</div>
          </div>
          <span style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: ".04em", background: program.active ? "#c60d11" : "#fff", color: program.active ? "#fff" : "#c60d11", border: "2px dashed " + (program.active ? "rgba(255,255,255,.6)" : "#c60d11") }}>
            {program.active ? "LIVE" : "PAUSED"}
          </span>
        </div>
      </div>

      {/* Nav tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 6 }}>
        {tiles.map((t) => (
          <a key={t.href} href={t.href} style={{ textDecoration: "none", color: "#1f1f1f", background: "#fff", border: "2px dashed #e3d9cc", borderRadius: 12, padding: "12px 12px 10px", display: "block", transition: "border-color .15s" }}
             onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#c60d11")} onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e3d9cc")}>
            <div style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>{t.label}</div>
            <div style={{ fontSize: 12, color: "#8a8a8a", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sub}</div>
          </a>
        ))}
      </div>

      {/* Setup checklist / health */}
      {todo.length > 0 ? (
        <s-banner tone="warning" heading={`Setup: ${checklist.length - todo.length} of ${checklist.length} done`}>
          <s-stack gap="small">
            {todo.map((c) => <s-link key={c.label} href={c.href}>→ {c.label}</s-link>)}
          </s-stack>
        </s-banner>
      ) : (
        <s-banner tone="success" heading="Program is live">{liveCampaign ? `Pop-up live: ${liveCampaign.name}` : "No pop-up campaign is live"}</s-banner>
      )}

      {/* Lookup + actions + period */}
      <s-section>
        <s-stack direction="inline" gap="base" alignItems="end" justifyContent="space-between">
          <Form method="get" action="/app/customers">
            <s-stack direction="inline" gap="small" alignItems="end">
              <s-text-field name="q" label="Find a member" placeholder="Email or name" />
              <s-button type="submit" variant="primary">Look up</s-button>
            </s-stack>
          </Form>
          <s-stack direction="inline" gap="small" alignItems="end">
            <s-stack direction="inline" gap="none">
              {[7, 30, 90].map((r) => <s-button key={r} href={`/app?range=${r}`} variant={range === r ? "primary" : "secondary"}>{r}d</s-button>)}
            </s-stack>
            <s-button href="/app/campaigns">New campaign</s-button>
            <s-button href="/app/export/members" target="_top">Export members</s-button>
            <s-button href="/app/export/ledger" target="_top">Export ledger</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {/* KPIs */}
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
        <Stat label="Members" value={fmtInt(kpis.members)} sub={`+${fmtInt(kpis.newMembers)} in ${range}d`} />
        <Stat label="Points liability" value={fmtMoney(kpis.liability)} sub={`${fmtInt(kpis.outstanding)} ${program.pointsName}${kpis.pending ? ` · ${fmtInt(kpis.pending)} pending` : ""}`} />
        <Stat label={`Awarded (${range}d)`} value={fmtInt(kpis.awarded)} sub={`${fmtInt(kpis.orders)} orders`} />
        <Stat label={`Redeemed (${range}d)`} value={fmtInt(kpis.redeemed)} sub={`${fmtInt(kpis.redemptions)} redemptions · ${kpis.redemptionRate}% of orders`} />
        <Stat label="Code use" value={`${kpis.codeUseRate}%`} sub={`${fmtInt(kpis.codesUsed)} of ${fmtInt(kpis.codesIssued)} used · ${fmtInt(kpis.activeCodes)} active`} />
        <Stat label={`Pop-up (${range}d)`} value={fmtInt(kpis.plays)} sub={`${fmtInt(kpis.playsWithCode)} won codes · ${fmtInt(kpis.playCodesUsed)} ordered`} />
      </s-grid>

      {/* Chart */}
      <s-section heading={`${program.pointsName} awarded vs redeemed — last ${range} days`}>
        <svg viewBox="0 0 900 220" width="100%" style={{ display: "block" }} role="img" aria-label="Points awarded and redeemed over time">
          {days.map((d, i) => {
            const x = 20 + i * (barW + 4), ah = (d.awarded / maxDay) * 170, rh = (d.redeemed / maxDay) * 170, half = Math.max(3, Math.floor(barW / 2));
            return (
              <g key={i}>
                <rect x={x} y={190 - ah} width={half} height={ah} fill="#c60d11" rx="1.5"><title>{d.label}: +{fmtInt(d.awarded)}</title></rect>
                <rect x={x + half} y={190 - rh} width={half} height={rh} fill="#1f1f1f" rx="1.5"><title>{d.label}: −{fmtInt(d.redeemed)}</title></rect>
                {i % Math.ceil(days.length / 8) === 0 && <text x={x + half} y={210} fontSize="10" textAnchor="middle" fill="#666">{d.label}</text>}
              </g>
            );
          })}
          <line x1="20" y1="190" x2="890" y2="190" stroke="#ddd" />
        </svg>
        <s-stack direction="inline" gap="base"><s-badge tone="critical">Awarded</s-badge><s-badge>Redeemed</s-badge></s-stack>
      </s-section>

      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(340px, 1fr))" gap="base">
        {/* Tier mix + liability */}
        <s-section heading="Members & liability by tier">
          {tierMix.map((t) => (
            <s-stack key={t.id ?? "none"} gap="none">
              <s-stack direction="inline" justifyContent="space-between"><s-text>{t.name}</s-text><s-text emphasis="bold">{fmtInt(t.count)} · {fmtMoney(t.liability)}</s-text></s-stack>
              <div style={{ height: 8, background: "#eee", borderRadius: 4, marginBottom: 10 }}><div style={{ width: `${(t.count / maxTier) * 100}%`, height: "100%", background: "#c60d11", borderRadius: 4 }} /></div>
            </s-stack>
          ))}
          <s-link href="/app/tiers">Manage tiers</s-link>
        </s-section>

        {/* Rewards performance */}
        <s-section heading="Rewards (90d)">
          {topRewards.length === 0 ? <s-text color="subdued">No redemptions yet.</s-text> : topRewards.map((r) => (
            <s-stack key={r.name} direction="inline" justifyContent="space-between"><s-text>{r.name}</s-text><s-text emphasis="bold">{fmtInt(r.count)}</s-text></s-stack>
          ))}
          <s-paragraph><s-link href="/app/rewards">Manage rewards</s-link> · <s-link href="/app/product-rules">Product rules</s-link></s-paragraph>
        </s-section>
      </s-grid>

      {/* Segments */}
      <s-section heading="Segments">
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(190px, 1fr))" gap="base">
          {segments.map((s) => (
            <s-box key={s.key} padding="base" border="base" borderRadius="base">
              <s-text color="subdued">{s.label}</s-text>
              <s-heading>{fmtInt(s.count)}</s-heading>
              <s-link href={`/app/customers?segment=${s.key}`}>View list</s-link>
            </s-box>
          ))}
        </s-grid>
      </s-section>

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

      {/* Recent activity (migration rows hidden) */}
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
            {recent.length === 0 && <s-table-row><s-table-cell>No activity since the import yet.</s-table-cell></s-table-row>}
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
