import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { awardOrderPoints, type OrderPayload } from "../lib/rewards/points.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin, topic } = await authenticate.webhook(request);
  if (!admin) return new Response("no admin session", { status: 200 });

  try {
    const result = await awardOrderPoints(shop, admin.graphql, payload as OrderPayload);
    console.log(`[rewards] ${topic}`, (payload as OrderPayload).name, result);
  } catch (err) {
    console.error(`[rewards] ${topic} failed`, err);
    // Return 200 so Shopify doesn't retry forever on a bug; the ledger is idempotent so a manual replay is safe.
  }
  return new Response(null, { status: 200 });
};
