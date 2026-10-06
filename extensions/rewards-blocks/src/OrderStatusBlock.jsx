import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, img, fmt, money, REWARDS_PAGE } from "./api.js";

export default async () => { render(<Block />, document.body); };

function Block() {
  const [d, setD] = useState(null);
  useEffect(() => { api("me").then(setD).catch(() => setD(false)); }, []);
  if (!d) return null;
  const { program, me } = d;
  const pn = program.pointsName;
  const orderName = shopify?.order?.value?.name || shopify?.order?.value?.id || null;
  const earned = orderName ? (me.history || []).find((h) => h.type === "ORDER" && (h.orderName === orderName || String(h.orderName).replace("#", "") === String(orderName).replace("#", ""))) : null;
  const worth = (me.balance * Number(program.pointValueCents || 0)) / 100;
  return (
    <s-box padding="base" border="base" borderRadius="base" background="subdued">
      <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-image src={img("sicon", { k: "spool" })} alt="" inlineSize="auto" accessibilityRole="presentation" />
          <s-stack gap="none">
            <s-text emphasis="bold">{earned ? `This order earned ${fmt(earned.points)} ${pn}${earned.status === "PENDING" ? " (pending)" : ""}` : `Your ${pn} are on the way`}</s-text>
            <s-text tone="subdued">Balance: {fmt(me.balance)} {pn}{worth > 0 ? ` · worth ${money(worth)}` : ""}</s-text>
          </s-stack>
        </s-stack>
        <s-button variant="secondary" href={REWARDS_PAGE}>My rewards</s-button>
      </s-stack>
    </s-box>
  );
}
