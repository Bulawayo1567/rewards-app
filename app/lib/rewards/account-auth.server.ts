import { authenticate } from "../../shopify.server";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};
export const cjson = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

/**
 * Validates the customer-account session token. The extension sends it as ?token= (to avoid a CORS preflight
 * through the app proxy); we re-wrap it as a Bearer header so the official validator can check it.
 * Returns { shop, customerGid } or null.
 */
export async function authAccountRequest(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const wrapped = new Request(request.url, { method: request.method, headers: { Authorization: `Bearer ${token}` } });
  try {
    const { sessionToken } = await authenticate.public.customerAccount(wrapped);
    const shop = String(sessionToken.dest ?? "").replace(/^https?:\/\//, "");
    const sub = String(sessionToken.sub ?? "");
    const customerGid = sub.startsWith("gid://") ? sub : `gid://shopify/Customer/${sub}`;
    if (!shop || !sub) return null;
    return { shop, customerGid };
  } catch (e) {
    console.error("[rewards] account token invalid", (e as Error).message);
    return null;
  }
}
