import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { json, resolveCustomer, maybeAwardBirthday } from "../lib/rewards/storefront.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session) return json({ error: "unauthorized" }, 401);
  const cid = new URL(request.url).searchParams.get("logged_in_customer_id");
  const c = await resolveCustomer(session.shop, admin?.graphql, cid);
  if (!c) return json({ error: "Please sign in." }, 401);
  if (c.birthday) return json({ error: "Your birthday is already set. Contact us to change it." }, 400);
  const body = await request.json().catch(() => ({}));
  const month = Number(body.month), day = Number(body.day);
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return json({ error: "Enter a valid month and day." }, 400);
  await prisma.customer.update({ where: { id: c.id }, data: { birthday: new Date(Date.UTC(1900, month - 1, day)) } });
  const awarded = await maybeAwardBirthday(session.shop, admin?.graphql, c.id);
  return json({ ok: true, awarded });
};
