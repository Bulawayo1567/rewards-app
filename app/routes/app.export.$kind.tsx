import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const csv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map((v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const stamp = new Date().toISOString().slice(0, 10);
  let body = "", name = "";

  if (params.kind === "members") {
    const rows = await prisma.customer.findMany({ where: { shop }, include: { tier: true }, orderBy: { balance: "desc" } });
    body = csv([["Email", "First name", "Last name", "Balance", "Pending", "Lifetime points", "Lifetime spend", "Tier", "Birthday", "Has Shopify account", "Joined"],
      ...rows.map((c) => [c.email, c.firstName, c.lastName, c.balance, c.pendingBalance, c.lifetimePoints, Number(c.lifetimeSpend).toFixed(2), c.tier?.name ?? "", c.birthday ? c.birthday.toISOString().slice(5, 10) : "", c.shopifyId ? "yes" : "no", c.createdAt.toISOString().slice(0, 10)])]);
    name = `rewards-members-${stamp}.csv`;
  } else if (params.kind === "ledger") {
    const since = new Date(Date.now() - 365 * 86_400_000);
    const rows = await prisma.pointsLedger.findMany({ where: { shop, createdAt: { gte: since } }, include: { customer: { select: { email: true } } }, orderBy: { createdAt: "desc" } });
    body = csv([["Date", "Email", "Type", "Status", "Points", "Order", "Note", "Staff"],
      ...rows.map((l) => [l.createdAt.toISOString(), l.customer.email, l.type, l.status, l.points, l.orderName, l.note, l.staffEmail])]);
    name = `rewards-ledger-${stamp}.csv`;
  } else return new Response("Not found", { status: 404 });

  return new Response("\uFEFF" + body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
};
