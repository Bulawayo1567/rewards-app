import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { json, resolveCustomer } from "../lib/rewards/storefront.server";
import { redeemReward, RedeemError } from "../lib/rewards/redeem.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) return json({ error: "unauthorized" }, 401);
  const cid = new URL(request.url).searchParams.get("logged_in_customer_id");
  const c = await resolveCustomer(session.shop, admin.graphql, cid);
  if (!c) return json({ error: "Please sign in to redeem." }, 401);
  const body = await request.json().catch(() => ({}));
  try {
    const { code, expiresAt } = await redeemReward(session.shop, admin.graphql, c.id, String(body.rewardId ?? ""));
    return json({ ok: true, code, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    if (e instanceof RedeemError) return json({ error: e.message }, 400);
    console.error("[rewards] proxy redeem failed", e);
    return json({ error: "Couldn't redeem right now. Please try again." }, 500);
  }
};
