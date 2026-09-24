import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { upsertCustomer, recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";

/** New account → SIGNUP points (once). Marketing consent handled in customers/update. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  if (!admin) return new Response(null, { status: 200 });

  try {
    const c = await upsertCustomer(shop, payload as any);
    if (!c) return new Response(null, { status: 200 });

    const rule = await prisma.earnRule.findUnique({ where: { shop_event: { shop, event: "SIGNUP" } } });
    if (rule?.active && rule.points > 0 && !c.signupAwarded) {
      await prisma.$transaction([
        prisma.pointsLedger.create({
          data: { shop, customerId: c.id, type: "SIGNUP", points: rule.points, note: "Account created" },
        }),
        prisma.customer.update({ where: { id: c.id }, data: { signupAwarded: true } }),
      ]);
    }
    const updated = await recalcCustomer(shop, c.id);
    await syncCustomerMetafields(admin.graphql, updated);
  } catch (err) {
    console.error("[rewards] customers/create failed", err);
  }
  return new Response(null, { status: 200 });
};
