import { createHash } from "node:crypto";
import prisma from "../../db.server";
import { getProgram } from "./program.server";
import { mintDiscountCode, generateCode } from "./discounts.server";
import { upsertCustomer, recalcCustomer, syncCustomerMetafields } from "./customers.server";

type AdminGraphql = (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;

export class PlayError extends Error {}

export async function activeCampaign(shop: string, page: string) {
  const now = new Date();
  const c = await prisma.campaign.findFirst({
    where: { shop, active: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
    include: { prizes: { orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  if (!c) return null;
  if (c.showOnPages !== "all" && c.showOnPages !== page) return null;
  return c;
}

/** Public shape sent to the storefront — no weights. */
export function publicCampaign(c: NonNullable<Awaited<ReturnType<typeof activeCampaign>>>) {
  return {
    id: c.id, kind: c.kind, headline: c.headline, subheadline: c.subheadline, buttonLabel: c.buttonLabel,
    showDelaySeconds: c.showDelaySeconds, requireEmail: c.requireEmail, primaryColor: c.primaryColor,
    prizes: c.prizes.map((p) => ({ id: p.id, label: p.label, color: p.color })),
  };
}

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  let r = Math.random() * total;
  for (const i of items) { r -= Math.max(0, i.weight); if (r <= 0) return i; }
  return items[items.length - 1];
}

/** Finds or creates the Shopify customer for an email and subscribes them to email marketing. */
async function subscribeEmail(graphql: AdminGraphql, email: string) {
  const found = await graphql(`#graphql query F($q: String!) { customers(first: 1, query: $q) { nodes { id email emailMarketingConsent { marketingState } } } }`, { variables: { q: `email:${email}` } });
  const node = (await found.json())?.data?.customers?.nodes?.[0];
  if (node?.id) {
    if (node.emailMarketingConsent?.marketingState !== "SUBSCRIBED") {
      await graphql(`#graphql mutation S($input: CustomerEmailMarketingConsentUpdateInput!) { customerEmailMarketingConsentUpdate(input: $input) { userErrors { message } } }`,
        { variables: { input: { customerId: node.id, emailMarketingConsent: { marketingState: "SUBSCRIBED", marketingOptInLevel: "SINGLE_OPT_IN", consentUpdatedAt: new Date().toISOString() } } } });
    }
    return node.id as string;
  }
  const created = await graphql(`#graphql mutation C($input: CustomerInput!) { customerCreate(input: $input) { customer { id } userErrors { message } } }`,
    { variables: { input: { email, emailMarketingConsent: { marketingState: "SUBSCRIBED", marketingOptInLevel: "SINGLE_OPT_IN", consentUpdatedAt: new Date().toISOString() } } } });
  const j = await created.json();
  return (j?.data?.customerCreate?.customer?.id as string | undefined) ?? null;
}

export async function playCampaign(shop: string, graphql: AdminGraphql, campaignId: string, emailRaw: string, ip: string | null, loggedInCustomerId: string | null) {
  const c = await prisma.campaign.findFirst({ where: { shop, id: campaignId, active: true }, include: { prizes: true } });
  if (!c || !c.prizes.length) throw new PlayError("This offer has ended.");
  const email = emailRaw.trim().toLowerCase();
  if (c.requireEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new PlayError("Please enter a valid email.");
  const key = email || (ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : "");
  if (!key) throw new PlayError("Please enter your email to play.");

  if (c.onePlayPerEmail) {
    const prior = await prisma.campaignPlay.findUnique({ where: { campaignId_email: { campaignId: c.id, email: key } }, include: { prize: true } });
    if (prior) return { already: true, prize: { id: prior.prize.id, label: prior.prize.label, type: prior.prize.type }, code: prior.discountCode };
  }

  const prize = pickWeighted(c.prizes);
  const program = await getProgram(shop);

  // Subscribe + link customer (best effort; never blocks the play).
  let customerGid: string | null = null;
  let customer = null as Awaited<ReturnType<typeof upsertCustomer>>;
  if (email) {
    try { customerGid = await subscribeEmail(graphql, email); } catch (e) { console.error("[rewards] subscribe failed", e); }
    customer = await upsertCustomer(shop, { admin_graphql_api_id: customerGid ?? undefined, email });
  }

  let code: string | null = null;
  if (["PERCENT_OFF", "AMOUNT_OFF", "FREE_SHIPPING"].includes(prize.type)) {
    code = generateCode(program.codePrefix + "W");
    await mintDiscountCode(graphql, {
      code, title: `Pop-up prize: ${prize.label}${email ? ` — ${email}` : ""}`,
      customerGid, endsAt: new Date(Date.now() + prize.codeValidDays * 86_400_000),
      minSubtotal: prize.minOrderSubtotal == null ? null : Number(prize.minOrderSubtotal),
      kind: prize.type === "PERCENT_OFF" ? "PERCENTAGE" : prize.type === "AMOUNT_OFF" ? "FIXED_AMOUNT" : "FREE_SHIPPING",
      value: prize.value == null ? null : Number(prize.value),
    });
  }

  const play = await prisma.campaignPlay.create({
    data: { shop, campaignId: c.id, prizeId: prize.id, email: key, customerId: customer?.id ?? null, discountCode: code, ipHash: ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null },
  });

  if (prize.type === "POINTS" && customer && Number(prize.value) > 0) {
    await prisma.pointsLedger.create({ data: { shop, customerId: customer.id, type: "CAMPAIGN", points: Math.floor(Number(prize.value)), note: `${c.name}: ${prize.label}` } });
    const updated = await recalcCustomer(shop, customer.id);
    await syncCustomerMetafields(graphql, updated);
  }

  return { already: false, playId: play.id, prize: { id: prize.id, label: prize.label, type: prize.type }, code };
}
