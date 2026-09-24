import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { json } from "../lib/rewards/storefront.server";
import { playCampaign, PlayError } from "../lib/rewards/campaigns.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    const result = await playCampaign(session.shop, admin.graphql, String(body.campaignId ?? ""), String(body.email ?? ""), ip, url.searchParams.get("logged_in_customer_id"));
    return json(result);
  } catch (e) {
    if (e instanceof PlayError) return json({ error: e.message }, 400);
    console.error("[rewards] play failed", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
};
