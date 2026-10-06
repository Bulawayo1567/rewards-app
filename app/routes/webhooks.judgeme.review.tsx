import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { upsertCustomer, recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";

export const loader = async (_: LoaderFunctionArgs) => new Response("ok", { status: 200 });

/**
 * Judge.me → POST /webhooks/judgeme/review?shop=<shop>.myshopify.com&token=<judgemeToken>
 * Awards the REVIEW rule once per customer + product for published reviews. Matched by reviewer email.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const body: any = await request.json().catch(() => ({}));
  const review = body.review ?? body;
  const shop = (url.searchParams.get("shop") || body.shop_domain || review.shop_domain || "").toLowerCase();
  const token = url.searchParams.get("token") || "";
  const program = shop ? await prisma.program.findUnique({ where: { shop } }) : null;
  if (!program || !program.judgemeToken || token !== program.judgemeToken) return new Response("unauthorized", { status: 401 });

  const published = review.published === true || review.published === "true" || review.curated === "ok" || review.hidden === false;
  const email = String(review.reviewer?.email ?? review.email ?? "").trim().toLowerCase();
  const productId = String(review.product_external_id ?? review.product_id ?? review.product_handle ?? "");
  const reviewId = String(review.id ?? "");
  if (!email || !productId || !published) return new Response("ignored", { status: 200 });

  const rule = await prisma.earnRule.findUnique({ where: { shop_event: { shop, event: "REVIEW" } } });
  if (!rule?.active || rule.points <= 0) return new Response("rule off", { status: 200 });

  const c = await upsertCustomer(shop, { email, first_name: review.reviewer?.name?.split(" ")[0], last_name: review.reviewer?.name?.split(" ").slice(1).join(" ") });
  if (!c || c.spam === "spam" || c.spam === "suspicious") return new Response("skipped", { status: 200 });

  const key = `judgeme:${reviewId} product:${productId}`;
  const dup = await prisma.pointsLedger.findFirst({ where: { shop, customerId: c.id, type: "REVIEW", OR: [{ note: { contains: `product:${productId}` } }, ...(reviewId ? [{ note: { contains: `judgeme:${reviewId}` } }] : [])] } });
  if (dup) return new Response("already awarded", { status: 200 });

  await prisma.pointsLedger.create({ data: { shop, customerId: c.id, type: "REVIEW", points: rule.points, note: `Product review (${key})` } });
  const updated = await recalcCustomer(shop, c.id);
  try { const { admin } = await unauthenticated.admin(shop); await syncCustomerMetafields(admin.graphql, updated); } catch {}
  return new Response("awarded", { status: 200 });
};
