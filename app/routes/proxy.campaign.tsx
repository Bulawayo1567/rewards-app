import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { json } from "../lib/rewards/storefront.server";
import { activeCampaign, publicCampaign } from "../lib/rewards/campaigns.server";

/** GET ?page=home|product|collection|other → active campaign for that page, or null */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const page = new URL(request.url).searchParams.get("page") ?? "other";
  const c = await activeCampaign(session.shop, page);
  return json({ campaign: c ? publicCampaign(c) : null });
};
