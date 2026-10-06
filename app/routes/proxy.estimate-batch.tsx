import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { json, resolveCustomer } from "../lib/rewards/storefront.server";
import { metaByHandles, pointsFor, activeRules, programRate } from "../lib/rewards/estimate.server";

/** POST { items: [{ handle, price }] } → { points: { handle: n }, pointsName } */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) return json({ error: "unauthorized" }, 401);
  const shop = session.shop;
  const body = await request.json().catch(() => ({}));
  const items: { handle: string; price: number }[] = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  const { active, rate, pointsName } = await programRate(shop);
  if (!active) return json({ points: {}, pointsName });
  const c = await resolveCustomer(shop, admin.graphql, new URL(request.url).searchParams.get("logged_in_customer_id"));
  const tierMult = c?.tier ? Number(c.tier.multiplier) : 1;
  const rules = await activeRules(shop);
  const metas = rules.length ? await metaByHandles(admin.graphql, [...new Set(items.map((i) => i.handle))]) : new Map();
  const points: Record<string, number> = {};
  for (const it of items) points[it.handle] = pointsFor(metas.get(it.handle) ?? null, Number(it.price) || 0, rules, rate, tierMult);
  return json({ points, pointsName });
};
