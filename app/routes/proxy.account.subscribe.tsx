import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { authAccountRequest, cjson, CORS_HEADERS } from "../lib/rewards/account-auth.server";
import { resolveCustomer } from "../lib/rewards/storefront.server";
import { recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";

export const loader = async (_: LoaderFunctionArgs) => new Response(null, { status: 204, headers: CORS_HEADERS });

/** Subscribes the logged-in customer to email marketing and awards the newsletter bonus (once). */
export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await authAccountRequest(request);
  if (!auth) return cjson({ error: "unauthorized" }, 401);
  const { admin } = await unauthenticated.admin(auth.shop);
  const c = await resolveCustomer(auth.shop, admin.graphql, auth.customerGid);
  if (!c) return cjson({ error: "Customer not found" }, 404);
  if (c.shopifyId) {
    const r = await admin.graphql(`#graphql mutation S($input: CustomerEmailMarketingConsentUpdateInput!) { customerEmailMarketingConsentUpdate(input: $input) { userErrors { message } } }`,
      { variables: { input: { customerId: c.shopifyId, emailMarketingConsent: { marketingState: "SUBSCRIBED", marketingOptInLevel: "SINGLE_OPT_IN", consentUpdatedAt: new Date().toISOString() } } } });
    const errs = (await r.json())?.data?.customerEmailMarketingConsentUpdate?.userErrors;
    if (errs?.length) return cjson({ error: errs[0].message }, 400);
  }
  await prisma.customer.update({ where: { id: c.id }, data: { marketingConsent: true } });
  let awarded = 0;
  const rule = await prisma.earnRule.findUnique({ where: { shop_event: { shop: auth.shop, event: "NEWSLETTER" } } });
  if (rule?.active && rule.points > 0 && !c.newsletterAwarded && c.spam !== "spam" && c.spam !== "suspicious") {
    await prisma.$transaction([
      prisma.pointsLedger.create({ data: { shop: auth.shop, customerId: c.id, type: "NEWSLETTER", points: rule.points, note: "Newsletter signup" } }),
      prisma.customer.update({ where: { id: c.id }, data: { newsletterAwarded: true } }),
    ]);
    awarded = rule.points;
    const updated = await recalcCustomer(auth.shop, c.id);
    await syncCustomerMetafields(admin.graphql, updated);
  }
  return cjson({ ok: true, awarded });
};
