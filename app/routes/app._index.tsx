import { useState } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProgram } from "../lib/rewards/program.server";
import { fmtDate, fmtInt, fmtMoney } from "../lib/rewards/format";
import { UIStyles } from "../lib/rewards/ui";

const fmtMoney0 = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);

const ICON = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221200%22%20height%3D%221200%22%20viewBox%3D%220%200%201200%201200%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22cush%22%20cx%3D%2240%25%22%20cy%3D%2235%25%22%20r%3D%2270%25%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23e8393c%22%2F%3E%3Cstop%20offset%3D%22.7%22%20stop-color%3D%22%23c60d11%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238f0a0d%22%2F%3E%3C%2FradialGradient%3E%0A%20%20%20%20%3Cpattern%20id%3D%22g%22%20width%3D%2270%22%20height%3D%2270%22%20patternUnits%3D%22userSpaceOnUse%22%3E%3Crect%20width%3D%2270%22%20height%3D%2270%22%20fill%3D%22%23f4eee4%22%2F%3E%3Crect%20width%3D%2235%22%20height%3D%2270%22%20fill%3D%22rgba%28198%2C13%2C17%2C.13%29%22%2F%3E%3Crect%20width%3D%2270%22%20height%3D%2235%22%20fill%3D%22rgba%28198%2C13%2C17%2C.13%29%22%2F%3E%3C%2Fpattern%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Crect%20width%3D%221200%22%20height%3D%221200%22%20rx%3D%22220%22%20fill%3D%22url%28%23g%29%22%2F%3E%0A%20%20%3Crect%20x%3D%2260%22%20y%3D%2260%22%20width%3D%221080%22%20height%3D%221080%22%20rx%3D%22180%22%20fill%3D%22none%22%20stroke%3D%22rgba%2831%2C31%2C31%2C.3%29%22%20stroke-width%3D%2212%22%20stroke-dasharray%3D%2236%2028%22%2F%3E%0A%20%20%3Cg%20transform%3D%22translate%28120%20160%29%20scale%284%29%22%3E%0A%20%20%20%20%3Cellipse%20cx%3D%22120%22%20cy%3D%22200%22%20rx%3D%2286%22%20ry%3D%2212%22%20fill%3D%22rgba%280%2C0%2C0%2C.14%29%22%2F%3E%0A%20%20%20%20%3Cellipse%20cx%3D%22120%22%20cy%3D%22130%22%20rx%3D%2295%22%20ry%3D%2274%22%20fill%3D%22url%28%23cush%29%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M120%2060%20C%2070%2070%2C%2045%20110%2C%2040%20150%20M120%2060%20C%20170%2070%2C%20195%20110%2C%20200%20150%20M120%2060%20C%20100%20100%2C%20100%20150%2C%20110%20200%20M120%2060%20C%20140%20100%2C%20140%20150%2C%20130%20200%22%20fill%3D%22none%22%20stroke%3D%22rgba%28255%2C255%2C255%2C.55%29%22%20stroke-width%3D%222.5%22%20stroke-dasharray%3D%227%206%22%20stroke-linecap%3D%22round%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M120%2058%20c-6-14%206-22%2010-8%20c8-14%2020-6%208%206%20c14-2%2016%2012%200%2012%20c10%2012-6%2020-12%206%20c-8%2014-22%206-10-8%20c-14%202-16-12%200-12z%22%20fill%3D%22%233f8f4a%22%2F%3E%0A%20%20%20%20%3Cellipse%20cx%3D%22120%22%20cy%3D%2264%22%20rx%3D%227%22%20ry%3D%224%22%20fill%3D%22%232f6e38%22%2F%3E%0A%20%20%20%20%3Cg%20stroke-linecap%3D%22round%22%3E%0A%20%20%20%20%20%20%3Cline%20x1%3D%2280%22%20y1%3D%22120%22%20x2%3D%2260%22%20y2%3D%2252%22%20stroke%3D%22%239a9a9a%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%2260%22%20cy%3D%2248%22%20r%3D%228%22%20fill%3D%22%231f1f1f%22%2F%3E%0A%20%20%20%20%20%20%3Cline%20x1%3D%22150%22%20y1%3D%22112%22%20x2%3D%22178%22%20y2%3D%2248%22%20stroke%3D%22%239a9a9a%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%22180%22%20cy%3D%2244%22%20r%3D%228%22%20fill%3D%22%23efe8dd%22%20stroke%3D%22%231f1f1f%22%20stroke-width%3D%221.5%22%2F%3E%0A%20%20%20%20%20%20%3Cline%20x1%3D%22105%22%20y1%3D%22108%22%20x2%3D%2298%22%20y2%3D%2240%22%20stroke%3D%22%239a9a9a%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%2297%22%20cy%3D%2236%22%20r%3D%228%22%20fill%3D%22%23c60d11%22%20stroke%3D%22%23fff%22%20stroke-width%3D%221.5%22%2F%3E%0A%20%20%20%20%20%20%3Cline%20x1%3D%22160%22%20y1%3D%22140%22%20x2%3D%22205%22%20y2%3D%22105%22%20stroke%3D%22%239a9a9a%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%22210%22%20cy%3D%22102%22%20r%3D%228%22%20fill%3D%22%231f1f1f%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E%0A";

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
    prisma.customer.count({ where: { shop, createdAt: { gte: since }, ledger: { none: { type: "MIGRATION" } } } }),
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
    prisma.customer.count({ where: { shop, balance: { gt: 0 }, ledger: { none: { type: { not: "MIGRATION" }, createdAt: { gte: d90 } } } } }),
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
      { key: "dormant", label: "Dormant with points", count: segDormant },
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
  const untiered = tierMix.length > 1 ? tierMix[0].count : 0;
  const attnCount = attention.expiring.length + attention.negative.length + attention.nearTier.length + (untiered ? 1 : 0);
  const todo = checklist.filter((c) => !c.ok);
  const [tab, setTab] = useState<"activity" | "attention">("activity");

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
          <img src={ICON} alt="" width={64} height={64} style={{ borderRadius: 14, boxShadow: "0 4px 12px rgba(0,0,0,.15)" }} />
          <div style={{ flex: 1, minWidth: 220, background: "#fbe7e8", border: "1.5px dashed rgba(198,13,17,.45)", borderRadius: 12, padding: "10px 16px", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1f1f1f", letterSpacing: "-.01em" }}>{program.name}</div>
            <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>{fmtInt(kpis.members)} members · {fmtInt(kpis.outstanding)} {program.pointsName} outstanding · {fmtMoney0(kpis.liability)} liability</div>
          </div>
          <span style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: ".04em", background: program.active ? "#c60d11" : "#fff", color: program.active ? "#fff" : "#c60d11", border: "2px dashed " + (program.active ? "rgba(255,255,255,.6)" : "#c60d11") }}>
            {program.active ? "LIVE" : "PAUSED"}
          </span>
        </div>
      </div>

      <UIStyles />
      <style>{`.aas-tiles{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:10px}@media (max-width:760px){.aas-tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}@media (max-width:520px){.aas-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
.aas-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:6px 0}
@media (max-width:760px){.aas-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:560px){.aas-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.aas-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.aas-find{display:flex;align-items:center;gap:8px;flex:1 1 320px;max-width:460px}
.aas-find s-text-field{flex:1}
.aas-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.aas-cols4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:14px;padding-top:14px;border-top:2px dashed #eee5d9}
.aas-col{padding:2px 16px;border-left:2px dashed #eee5d9;min-width:0;font-size:13px}
.aas-cols4>.aas-col:first-child{border-left:0;padding-left:2px}
@media (max-width:760px){.aas-cols4{grid-template-columns:1fr 1fr;row-gap:16px}.aas-col{border-left:0;padding:2px 6px}}
.aas-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#8a8a8a;margin-bottom:10px}
.aas-muted{color:#8a8a8a}
.aas-legend{display:flex;gap:12px;font-size:11px;color:#666;margin-top:4px}.aas-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:middle}
.aas-row.tight{border-bottom:0;padding:2px 0 4px}
.aas-panel{background:#fff;border:2px dashed #e3d9cc;border-radius:16px;padding:16px 18px;margin:8px 0}
.aas-panel .aas-kpis{margin:14px 0 0;gap:0}
.aas-stat{position:relative;padding:4px 16px;min-width:0;border-left:2px dashed #eee5d9}
.aas-panel .aas-kpis>.aas-stat:first-child{border-left:0;padding-left:2px}
@media (max-width:760px){.aas-stat{border-left:0;padding:8px 6px}}
.aas-stat .l{font-size:12px;color:#8a8a8a;font-weight:600;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aas-stat .v{font-size:22px;font-weight:800;color:#1f1f1f;line-height:1.15;margin-top:6px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aas-stat.hot .v{color:#c60d11}
.aas-stat .s{font-size:12px;color:#666;margin-top:4px;line-height:1.35}
.aas-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px dashed #eee5d9}.aas-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aas-row:last-of-type{border-bottom:0}
.aas-tile{text-decoration:none;color:#1f1f1f;background:#fff;border:2px dashed #e3d9cc;border-radius:12px;padding:12px 12px 10px;display:block;transition:border-color .15s}
.aas-tile:hover{border-color:#c60d11}
.aas-sub{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:2px dashed #eee5d9}
.aas-tabs{display:flex;gap:4px;border-bottom:2px dashed #eee5d9;margin:-4px -2px 12px}
.aas-tab{appearance:none;border:0;background:none;font:inherit;font-weight:700;font-size:14px;padding:10px 14px;color:#8a8a8a;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px}
.aas-tab.on{color:#1f1f1f;border-bottom-color:#c60d11}
.aas-tab .n{display:inline-block;min-width:18px;padding:1px 6px;margin-left:6px;border-radius:999px;background:#c60d11;color:#fff;font-size:11px}
.aas-tbl{width:100%;border-collapse:collapse;font-size:13px}
.aas-tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8a8a8a;font-weight:700;padding:8px 6px;border-bottom:2px dashed #eee5d9}
.aas-tbl td{padding:9px 6px;border-bottom:1px dashed #eee5d9;vertical-align:middle}
.aas-tbl tr:last-child td{border-bottom:0}
.aas-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
.aas-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#e8f5ec;color:#1b5e20}
.aas-pill.neg{background:#fdecec;color:#8a1c1c}
.aas-attn{border:1px dashed #e3d9cc;border-radius:10px;padding:12px 14px;margin-bottom:10px}
.aas-attn h4{margin:0 0 6px;font-size:14px}
.aas-attn p{margin:4px 0;font-size:13px}`}</style>

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

      {/* Overview panel: nav tiles → stats → chart/tiers/rewards/segments */}
      <div className="aas-panel">
        <div className="aas-tiles">
          {tiles.map((t) => (
            <Link key={t.href} to={t.href} className="aas-tile">
              <div style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>{t.label}</div>
              <div style={{ fontSize: 12, color: "#8a8a8a", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sub}</div>
            </Link>
          ))}
        </div>

        <div className="aas-sub">
          <div className="aas-h" style={{ margin: 0 }}>Overview · last {range} days</div>
          <div className="aas-actions">
            {[7, 30, 90].map((r) => <Link key={r} className={`st-btn ${range === r ? "primary" : "secondary"} sm`} to={`/app?range=${r}`}>{r}d</Link>)}
            <Link className="st-btn secondary sm" to="/app/campaigns">New campaign</Link>
            <a className="st-btn secondary sm" href="/app/export/members" target="_top">Export members</a>
            <a className="st-btn secondary sm" href="/app/export/ledger" target="_top">Export ledger</a>
          </div>
        </div>

        <div className="aas-kpis">
          <Stat label="Members" value={fmtInt(kpis.members)} sub={`+${fmtInt(kpis.newMembers)} in ${range}d`} />
          <Stat hot label="Points liability" value={fmtMoney0(kpis.liability)} sub={`${fmtInt(kpis.outstanding)} ${program.pointsName}${kpis.pending ? ` · ${fmtInt(kpis.pending)} pending` : ""}`} />
          <Stat hot label={`Awarded (${range}d)`} value={fmtInt(kpis.awarded)} sub={`${fmtInt(kpis.orders)} orders`} />
          <Stat label={`Redeemed (${range}d)`} value={fmtInt(kpis.redeemed)} sub={`${fmtInt(kpis.redemptions)} redemptions · ${kpis.redemptionRate}% of orders`} />
          <Stat label="Code use" value={`${kpis.codeUseRate}%`} sub={`${fmtInt(kpis.codesUsed)} of ${fmtInt(kpis.codesIssued)} used · ${fmtInt(kpis.activeCodes)} active`} />
          <Stat label={`Pop-up (${range}d)`} value={fmtInt(kpis.plays)} sub={`${fmtInt(kpis.playsWithCode)} won codes · ${fmtInt(kpis.playCodesUsed)} ordered`} />
        </div>

        <div className="aas-cols4">
          <div className="aas-col">
            <div className="aas-h">Awarded vs redeemed · {range}d</div>
            <svg viewBox="0 0 320 140" width="100%" style={{ display: "block" }} role="img" aria-label="Points awarded and redeemed over time">
              {days.map((d, i) => {
                const slot = 300 / days.length, x = 10 + i * slot, w = Math.max(1.5, slot * 0.38);
                const ah = (d.awarded / maxDay) * 110, rh = (d.redeemed / maxDay) * 110;
                return (
                  <g key={i}>
                    <rect x={x} y={118 - ah} width={w} height={ah} fill="#c60d11" rx="1"><title>{d.label}: +{fmtInt(d.awarded)}</title></rect>
                    <rect x={x + w} y={118 - rh} width={w} height={rh} fill="#1f1f1f" rx="1"><title>{d.label}: −{fmtInt(d.redeemed)}</title></rect>
                  </g>
                );
              })}
              <line x1="8" y1="118" x2="312" y2="118" stroke="#ddd" />
              <text x="10" y="134" fontSize="10" fill="#888">{days[0]?.label}</text>
              <text x="310" y="134" fontSize="10" fill="#888" textAnchor="end">{days[days.length - 1]?.label}</text>
            </svg>
            <div className="aas-legend"><span><i style={{ background: "#c60d11" }} />Awarded</span><span><i style={{ background: "#1f1f1f" }} />Redeemed</span></div>
          </div>

          <div className="aas-col">
            <div className="aas-h">Members &amp; liability by tier</div>
            {tierMix.filter((t) => t.id !== null || t.count > 0).map((t) => (
              <div key={t.id ?? "none"} style={{ marginBottom: 8 }}>
                <div className="aas-row tight"><span>{t.name}</span><b>{fmtInt(t.count)} · {fmtMoney0(t.liability)}</b></div>
                <div style={{ height: 6, background: "#eee", borderRadius: 3 }}><div style={{ width: `${(t.count / maxTier) * 100}%`, height: "100%", background: "#c60d11", borderRadius: 3 }} /></div>
              </div>
            ))}
            <s-link href="/app/tiers">Manage tiers</s-link>
          </div>

          <div className="aas-col">
            <div className="aas-h">Rewards · 90d</div>
            {topRewards.length === 0 ? <div className="aas-muted">No redemptions yet.</div> : topRewards.map((r) => (
              <div key={r.name} className="aas-row"><span>{r.name}</span><b>{fmtInt(r.count)}</b></div>
            ))}
            <div style={{ marginTop: 8 }}><s-link href="/app/rewards">Manage rewards</s-link> · <s-link href="/app/product-rules">Product rules</s-link></div>
          </div>

          <div className="aas-col">
            <div className="aas-h">Segments</div>
            {segments.map((x) => (
              <div key={x.key} className="aas-row">
                <s-link href={`/app/customers?segment=${x.key}`}>{x.label}</s-link>
                <b>{fmtInt(x.count)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity panel: search + tabs (Recent activity | Needs attention) */}
      <div className="aas-panel">
        <div className="aas-tabs">
          <button type="button" className={`aas-tab${tab === "activity" ? " on" : ""}`} onClick={() => setTab("activity")}>Recent activity</button>
          <button type="button" className={`aas-tab${tab === "attention" ? " on" : ""}`} onClick={() => setTab("attention")}>Needs attention{attnCount > 0 && <span className="n">{attnCount}</span>}</button>
        </div>

        {tab === "activity" && (
          <>
            <Form method="get" action="/app/customers" className="aas-find" style={{ maxWidth: 520, marginBottom: 12 }}>
              <div className="fld" style={{ flex: 1 }}><div className="box"><input className="txt" name="q" placeholder="Find a member — email or name" /></div></div>
              <button className="st-btn primary" type="submit">Look up</button>
            </Form>
            <table className="aas-tbl">
              <thead><tr><th>Member</th><th>Type</th><th className="num">{program.pointsName}</th><th>Note</th><th>When</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td><s-link href={`/app/customers/${r.customer.id}`}>{[r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ") || r.customer.email}</s-link></td>
                    <td><span className={`aas-pill${r.points < 0 ? " neg" : ""}`}>{r.type}</span></td>
                    <td className="num"><b>{r.points > 0 ? `+${fmtInt(r.points)}` : fmtInt(r.points)}</b></td>
                    <td style={{ color: "#555" }}>{r.note ?? ""}</td>
                    <td style={{ color: "#555", whiteSpace: "nowrap" }}>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
                {recent.length === 0 && <tr><td colSpan={5} className="aas-muted">No activity since the import yet.</td></tr>}
              </tbody>
            </table>
            <div style={{ marginTop: 10 }}><s-link href="/app/customers">View all members</s-link></div>
          </>
        )}

        {tab === "attention" && (
          <>
            {attnCount === 0 && <div className="aas-muted">Nothing outstanding.</div>}
            {untiered > 0 && (
              <div className="aas-attn"><h4>{fmtInt(untiered)} members have no tier</h4><p>Usually members imported before tiers existed. <s-link href="/app/tiers">Recalculate all members</s-link> to place everyone.</p></div>
            )}
            {attention.nearTier.length > 0 && (
              <div className="aas-attn"><h4>Close to the next tier — worth a nudge</h4>
                {attention.nearTier.map((c) => <p key={c.id}><s-link href={`/app/customers/${c.id}`}>{c.name}</s-link> needs {fmtInt(c.needed)} more for <b>{c.tier}</b></p>)}</div>
            )}
            {attention.expiring.length > 0 && (
              <div className="aas-attn"><h4>Codes expiring within 7 days</h4>
                {attention.expiring.map((r) => <p key={r.id}><s-link href={`/app/customers/${r.customerId}`}>{r.who}</s-link> — {r.reward} <code>{r.code}</code> · {fmtDate(r.expiresAt)}</p>)}</div>
            )}
            {attention.negative.length > 0 && (
              <div className="aas-attn"><h4>Negative balances (refund clawbacks)</h4>
                {attention.negative.map((c) => <p key={c.id}><s-link href={`/app/customers/${c.id}`}>{c.who}</s-link> · {fmtInt(c.balance)}</p>)}</div>
            )}
          </>
        )}
      </div>
    </s-page>
  );
}

function Stat({ label, value, sub, hot }: { label: string; value: string; sub?: string; hot?: boolean }) {
  return (
    <div className={`aas-stat${hot ? " hot" : ""}`}>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
