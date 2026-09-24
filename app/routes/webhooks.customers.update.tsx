import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { upsertCustomer, recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";

/** Email-marketing opt-in → NEWSLETTER points (once per customer). */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  if (!admin) return new Response(null, { status: 200 });

  try {
    const p = payload as any;
    const c = await upsertCustomer(shop, p);
    if (!c) return new Response(null, { status: 200 });

    const subscribed = p.email_marketing_consent?.state === "subscribed";
    const rule = await prisma.earnRule.findUnique({ where: { shop_event: { shop, event: "NEWSLETTER" } } });

    if (subscribed && rule?.active && rule.points > 0 && !c.newsletterAwarded) {
      await prisma.$transaction([
        prisma.pointsLedger.create({
          data: { shop, customerId: c.id, type: "NEWSLETTER", points: rule.points, note: "Newsletter signup" },
        }),
        prisma.customer.update({ where: { id: c.id }, data: { newsletterAwarded: true } }),
      ]);
      const updated = await recalcCustomer(shop, c.id);
      await syncCustomerMetafields(admin.graphql, updated);
    }
  } catch (err) {
    console.error("[rewards] customers/update failed", err);
  }
  return new Response(null, { status: 200 });
};
