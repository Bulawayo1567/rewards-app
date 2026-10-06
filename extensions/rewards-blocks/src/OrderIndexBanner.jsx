import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, img, fmt, money, REWARDS_PAGE } from "./api.js";

export default async () => { render(<Banner />, document.body); };

function Banner() {
  const [d, setD] = useState(null);
  useEffect(() => { api("me").then(setD).catch(() => setD(false)); }, []);
  if (!d) return null;
  const { program, me } = d;
  const pn = program.pointsName;
  const worth = (me.balance * Number(program.pointValueCents || 0)) / 100;
  return (
    <s-box padding="base" border="base" borderRadius="base" background="subdued">
      <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-image src={img("sicon", { k: "cushion" })} alt="" inlineSize="auto" accessibilityRole="presentation" />
          <s-stack gap="none">
            <s-text emphasis="bold">You've got {fmt(me.balance)} {pn}{worth > 0 ? ` — worth ${money(worth)}` : ""}</s-text>
            <s-text tone="subdued">{me.nextTier ? `${fmt(me.nextTier.needed)} more to reach ${me.nextTier.name}` : me.tier ? `${me.tier.name} member` : `Earn ${program.pointsPerDollar} ${pn} per $1`}</s-text>
          </s-stack>
        </s-stack>
        <s-button variant="primary" href={REWARDS_PAGE}>Spend them</s-button>
      </s-stack>
    </s-box>
  );
}
