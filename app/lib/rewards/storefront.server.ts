import prisma from "../../db.server";
import { getProgram } from "./program.server";
import { upsertCustomer, recalcCustomer, syncCustomerMetafields } from "./customers.server";

type AdminGraphql = (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Resolves a storefront/account customer (numeric id or gid) to our Customer row, creating it from Shopify if needed. */
export async function resolveCustomer(shop: string, graphql: AdminGraphql | undefined, customerRef: string | null) {
  if (!customerRef) return null;
  const gid = customerRef.startsWith("gid://") ? customerRef : `gid://shopify/Customer/${customerRef}`;
  let c = await prisma.customer.findFirst({ where: { shop, shopifyId: gid }, include: { tier: true } });
  if (c || !graphql) return c;

  const res = await graphql(
    `#graphql
    query C($id: ID!) { customer(id: $id) { id email firstName lastName } }`,
    { variables: { id: gid } },
  );
  const j = await res.json();
  const sc = j?.data?.customer;
  if (!sc?.email) return null;
  await upsertCustomer(shop, { admin_graphql_api_id: sc.id, email: sc.email, first_name: sc.firstName, last_name: sc.lastName });
  const row = await prisma.customer.findFirstOrThrow({ where: { shop, shopifyId: gid } });
  await recalcCustomer(shop, row.id);
  return prisma.customer.findFirst({ where: { shop, shopifyId: gid }, include: { tier: true } });
}

/** Awards the birthday bonus if today is the customer's birthday and it hasn't been given this year. */
export async function maybeAwardBirthday(shop: string, graphql: AdminGraphql | undefined, customerId: string) {
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c?.birthday) return false;
  const today = new Date();
  const b = new Date(c.birthday);
  if (b.getUTCMonth() !== today.getUTCMonth() || b.getUTCDate() !== today.getUTCDate()) return false;
  if (c.birthdayAwardedYear === today.getUTCFullYear()) return false;
  const rule = await prisma.earnRule.findUnique({ where: { shop_event: { shop, event: "BIRTHDAY" } } });
  if (!rule?.active || rule.points <= 0) return false;
  await prisma.$transaction([
    prisma.pointsLedger.create({ data: { shop, customerId, type: "BIRTHDAY", points: rule.points, note: `Happy birthday ${today.getUTCFullYear()}!` } }),
    prisma.customer.update({ where: { id: customerId }, data: { birthdayAwardedYear: today.getUTCFullYear() } }),
  ]);
  const updated = await recalcCustomer(shop, customerId);
  if (graphql) await syncCustomerMetafields(graphql, updated);
  return true;
}

export async function buildMePayload(shop: string, customerId: string | null, opts: { history?: boolean } = {}) {
  const program = await getProgram(shop);
  const now = new Date();
  const [tiers, rewards, earn, offers] = await Promise.all([
    prisma.tier.findMany({ where: { shop }, orderBy: { rank: "asc" } }),
    prisma.reward.findMany({ where: { shop, active: true }, orderBy: [{ sortOrder: "asc" }, { pointsCost: "asc" }] }),
    prisma.earnRule.findMany({ where: { shop, active: true, points: { gt: 0 } } }),
    prisma.productRule.findMany({ where: { shop, active: true, mode: { in: ["MULTIPLIER", "FIXED_BONUS"] }, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] }, orderBy: { priority: "desc" } }),
  ]);

  const base = {
    program: { name: program.name, pointsName: program.pointsName, pointsPerDollar: Number(program.pointsPerDollar), minRedeemPoints: program.minRedeemPoints },
    tiers: tiers.map((t) => ({ name: t.name, rank: t.rank, threshold: Number(t.threshold), basis: t.basis, multiplier: Number(t.multiplier), perks: t.perks, color: t.color })),
    waysToEarn: earn.map((e) => ({ event: e.event, points: e.points })),
    rewards: rewards.map((r) => ({ id: r.id, name: r.name, type: r.type, pointsCost: r.pointsCost, minTierRank: r.minTierRank, minOrderSubtotal: r.minOrderSubtotal == null ? null : Number(r.minOrderSubtotal) })),
    offers: offers.map((o) => ({ label: o.targetLabel, target: o.target, mode: o.mode, value: Number(o.value ?? 0), endsAt: o.endsAt?.toISOString() ?? null })),
  };
  if (!customerId) return { loggedIn: false, ...base };

  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: {
      tier: true,
      redemptions: { where: { status: { in: ["ISSUED", "USED"] } }, orderBy: { createdAt: "desc" }, take: 10, include: { reward: true } },
      ...(opts.history ? { ledger: { orderBy: { createdAt: "desc" }, take: 50 } } : {}),
    },
  });
  const rank = c.tier?.rank ?? -1;
  const next = tiers.find((t) => t.rank > rank);
  const measure = next ? (next.basis === "LIFETIME_POINTS" ? c.lifetimePoints : Number(c.lifetimeSpend)) : 0;
  const currentThreshold = c.tier ? Number(c.tier.threshold) : 0;
  const progress = next ? Math.max(0, Math.min(100, Math.round(((measure - currentThreshold) / Math.max(1, Number(next.threshold) - currentThreshold)) * 100))) : 100;

  return {
    loggedIn: true,
    ...base,
    me: {
      firstName: c.firstName, email: c.email,
      balance: c.balance, pending: c.pendingBalance, lifetimePoints: c.lifetimePoints, lifetimeSpend: Number(c.lifetimeSpend),
      tier: c.tier ? { name: c.tier.name, rank: c.tier.rank, perks: c.tier.perks, color: c.tier.color, multiplier: Number(c.tier.multiplier) } : null,
      nextTier: next ? { name: next.name, needed: Math.max(0, Number(next.threshold) - measure), basis: next.basis, progress } : null,
      birthday: c.birthday ? { month: new Date(c.birthday).getUTCMonth() + 1, day: new Date(c.birthday).getUTCDate() } : null,
      codes: c.redemptions.map((r) => ({ code: r.discountCode, name: r.reward.name, status: r.status, expiresAt: r.expiresAt.toISOString() })),
      history: opts.history && "ledger" in c ? (c as any).ledger.map((l: any) => ({ id: l.id, type: l.type, status: l.status, points: l.points, note: l.note, orderName: l.orderName, createdAt: l.createdAt.toISOString() })) : [],
    },
  };
}
