import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { recalcCustomer, syncCustomerMetafields } from "../lib/rewards/customers.server";

/**
 * Daily maintenance, triggered by Vercel Cron (see vercel.json).
 * Protected by CRON_SECRET: Vercel sends "Authorization: Bearer <CRON_SECRET>".
 *  1. Release PENDING order points whose hold period has ended.
 *  2. Award birthday points to customers whose birthday is today (once per year).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = request.headers.get("Authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const year = now.getUTCFullYear(), month = now.getUTCMonth(), day = now.getUTCDate();
  const summary: Record<string, unknown> = {};

  // 1. Release held points
  const pending = await prisma.pointsLedger.findMany({ where: { status: "PENDING", availableAt: { lte: now } }, select: { id: true, shop: true, customerId: true } });
  if (pending.length) await prisma.pointsLedger.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: "AVAILABLE" } });
  summary.released = pending.length;

  // 2. Birthdays
  const rules = await prisma.earnRule.findMany({ where: { event: "BIRTHDAY", active: true, points: { gt: 0 } } });
  const touched = new Map<string, Set<string>>(); // shop -> customerIds to resync
  for (const p of pending) { if (!touched.has(p.shop)) touched.set(p.shop, new Set()); touched.get(p.shop)!.add(p.customerId); }
  let birthdays = 0;
  for (const rule of rules) {
    const candidates = await prisma.customer.findMany({
      where: { shop: rule.shop, birthday: { not: null }, OR: [{ birthdayAwardedYear: null }, { birthdayAwardedYear: { lt: year } }] },
      select: { id: true, birthday: true },
    });
    for (const c of candidates) {
      const b = c.birthday!;
      if (b.getUTCMonth() !== month || b.getUTCDate() !== day) continue;
      await prisma.$transaction([
        prisma.pointsLedger.create({ data: { shop: rule.shop, customerId: c.id, type: "BIRTHDAY", points: rule.points, note: `Happy birthday ${year}!` } }),
        prisma.customer.update({ where: { id: c.id }, data: { birthdayAwardedYear: year } }),
      ]);
      birthdays++;
      if (!touched.has(rule.shop)) touched.set(rule.shop, new Set());
      touched.get(rule.shop)!.add(c.id);
    }
  }
  summary.birthdays = birthdays;

  // Recalculate + sync metafields for everyone affected
  for (const [shop, ids] of touched) {
    let graphql: any = null;
    try { graphql = (await unauthenticated.admin(shop)).admin.graphql; } catch (e) { console.error("[rewards] cron: no session for", shop); }
    for (const id of ids) {
      const updated = await recalcCustomer(shop, id);
      if (graphql) await syncCustomerMetafields(graphql, updated);
    }
  }

  console.log("[rewards] cron daily", summary);
  return new Response(JSON.stringify(summary), { headers: { "Content-Type": "application/json" } });
};
