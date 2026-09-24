import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { authAccountRequest, cjson, CORS_HEADERS } from "../lib/rewards/account-auth.server";
import { resolveCustomer } from "../lib/rewards/storefront.server";
import { redeemReward, RedeemError } from "../lib/rewards/redeem.server";

export const loader = async (_: LoaderFunctionArgs) => new Response(null, { status: 204, headers: CORS_HEADERS });

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await authAccountRequest(request);
  if (!auth) return cjson({ error: "unauthorized" }, 401);
  const { admin } = await unauthenticated.admin(auth.shop);
  const c = await resolveCustomer(auth.shop, admin.graphql, auth.customerGid);
  if (!c) return cjson({ error: "Customer not found" }, 404);
  const body = await request.text().then((t) => { try { return JSON.parse(t); } catch { return {}; } });
  try {
    const { code, expiresAt } = await redeemReward(auth.shop, admin.graphql, c.id, String(body.rewardId ?? ""));
    return cjson({ ok: true, code, expiresAt: expiresAt.toISOString() });
  } catch (e) {
    if (e instanceof RedeemError) return cjson({ error: e.message }, 400);
    console.error("[rewards] account redeem failed", e);
    return cjson({ error: "Couldn't redeem right now. Please try again." }, 500);
  }
};
