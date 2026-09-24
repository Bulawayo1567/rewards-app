import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { num, bool } from "../lib/rewards/format";

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
    <s-page heading="Ways to earn">
      <Form method="post">
        <s-section heading="Bonus events">
          {EVENTS.map(({ event, label, hint }) => (
            <s-box key={event} padding="base" border="base" borderRadius="base">
              <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="end">
                <s-number-field name={`points_${event}`} label={label} details={hint} defaultValue={String(byEvent[event]?.points ?? 0)} min={0} />
                <s-checkbox name={`active_${event}`} label="Active" defaultChecked={byEvent[event]?.active ?? false} />
              </s-grid>
            </s-box>
          ))}
        </s-section>
        <s-section>
          <s-button type="submit" variant="primary">Save</s-button>
        </s-section>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
