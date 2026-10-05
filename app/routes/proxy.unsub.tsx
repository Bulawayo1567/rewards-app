import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { unsubToken } from "../lib/rewards/email.server";

const page = (msg: string) => new Response(`<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4eee4;display:grid;place-items:center;min-height:100vh;margin:0"><div style="background:#fff;border:2px dashed #c60d11;border-radius:16px;padding:32px;max-width:420px;text-align:center"><h2 style="margin:0 0 8px">${msg}</h2><p style="color:#666;margin:0">You can re-subscribe any time from your account page.</p></div></body></html>`, { headers: { "Content-Type": "text/html" } });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("c") ?? "", t = url.searchParams.get("t") ?? "";
  if (!id || t !== unsubToken(id)) return page("That link isn't valid.");
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) return page("That link isn't valid.");
  await prisma.customer.update({ where: { id }, data: { marketingConsent: false } });
  if (c.shopifyId) {
    try {
      const { admin } = await unauthenticated.admin(c.shop);
      await admin.graphql(`#graphql mutation U($input: CustomerEmailMarketingConsentUpdateInput!) { customerEmailMarketingConsentUpdate(input: $input) { userErrors { message } } }`,
        { variables: { input: { customerId: c.shopifyId, emailMarketingConsent: { marketingState: "UNSUBSCRIBED", consentUpdatedAt: new Date().toISOString() } } } });
    } catch (e) { console.error("[rewards] unsub shopify sync failed", e); }
  }
  return page("You're unsubscribed from rewards emails.");
};
