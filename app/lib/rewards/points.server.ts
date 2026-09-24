import prisma from "../../db.server";
import { getProgram } from "./program.server";
import { upsertCustomer, recalcCustomer, syncCustomerMetafields } from "./customers.server";

type AdminGraphql = (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;

// ─── Webhook payload shapes (only the fields we use) ─────────────────────────
interface LineItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  vendor: string | null;
  quantity: number;
  price: string;               // unit price
  total_discount: string;      // line-level discount total
  discount_allocations?: { amount: string }[];
}
export interface OrderPayload {
  id: number;
  admin_graphql_api_id: string;
  name: string;
  email: string | null;
  customer?: { id: number; email: string | null; first_name: string | null; last_name: string | null } | null;
  line_items: LineItem[];
  total_shipping_price_set?: { shop_money: { amount: string } };
  total_tax: string;
  discount_codes?: { code: string }[];
}
export interface RefundPayload {
  id: number;
  order_id: number;
  refund_line_items: { line_item_id: number; quantity: number; subtotal: string; line_item: LineItem }[];
}

// ─── Product rule resolution ─────────────────────────────────────────────────
interface ProductMeta { tags: string[]; productType: string; collectionIds: string[] }

async function fetchProductMeta(graphql: AdminGraphql, productIds: number[]): Promise<Map<number, ProductMeta>> {
  const map = new Map<number, ProductMeta>();
  if (!productIds.length) return map;
  const ids = productIds.map((id) => `gid://shopify/Product/${id}`);
  const res = await graphql(
    `#graphql
    query ProductMeta($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id tags productType
          collections(first: 50) { nodes { id } }
        }
      }
    }`,
    { variables: { ids } },
  );
  const json = await res.json();
  for (const n of json?.data?.nodes ?? []) {
    if (!n?.id) continue;
    const numeric = Number(n.id.split("/").pop());
    map.set(numeric, {
      tags: (n.tags ?? []).map((t: string) => t.toLowerCase()),
      productType: (n.productType ?? "").toLowerCase(),
      collectionIds: (n.collections?.nodes ?? []).map((c: { id: string }) => c.id),
    });
  }
  return map;
}

function lineNetAmount(li: LineItem): number {
  const gross = Number(li.price) * li.quantity;
  const disc = li.discount_allocations?.length
    ? li.discount_allocations.reduce((s, d) => s + Number(d.amount), 0)
    : Number(li.total_discount || 0);
  return Math.max(0, gross - disc);
}

/**
 * Computes points for a set of line items.
 * EXCLUDE always wins. Among MULTIPLIER rules the highest priority wins (ties → largest value).
 * FIXED_BONUS rules stack (all matching bonuses are added, per unit).
 */
