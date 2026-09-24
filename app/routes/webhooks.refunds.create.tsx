import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { reverseForRefund, type RefundPayload } from "../lib/rewards/points.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin, topic } = await authenticate.webhook(request);
  if (!admin) return new Response("no admin session", { status: 200 });

  try {
    const result = await reverseForRefund(shop, admin.graphql, payload as RefundPayload);
    console.log(`[rewards] ${topic}`, (payload as RefundPayload).order_id, result);
  } catch (err) {
    console.error(`[rewards] ${topic} failed`, err);
  }
  return new Response(null, { status: 200 });
};
