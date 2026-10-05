import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { num, bool } from "../lib/rewards/format";
import { Hero, UIStyles, Tabs, EARN_TABS, Card, Field, Chip } from "../lib/rewards/ui";

const ICONS: Record<string, string> = { SIGNUP: "🧷", NEWSLETTER: "✉️", BIRTHDAY: "🎂", REVIEW: "⭐", REFERRAL_REFERRER: "🧵", REFERRAL_FRIEND: "🪡" };
const EVENTS = [
  { event: "SIGNUP", label: "Create an account", hint: "Awarded once when a customer registers." },
  { event: "NEWSLETTER", label: "Subscribe to newsletter", hint: "Awarded once when email marketing consent becomes subscribed (any source, including the pop-up)." },
  { event: "BIRTHDAY", label: "Birthday", hint: "Awarded once per year on the customer's birthday (they enter it in the rewards panel)." },
  { event: "REVIEW", label: "Leave a product review", hint: "Awarded per review, via the review app webhook (later phase)." },
  { event: "REFERRAL_REFERRER", label: "Refer a friend — referrer", hint: "Awarded to the referrer when the friend's first order is paid." },
  { event: "REFERRAL_FRIEND", label: "Refer a friend — friend", hint: "Awarded to the new customer on their first paid order." },
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rules = await prisma.earnRule.findMany({ where: { shop: session.shop } });
  const byEvent = Object.fromEntries(rules.map((r) => [r.event, r]));
  return { byEvent };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  await prisma.$transaction(
    EVENTS.map(({ event }) =>
      prisma.earnRule.upsert({
        where: { shop_event: { shop, event } },
        update: { points: Math.max(0, Math.floor(num(fd, `points_${event}`))), active: bool(fd, `active_${event}`) },
        create: { shop, event, points: Math.max(0, Math.floor(num(fd, `points_${event}`))), active: bool(fd, `active_${event}`) },
      }),
    ),
  );
  return { ok: true, message: "Earning rules saved" };
};

export default function EarnRules() {
  const { byEvent } = useLoaderData<typeof loader>();
  useActionToast();
  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title="Earn & Redeem" sub="How members earn bonus points beyond purchases" />
      <Tabs items={EARN_TABS} active="earn" />
      <Form method="post">
        <Card icon="🪡" title="Bonus ways to earn" sub="Purchases earn at the rate in Settings. These are the extras — set the points and switch each one on or off.">
          <div className="st-rows">
            {EVENTS.map(({ event, label, hint }) => (
              <div className="st-row" key={event}>
                <div><div className="ttl">{ICONS[event]} {label}</div><div className="dsc">{hint}</div></div>
                <Field label="Points"><input name={`points_${event}`} type="number" min="0" defaultValue={byEvent[event]?.points ?? 0} /></Field>
                <div style={{ paddingBottom: 2 }}><Chip name={`active_${event}`} label="Active" defaultChecked={byEvent[event]?.active ?? false} /></div>
              </div>
            ))}
          </div>
          <div className="st-foot" style={{ marginTop: 16 }}><button className="st-btn primary" type="submit">Save</button></div>
        </Card>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
