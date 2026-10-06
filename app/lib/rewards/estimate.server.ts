import prisma from "../../db.server";
import { getProgram } from "./program.server";

type AdminGraphql = (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
interface Meta { id: string; vendor: string; tags: string[]; productType: string; collectionIds: string[] }

const cache = new Map<string, { at: number; meta: Meta }>();
const TTL = 10 * 60_000;

/** Looks up products by handle (cached), one GraphQL call per batch. */
export async function metaByHandles(graphql: AdminGraphql, handles: string[]): Promise<Map<string, Meta>> {
  const out = new Map<string, Meta>();
  const need: string[] = [];
  for (const h of handles) { const c = cache.get(h); if (c && Date.now() - c.at < TTL) out.set(h, c.meta); else need.push(h); }
  for (let i = 0; i < need.length; i += 25) {
    const chunk = need.slice(i, i + 25);
    const res = await graphql(`#graphql query P($q: String!) { products(first: 25, query: $q) { nodes { id handle vendor tags productType collections(first: 50) { nodes { id } } } } }`,
      { variables: { q: chunk.map((h) => `handle:${h}`).join(" OR ") } });
    const nodes = (await res.json())?.data?.products?.nodes ?? [];
    for (const n of nodes) {
      const meta: Meta = { id: n.id, vendor: (n.vendor ?? "").toLowerCase(), tags: (n.tags ?? []).map((t: string) => t.toLowerCase()), productType: (n.productType ?? "").toLowerCase(), collectionIds: (n.collections?.nodes ?? []).map((c: { id: string }) => c.id) };
      cache.set(n.handle, { at: Date.now(), meta }); out.set(n.handle, meta);
    }
  }
  return out;
}

/** Points for one product at a price, applying active rules and the member's tier multiplier. */
export function pointsFor(meta: Meta | null, price: number, rules: any[], pointsPerDollar: number, tierMult: number, variantId?: string | null) {
  const matching = rules.filter((r) => {
    switch (r.target) {
      case "PRODUCT": return !!meta && r.targetId === meta.id;
      case "VARIANT": return !!variantId && r.targetId === `gid://shopify/ProductVariant/${variantId}`;
      case "VENDOR": return !!meta && meta.vendor === r.targetId.toLowerCase();
      case "TAG": return !!meta && meta.tags.includes(r.targetId.toLowerCase());
      case "PRODUCT_TYPE": return !!meta && meta.productType === r.targetId.toLowerCase();
      case "COLLECTION": return !!meta && meta.collectionIds.includes(r.targetId);
      default: return false;
    }
  });
  if (matching.some((r) => r.mode === "EXCLUDE")) return 0;
  const mult = matching.filter((r) => r.mode === "MULTIPLIER").sort((a, b) => b.priority - a.priority || Number(b.value) - Number(a.value))[0];
  const bonus = matching.filter((r) => r.mode === "FIXED_BONUS").reduce((s, r) => s + Number(r.value ?? 0), 0);
  return Math.floor(price * pointsPerDollar * tierMult * (mult ? Number(mult.value) : 1) + bonus);
}

export async function activeRules(shop: string) {
  const now = new Date();
  return prisma.productRule.findMany({ where: { shop, active: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } });
}

export async function programRate(shop: string) { const p = await getProgram(shop); return { active: p.active, rate: Number(p.pointsPerDollar), pointsName: p.pointsName }; }
