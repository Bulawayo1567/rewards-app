import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { json, resolveCustomer, maybeAwardBirthday, buildMePayload } from "../lib/rewards/storefront.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const cid = url.searchParams.get("logged_in_customer_id");
  const c = await resolveCustomer(session.shop, admin?.graphql, cid);
  if (c) await maybeAwardBirthday(session.shop, admin?.graphql, c.id);
  return json(await buildMePayload(session.shop, c?.id ?? null));
};
