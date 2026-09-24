import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { awardOrderPoints, type OrderPayload } from "../lib/rewards/points.server";
import { markCodesUsed } from "../lib/rewards/redeem.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin, topic } = await authenticate.webhook(request);
  if (!admin) return new Response("no admin session", { status: 200 });
  const order = payload as OrderPayload;

  try {
    await markCodesUsed(shop, order);
    const result = await awardOrderPoints(shop, admin.graphql, order);
    console.log(`[rewards] ${topic}`, order.name, result);
  } catch (err) {
    console.error(`[rewards] ${topic} failed`, err);
  }
  return new Response(null, { status: 200 });
};
