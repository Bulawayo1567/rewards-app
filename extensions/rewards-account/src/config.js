// Backend address per store. The live store uses the fixed Vercel URL.
// Any other store (i.e. the dev store) uses the tunnel URL printed by `shopify app dev`
// on the "app_home │ Using URL" line — update DEV_URL when you restart dev.
const PRODUCTION = {
  "all-about-sewing-canada.myshopify.com": "https://aas-rewards.vercel.app",
};
const DEV_URL = "https://jam-driven-jenny-figured.trycloudflare.com";

export function appUrlFor(shopDomain) {
  return PRODUCTION[shopDomain] || DEV_URL;
}