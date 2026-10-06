import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

// Set this to the production app URL. (Thank-you blocks can't read the session token's shop the same way,
// so the URL is fixed here; the dev store will simply show nothing.)
const APP_URL = "https://aas-rewards.vercel.app";

export default async () => { render(<ThankYou />, document.body); };

const fmt = (n) => Number(n || 0).toLocaleString();
const money = (n) => "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ThankYou() {
  const [p, setP] = useState(null);
  const shopDomain = shopify?.shop?.myshopifyDomain;
  useEffect(() => {
    if (!shopDomain) return;
    fetch(`${APP_URL}/public/program?shop=${encodeURIComponent(shopDomain)}`).then((r) => r.json()).then(setP).catch(() => {});
  }, [shopDomain]);
  if (!p || !p.active) return null;
  const subtotal = Number(shopify?.cost?.subtotalAmount?.value?.amount ?? 0);
  const earned = Math.floor(subtotal * p.pointsPerDollar);
  if (earned <= 0) return null;
  const worth = (earned * p.pointValueCents) / 100;
  const loggedIn = !!shopify?.buyerIdentity?.customer?.value?.id;
  const storeUrl = (shopify?.shop?.storefrontUrl || `https://${shopDomain}`).replace(/\/$/, "");
  return (
    <s-box padding="base" border="base" borderRadius="base" background="subdued">
      <s-stack gap="small">
        <s-text emphasis="bold">🧵 You just earned about {fmt(earned)} {p.pointsName}{worth > 0 ? ` — worth ${money(worth)} toward your next order` : ""}</s-text>
        <s-text tone="subdued">{loggedIn ? `They'll show in your rewards account once the order is paid.` : `Create an account with this email to keep them — then spend them any time from your rewards page.`}</s-text>
        <s-stack direction="inline" gap="small">
          <s-button variant="primary" href={`${storeUrl}/account`}>{loggedIn ? "See my rewards" : "Create an account"}</s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}
