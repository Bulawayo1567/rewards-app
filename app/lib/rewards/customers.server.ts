import prisma from "../../db.server";
import { getProgram } from "./program.server";

type AdminGraphql = (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;

export interface ShopifyCustomerLike {
  id?: number | string | null;      // numeric id from webhook payloads
  admin_graphql_api_id?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

function toGid(c: ShopifyCustomerLike): string | null {
  if (c.admin_graphql_api_id) return c.admin_graphql_api_id;
  if (c.id) return `gid://shopify/Customer/${c.id}`;
  return null;
}

/** Find-or-create by (shop, email). Attaches the Shopify GID when we learn it. */
export async function upsertCustomer(shop: string, c: ShopifyCustomerLike) {
  const email = c.email?.trim().toLowerCase();
  if (!email) return null;
  const shopifyId = toGid(c);

  return prisma.customer.upsert({
    where: { shop_email: { shop, email } },
    update: {
      ...(shopifyId ? { shopifyId } : {}),
      ...(c.first_name ? { firstName: c.first_name } : {}),
      ...(c.last_name ? { lastName: c.last_name } : {}),
    },
    create: {
      shop,
      email,
      shopifyId,
      firstName: c.first_name ?? null,
      lastName: c.last_name ?? null,
    },
  });
}

/**
 * Recomputes cached balances from the ledger and assigns the tier.
 * Call after every ledger write.
 */
export async function recalcCustomer(shop: string, customerId: string) {
  const [available, pending, lifetime] = await Promise.all([
    prisma.pointsLedger.aggregate({
      where: { shop, customerId, status: "AVAILABLE" },
      _sum: { points: true },
    }),
    prisma.pointsLedger.aggregate({
      where: { shop, customerId, status: "PENDING" },
      _sum: { points: true },
    }),
    prisma.pointsLedger.aggregate({
      where: { shop, customerId, points: { gt: 0 }, status: { in: ["AVAILABLE", "PENDING"] } },
      _sum: { points: true },
    }),
  ]);

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

  const tiers = await prisma.tier.findMany({ where: { shop }, orderBy: { rank: "desc" } });
  let tierId: string | null = null;
  for (const t of tiers) {
    const measure =
      t.basis === "LIFETIME_POINTS"
        ? lifetime._sum.points ?? 0
        : t.basis === "LIFETIME_SPEND"
          ? Number(customer.lifetimeSpend)
          : await rolling12mSpend(shop, customerId);
    if (measure >= Number(t.threshold)) {
      tierId = t.id;
      break;
    }
  }

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      balance: available._sum.points ?? 0,
      pendingBalance: pending._sum.points ?? 0,
      lifetimePoints: lifetime._sum.points ?? 0,
      tierId,
      ...(tierId && tierId !== customer.tierId ? { tierAssignedAt: new Date() } : {}),
    },
    include: { tier: true },
  });
}

async function rolling12mSpend(shop: string, customerId: string) {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  // Spend is tracked on the ledger note-free: we store order subtotal in lifetimeSpend at award time;
  // for a rolling window we approximate from order ledger rows (points / pointsPerDollar).
  const program = await getProgram(shop);
  const rows = await prisma.pointsLedger.aggregate({
    where: { shop, customerId, type: "ORDER", createdAt: { gte: since }, status: { not: "REVERSED" } },
    _sum: { points: true },
  });
  return (rows._sum.points ?? 0) / Number(program.pointsPerDollar || 1);
}

/**
 * Writes balance / tier / lifetime to customer metafields (namespace "rewards")
 * so the theme, email tools and Shopify Flow can read them.
 */
export async function syncCustomerMetafields(graphql: AdminGraphql, customer: {
  shopifyId: string | null;
  balance: number;
  pendingBalance: number;
  lifetimePoints: number;
  tier?: { name: string } | null;
}) {
  if (!customer.shopifyId) return;
  const metafields = [
    { key: "balance", type: "number_integer", value: String(customer.balance) },
    { key: "pending", type: "number_integer", value: String(customer.pendingBalance) },
    { key: "lifetime_points", type: "number_integer", value: String(customer.lifetimePoints) },
    ...(customer.tier ? [{ key: "tier", type: "single_line_text_field", value: customer.tier.name }] : []),
  ].map((m) => ({ ...m, namespace: "rewards", ownerId: customer.shopifyId }));

  const res = await graphql(
    `#graphql
    mutation SyncRewards($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    { variables: { metafields } },
  );
  const json = await res.json();
  const errs = json?.data?.metafieldsSet?.userErrors;
  if (errs?.length) console.error("[rewards] metafieldsSet errors", errs);
}
