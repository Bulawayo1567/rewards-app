import prisma from "../../db.server";
import { getProgram } from "./program.server";
import { recalcCustomer, syncCustomerMetafields } from "./customers.server";
import { mintDiscountCode, deactivateDiscount, generateCode } from "./discounts.server";

type AdminGraphql = (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;

export class RedeemError extends Error {}

export async function redeemReward(shop: string, graphql: AdminGraphql, customerId: string, rewardId: string, staffEmail?: string | null) {
  const program = await getProgram(shop);
  const [customer, reward] = await Promise.all([
    prisma.customer.findFirst({ where: { shop, id: customerId }, include: { tier: true } }),
    prisma.reward.findFirst({ where: { shop, id: rewardId, active: true } }),
  ]);
  if (!customer) throw new RedeemError("Customer not found");
  if (!reward) throw new RedeemError("Reward not available");
  if (customer.balance < program.minRedeemPoints) throw new RedeemError(`Minimum balance to redeem is ${program.minRedeemPoints}`);
  if (customer.balance < reward.pointsCost) throw new RedeemError(`Needs ${reward.pointsCost} points, has ${customer.balance}`);
  if (reward.minTierRank != null && (customer.tier?.rank ?? -1) < reward.minTierRank) throw new RedeemError("Reward requires a higher tier");

  const code = generateCode(program.codePrefix);
  const expiresAt = new Date(Date.now() + reward.codeValidDays * 86_400_000);

  const nodeId = await mintDiscountCode(graphql, {
    code,
    title: `Rewards: ${reward.name} — ${customer.email}`,
    customerGid: customer.shopifyId,
    endsAt: expiresAt,
    minSubtotal: reward.minOrderSubtotal == null ? null : Number(reward.minOrderSubtotal),
    kind: reward.type,
    value: reward.value == null ? null : Number(reward.value),
    variantGid: reward.variantId,
  });

  const redemption = await prisma.$transaction(async (tx) => {
    const r = await tx.redemption.create({
      data: { shop, customerId: customer.id, rewardId: reward.id, pointsSpent: reward.pointsCost, discountCode: code, discountNodeId: nodeId, expiresAt },
    });
    await tx.pointsLedger.create({
      data: { shop, customerId: customer.id, type: "REDEEM", points: -reward.pointsCost, redemptionId: r.id, note: `Redeemed: ${reward.name} (${code})`, staffEmail: staffEmail ?? null },
    });
    return r;
  });

  const updated = await recalcCustomer(shop, customer.id);
  await syncCustomerMetafields(graphql, updated);
  return { redemption, code, expiresAt };
}

export async function reverseRedemption(shop: string, graphql: AdminGraphql, redemptionId: string, staffEmail?: string | null) {
  const r = await prisma.redemption.findFirst({ where: { shop, id: redemptionId } });
  if (!r) throw new RedeemError("Redemption not found");
  if (r.status === "REVERSED") throw new RedeemError("Already reversed");

  if (r.discountNodeId) await deactivateDiscount(graphql, r.discountNodeId);

  await prisma.$transaction([
    prisma.redemption.update({ where: { id: r.id }, data: { status: "REVERSED" } }),
    prisma.pointsLedger.create({
      data: { shop, customerId: r.customerId, type: "REDEEM_REVERSAL", points: r.pointsSpent, redemptionId: r.id, note: `Reversed redemption ${r.discountCode}`, staffEmail: staffEmail ?? null },
    }),
  ]);
  const updated = await recalcCustomer(shop, r.customerId);
  await syncCustomerMetafields(graphql, updated);
}

/** Called from orders/paid: flags any of our codes on the order as USED. */
export async function markCodesUsed(shop: string, order: { admin_graphql_api_id: string; discount_codes?: { code: string }[] }) {
  const codes = (order.discount_codes ?? []).map((d) => d.code.toUpperCase());
  if (!codes.length) return;
  await prisma.redemption.updateMany({
    where: { shop, discountCode: { in: codes }, status: "ISSUED" },
    data: { status: "USED", usedOrderId: order.admin_graphql_api_id },
  });
  await prisma.campaignPlay.updateMany({
    where: { shop, discountCode: { in: codes } },
    data: {},
  });
}
