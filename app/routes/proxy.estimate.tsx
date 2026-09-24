import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProgram } from "../lib/rewards/program.server";
import { json, resolveCustomer } from "../lib/rewards/storefront.server";

/** GET ?product=<numeric id>&variant=<numeric id>&vendor=<name>&price=<dollars> → { points } */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const shop = session.shop;
  const url = new URL(request.url);
  const productId = url.searchParams.get("product");
  const variantId = url.searchParams.get("variant");
  const vendor = (url.searchParams.get("vendor") ?? "").toLowerCase();
  const price = Number(url.searchParams.get("price") ?? 0);
  const program = await getProgram(shop);
  if (!program.active || !(price > 0)) return json({ points: 0 });

  const c = await resolveCustomer(shop, admin?.graphql, url.searchParams.get("logged_in_customer_id"));
  const tierMult = c?.tier ? Number(c.tier.multiplier) : 1;
  const now = new Date();
  const rules = await prisma.productRule.findMany({ where: { shop, active: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] } });

  let meta: { tags: string[]; productType: string; collectionIds: string[] } | null = null;
  if (admin && productId && rules.some((r) => ["TAG", "COLLECTION", "PRODUCT_TYPE"].includes(r.target))) {
    const res = await admin.graphql(`#graphql query P($id: ID!) { product(id: $id) { tags productType collections(first: 50) { nodes { id } } } }`, { variables: { id: `gid://shopify/Product/${productId}` } });
    const p = (await res.json())?.data?.product;
    if (p) meta = { tags: p.tags.map((t: string) => t.toLowerCase()), productType: (p.productType ?? "").toLowerCase(), collectionIds: p.collections.nodes.map((n: { id: string }) => n.id) };
  }
  const matching = rules.filter((r) => {
    switch (r.target) {
      case "PRODUCT": return !!productId && r.targetId === `gid://shopify/Product/${productId}`;
      case "VARIANT": return !!variantId && r.targetId === `gid://shopify/ProductVariant/${variantId}`;
      case "VENDOR": return vendor === r.targetId.toLowerCase();
      case "TAG": return !!meta && meta.tags.includes(r.targetId.toLowerCase());
      case "PRODUCT_TYPE": return !!meta && meta.productType === r.targetId.toLowerCase();
      case "COLLECTION": return !!meta && meta.collectionIds.includes(r.targetId);
    }
  });
  if (matching.some((r) => r.mode === "EXCLUDE")) return json({ points: 0, excluded: true });
  const mult = matching.filter((r) => r.mode === "MULTIPLIER").sort((a, b) => b.priority - a.priority || Number(b.value) - Number(a.value))[0];
  const bonus = matching.filter((r) => r.mode === "FIXED_BONUS").reduce((s, r) => s + Number(r.value ?? 0), 0);
  const points = Math.floor(price * Number(program.pointsPerDollar) * tierMult * (mult ? Number(mult.value) : 1) + bonus);
  return json({ points, pointsName: program.pointsName });
};
