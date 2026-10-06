import { appUrlFor } from "./config.js";

export let BASE = "", SHOP = "";
export function shopFromToken(token) {
  const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  return String(payload.dest || "").replace(/^https?:\/\//, "");
}
export async function api(path, body) {
  const token = await shopify.sessionToken.get();
  SHOP = shopFromToken(token); BASE = appUrlFor(SHOP);
  const r = await fetch(`${BASE}/proxy/account/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
export const img = (kind, params = {}) => `${BASE}/img/${kind}?${new URLSearchParams(params)}`;
export const fmt = (n) => Number(n || 0).toLocaleString();
export const money = (n) => "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const REWARDS_PAGE = "extension:rewards-account/";