async function computeLinePoints(opts: {
  shop: string;
  graphql: AdminGraphql;
  lines: LineItem[];
  pointsPerDollar: number;
  tierMultiplier: number;
  now: Date;
}) {
  const { shop, graphql, lines, pointsPerDollar, tierMultiplier, now } = opts;

  const rules = await prisma.productRule.findMany({
    where: {
      shop,
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
  });

  const needsMeta = rules.some((r) => ["TAG", "COLLECTION", "PRODUCT_TYPE"].includes(r.target));
  const meta = needsMeta
    ? await fetchProductMeta(graphql, [...new Set(lines.map((l) => l.product_id).filter((x): x is number => !!x))])
    : new Map<number, ProductMeta>();

  let total = 0;
  const breakdown: { lineId: number; amount: number; points: number; excluded: boolean }[] = [];

  for (const li of lines) {
    const amount = lineNetAmount(li);
    const m = li.product_id ? meta.get(li.product_id) : undefined;

    const matching = rules.filter((r) => {
      switch (r.target) {
        case "PRODUCT":      return !!li.product_id && r.targetId === `gid://shopify/Product/${li.product_id}`;
        case "VARIANT":      return !!li.variant_id && r.targetId === `gid://shopify/ProductVariant/${li.variant_id}`;
        case "VENDOR":       return (li.vendor ?? "").toLowerCase() === r.targetId.toLowerCase();
        case "TAG":          return !!m && m.tags.includes(r.targetId.toLowerCase());
        case "PRODUCT_TYPE": return !!m && m.productType === r.targetId.toLowerCase();
        case "COLLECTION":   return !!m && m.collectionIds.includes(r.targetId);
      }
    });

    if (matching.some((r) => r.mode === "EXCLUDE")) {
      breakdown.push({ lineId: li.id, amount, points: 0, excluded: true });
      continue;
    }

    const mult = matching
      .filter((r) => r.mode === "MULTIPLIER")
      .sort((a, b) => b.priority - a.priority || Number(b.value) - Number(a.value))[0];
    const ruleMultiplier = mult ? Number(mult.value) : 1;
    const bonusPerUnit = matching
      .filter((r) => r.mode === "FIXED_BONUS")
      .reduce((s, r) => s + Number(r.value ?? 0), 0);

    const pts = Math.floor(amount * pointsPerDollar * tierMultiplier * ruleMultiplier + bonusPerUnit * li.quantity);
    total += pts;
    breakdown.push({ lineId: li.id, amount, points: pts, excluded: false });
  }

  return { total, breakdown };
}

// ─── Award for a paid order ──────────────────────────────────────────────────
export async function awardOrderPoints(shop: string, graphql: AdminGraphql, order: OrderPayload) {
  const program = await getProgram(shop);
  if (!program.active) return { skipped: "program inactive" };

  const email = order.customer?.email ?? order.email;
  if (!email) return { skipped: "no customer email" };

  // Idempotency: one ORDER entry per order.
  const existing = await prisma.pointsLedger.findFirst({
    where: { shop, orderId: order.admin_graphql_api_id, type: "ORDER" },
  });
  if (existing) return { skipped: "already awarded" };

  const customer = await upsertCustomer(shop, {
    id: order.customer?.id,
    email,
    first_name: order.customer?.first_name,
    last_name: order.customer?.last_name,
  });
  if (!customer) return { skipped: "customer upsert failed" };

  const tier = customer.tierId ? await prisma.tier.findUnique({ where: { id: customer.tierId } }) : null;
  const tierMultiplier = tier ? Number(tier.multiplier) : 1;
  const pointsPerDollar = Number(program.pointsPerDollar);
  const now = new Date();

  const { total: linePoints } = await computeLinePoints({
    shop, graphql, lines: order.line_items, pointsPerDollar, tierMultiplier, now,
  });

  let extra = 0;
  if (program.earnOnShipping && order.total_shipping_price_set)
    extra += Number(order.total_shipping_price_set.shop_money.amount);
  if (program.earnOnTax) extra += Number(order.total_tax || 0);
  const points = linePoints + Math.floor(extra * pointsPerDollar * tierMultiplier);

  const subtotal = order.line_items.reduce((s, li) => s + lineNetAmount(li), 0);

  const hold = program.holdDays > 0;
  const availableAt = hold ? new Date(now.getTime() + program.holdDays * 86_400_000) : null;
  const expiresAt = program.expiryMonths
    ? new Date(new Date(now).setMonth(now.getMonth() + program.expiryMonths))
    : null;

  await prisma.$transaction([
    prisma.pointsLedger.create({
      data: {
        shop, customerId: customer.id, type: "ORDER",
        status: hold ? "PENDING" : "AVAILABLE",
        points, orderId: order.admin_graphql_api_id, orderName: order.name,
        note: `Order ${order.name}`, availableAt, expiresAt,
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data: { lifetimeSpend: { increment: subtotal } },
    }),
  ]);

  const updated = await recalcCustomer(shop, customer.id);
  await syncCustomerMetafields(graphql, updated);
  return { awarded: points, customerId: customer.id };
}

// ─── Reverse for a refund ────────────────────────────────────────────────────
export async function reverseForRefund(shop: string, graphql: AdminGraphql, refund: RefundPayload) {
  const orderId = `gid://shopify/Order/${refund.order_id}`;
  const award = await prisma.pointsLedger.findFirst({
    where: { shop, orderId, type: "ORDER" },
  });
  if (!award || award.points <= 0) return { skipped: "no award for order" };

  const alreadyReversed = await prisma.pointsLedger.aggregate({
    where: { shop, orderId, type: "ORDER_REVERSAL" },
    _sum: { points: true },
  });
  const remaining = award.points + (alreadyReversed._sum.points ?? 0); // reversals are negative
  if (remaining <= 0) return { skipped: "fully reversed" };

  // Proportional clawback: refunded item subtotal ÷ original order subtotal.
  const refunded = refund.refund_line_items.reduce((s, r) => s + Number(r.subtotal), 0);
  const res = await graphql(
    `#graphql
    query OrderSubtotal($id: ID!) {
      order(id: $id) { subtotalPriceSet { shopMoney { amount } } }
    }`,
    { variables: { id: orderId } },
  );
  const json = await res.json();
  const orderSubtotal = Number(json?.data?.order?.subtotalPriceSet?.shopMoney?.amount ?? 0);
  const ratio = orderSubtotal > 0 ? Math.min(1, refunded / orderSubtotal) : 1;
  const customer = await prisma.customer.findUnique({ where: { id: award.customerId } });

  const clawback = Math.min(remaining, Math.ceil(award.points * ratio));
  if (clawback <= 0) return { skipped: "nothing to claw back" };

  const balanceAfter = (customer?.balance ?? 0) - clawback;

  await prisma.$transaction([
    prisma.pointsLedger.create({
      data: {
        shop, customerId: award.customerId, type: "ORDER_REVERSAL", status: "AVAILABLE",
        points: -clawback, orderId, orderName: award.orderName,
        note: `Refund on ${award.orderName}${balanceAfter < 0 ? " (balance now negative)" : ""}`,
      },
    }),
    prisma.customer.update({
      where: { id: award.customerId },
      data: { lifetimeSpend: { decrement: refunded } },
    }),
  ]);

  const updated = await recalcCustomer(shop, award.customerId);
  await syncCustomerMetafields(graphql, updated);
  return { reversed: clawback };
}
