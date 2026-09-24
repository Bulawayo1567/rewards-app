import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { authAccountRequest, cjson, CORS_HEADERS } from "../lib/rewards/account-auth.server";
import { resolveCustomer, maybeAwardBirthday } from "../lib/rewards/storefront.server";

export const loader = async (_: LoaderFunctionArgs) => new Response(null, { status: 204, headers: CORS_HEADERS });

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await authAccountRequest(request);
  if (!auth) return cjson({ error: "unauthorized" }, 401);
  const { admin } = await unauthenticated.admin(auth.shop);
  const c = await resolveCustomer(auth.shop, admin.graphql, auth.customerGid);
  if (!c) return cjson({ error: "Customer not found" }, 404);
  if (c.birthday) return cjson({ error: "Your birthday is already set. Contact us to change it." }, 400);
  const body = await request.text().then((t) => { try { return JSON.parse(t); } catch { return {}; } });
  const month = Number(body.month), day = Number(body.day);
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return cjson({ error: "Enter a valid month and day." }, 400);
  await prisma.customer.update({ where: { id: c.id }, data: { birthday: new Date(Date.UTC(1900, month - 1, day)) } });
  const awarded = await maybeAwardBirthday(auth.shop, admin.graphql, c.id);
  return cjson({ ok: true, awarded });
};
