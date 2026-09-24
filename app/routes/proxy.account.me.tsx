import type { LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { authAccountRequest, cjson, CORS_HEADERS } from "../lib/rewards/account-auth.server";
import { resolveCustomer, maybeAwardBirthday, buildMePayload } from "../lib/rewards/storefront.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const auth = await authAccountRequest(request);
  if (!auth) return cjson({ error: "unauthorized" }, 401);
  const { admin } = await unauthenticated.admin(auth.shop);
  const c = await resolveCustomer(auth.shop, admin.graphql, auth.customerGid);
  if (!c) return cjson({ error: "Customer not found" }, 404);
  await maybeAwardBirthday(auth.shop, admin.graphql, c.id);
  return cjson(await buildMePayload(auth.shop, c.id, { history: true }));
};
