import { createHmac } from "node:crypto";
import prisma from "../../db.server";
import { getProgram } from "./program.server";

import { TEMPLATES, type TemplateKey } from "./email-templates";
export { TEMPLATES, type TemplateKey };

const RED = "#c60d11", INK = "#1f1f1f", BLUSH = "#fbe7e8";

export function unsubToken(customerId: string) {
  return createHmac("sha256", process.env.APP_SECRET || process.env.SHOPIFY_API_SECRET || "x").update(customerId).digest("hex").slice(0, 24);
}

export interface Ctx { program: { name: string; pointsName: string; pointValueCents: number; pointsPerDollar: number; minRedeemPoints: number }; customer: { id: string; firstName: string | null; email: string; balance: number; tierName: string | null; nextTier: string | null; needed: number | null }; rewards: { name: string; pointsCost: number }[]; appUrl: string; storeUrl: string; accountUrl: string; extra: Record<string, string> }

export function fill(s: string, ctx: Ctx) {
  const worth = (ctx.customer.balance * ctx.program.pointValueCents) / 100;
  const map: Record<string, string> = {
    program: ctx.program.name, points: ctx.program.pointsName, name: ctx.customer.firstName || "there",
    balance: ctx.customer.balance.toLocaleString(), worth: `$${worth.toFixed(2)}`, tier: ctx.customer.tierName || "", next: ctx.customer.nextTier || "",
    rate: String(ctx.program.pointsPerDollar), ...ctx.extra,
  };
  return s.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? "");
}

function layout(ctx: Ctx, body: string, cta?: { label: string; href: string }) {
  const worth = (ctx.customer.balance * ctx.program.pointValueCents) / 100;
  const unsub = `${ctx.appUrl}/proxy/unsub?c=${ctx.customer.id}&t=${unsubToken(ctx.customer.id)}`;
  return `<!doctype html><html><body style="margin:0;background:#f4eee4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4eee4;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
  <tr><td><img src="${ctx.appUrl}/img/banner?t=${encodeURIComponent(ctx.program.name)}" width="560" alt="${ctx.program.name}" style="display:block;width:100%;border-radius:16px"></td></tr>
  <tr><td style="height:14px"></td></tr>
  <tr><td style="background:#fff;border-radius:16px;padding:28px 28px 24px;border:2px dashed #e3d9cc">
    <p style="margin:0 0 14px;font-size:20px;font-weight:800">Hi ${ctx.customer.firstName || "there"},</p>
    ${body}
    <table cellpadding="0" cellspacing="0" style="margin:18px auto 6px"><tr><td align="center">
      <img src="${ctx.appUrl}/img/tag?n=${encodeURIComponent(ctx.customer.balance.toLocaleString())}&u=${encodeURIComponent(ctx.program.pointsName)}" alt="${ctx.customer.balance} ${ctx.program.pointsName}" style="display:block;max-width:300px;width:100%">
      ${worth > 0 ? `<img src="${ctx.appUrl}/img/worth?t=${encodeURIComponent("$" + worth.toFixed(2))}" alt="Worth $${worth.toFixed(2)} in rewards" style="display:block;max-width:280px;width:100%;margin:8px auto 0">` : ""}
    </td></tr></table>
    ${cta ? `<table cellpadding="0" cellspacing="0" style="margin:18px auto 0"><tr><td align="center" style="background:${RED};border-radius:12px"><a href="${cta.href}" style="display:inline-block;padding:14px 26px;color:#fff;font-weight:800;text-decoration:none;font-size:15px;border:1.5px dashed rgba(255,255,255,.7);border-radius:9px;margin:4px">${cta.label}</a></td></tr></table>` : ""}
  </td></tr>
  <tr><td style="padding:16px 8px;text-align:center;font-size:12px;color:#8a8a8a">${ctx.program.name} · <a href="${ctx.storeUrl}" style="color:#8a8a8a">${ctx.storeUrl.replace(/^https?:\/\//, "")}</a><br>You're receiving this because you're a rewards member. <a href="${unsub}" style="color:#8a8a8a">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
}

const P = (s: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#333">${s}</p>`;
const rewardsList = (ctx: Ctx) => ctx.rewards.length ? `<table cellpadding="0" cellspacing="0" style="margin:6px 0 12px;width:100%">${ctx.rewards.slice(0, 3).map((r) => `<tr><td style="padding:8px 12px;border:1.5px dashed ${RED};border-radius:10px;background:${BLUSH};font-weight:700">${r.name}</td><td style="padding:8px 12px;text-align:right;color:#666">${r.pointsCost.toLocaleString()} ${ctx.program.pointsName}</td></tr><tr><td style="height:6px"></td></tr>`).join("")}</table>` : "";

export function renderTemplate(key: TemplateKey, ctx: Ctx, intro?: string | null) {
  const pn = ctx.program.pointsName, worth = (ctx.customer.balance * ctx.program.pointValueCents) / 100;
  const I = intro ? P(fill(intro, ctx)) : "";
  switch (key) {
    case "welcome": return layout(ctx, I + P(`You're in! Every $1 you spend at ${ctx.program.name} earns <b>${ctx.program.pointsPerDollar} ${pn}</b>, and ${pn} turn into discounts on future orders.`) + P(`A few quick ways to earn more: add your birthday, subscribe to our updates, and keep an eye out for bonus-point products.`) + rewardsList(ctx), { label: "See my rewards", href: ctx.accountUrl });
    case "birthday_reminder": return layout(ctx, I + P(`We'd love to send you a little something on your birthday — add the date to your rewards account and we'll drop bonus ${pn} in on the day.`), { label: "Add my birthday", href: ctx.accountUrl });
    case "subscribe_reminder": return layout(ctx, I + P(`Thanks for shopping with us. You have a rewards account with <b>${ctx.customer.balance.toLocaleString()} ${pn}</b> — but you're not subscribed to our updates, so you'd miss bonus-point weekends and new rewards.`) + P(`Subscribe from your account page and we'll keep you posted (and add bonus ${pn} for joining).`), { label: "Subscribe & see my rewards", href: ctx.accountUrl });
    case "how_to_redeem": return layout(ctx, I + P(`You've got <b>${ctx.customer.balance.toLocaleString()} ${pn}</b> — worth <b>$${worth.toFixed(2)}</b>. Spending them takes about ten seconds:`) + P(`1. Open <b>Rewards</b> in your account.<br>2. Pick a reward and tap <b>Redeem</b>.<br>3. Enter the code at checkout.`) + rewardsList(ctx), { label: "Spend my points", href: ctx.accountUrl });
    case "balance_reminder": return layout(ctx, I + P(`Just a reminder: your <b>${ctx.customer.balance.toLocaleString()} ${pn}</b> are worth <b>$${worth.toFixed(2)}</b> toward your next order.${ctx.customer.nextTier ? ` You're ${ctx.customer.needed?.toLocaleString()} ${pn} from <b>${ctx.customer.nextTier}</b>.` : ""}`) + rewardsList(ctx), { label: "Use my points", href: ctx.accountUrl });
    case "expiring_soon": return layout(ctx, I + P(`Heads up — <b>${ctx.extra.expiring} ${pn}</b> in your account expire on <b>${ctx.extra.expiresOn}</b>. Redeem them before then and they're yours.`) + rewardsList(ctx), { label: "Redeem now", href: ctx.accountUrl });
    case "dormant": return layout(ctx, I + P(`It's been a while! You still have <b>${ctx.customer.balance.toLocaleString()} ${pn}</b> waiting — worth <b>$${worth.toFixed(2)}</b> off your next order.`) + rewardsList(ctx), { label: "Come back & save", href: ctx.storeUrl });
    case "tier_up": return layout(ctx, I + P(`You've reached <b>${ctx.customer.tierName}</b>! ${ctx.extra.perks ? `That means: ${ctx.extra.perks}.` : ""}${ctx.extra.multiplier && ctx.extra.multiplier !== "1" ? ` You now earn <b>${ctx.extra.multiplier}×</b> ${pn} on every order.` : ""}`), { label: "See my rewards", href: ctx.accountUrl });
    case "announcement": return layout(ctx, I || P(`We've got something new for rewards members — take a look.`), { label: "Take a look", href: ctx.storeUrl });
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<string | null> {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("RESEND_API_KEY / EMAIL_FROM not set");
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, subject, html }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `Resend ${r.status}`);
  return j?.id ?? null;
}

/** Builds a render context for one member. */
export async function buildCtx(shop: string, customerId: string, extra: Record<string, string> = {}): Promise<Ctx> {
  const [program, c, rewards, tiers] = await Promise.all([
    getProgram(shop),
    prisma.customer.findUniqueOrThrow({ where: { id: customerId }, include: { tier: true } }),
    prisma.reward.findMany({ where: { shop, active: true }, orderBy: [{ sortOrder: "asc" }, { pointsCost: "asc" }], take: 3 }),
    prisma.tier.findMany({ where: { shop }, orderBy: { rank: "asc" } }),
  ]);
  const next = tiers.find((t) => t.rank > (c.tier?.rank ?? -1));
  const needed = next ? Math.max(0, Number(next.threshold) - (next.basis === "LIFETIME_POINTS" ? c.lifetimePoints : Number(c.lifetimeSpend))) : null;
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const storeUrl = `https://${shop}`;
  return {
    program: { name: program.name, pointsName: program.pointsName, pointValueCents: Number(program.pointValueCents ?? 1), pointsPerDollar: Number(program.pointsPerDollar), minRedeemPoints: program.minRedeemPoints },
    customer: { id: c.id, firstName: c.firstName, email: c.email, balance: c.balance, tierName: c.tier?.name ?? null, nextTier: next?.name ?? null, needed },
    rewards: rewards.map((r) => ({ name: r.name, pointsCost: r.pointsCost })),
    appUrl, storeUrl, accountUrl: `${storeUrl}/account`, extra,
  };
}

/** Who should get a given template right now (excludes spam, requires consent except subscribe_reminder). */
export async function audienceFor(shop: string, key: TemplateKey, limit = 500) {
  const program = await getProgram(shop);
  const now = new Date(), d90 = new Date(now.getTime() - 90 * 86_400_000), d30 = new Date(now.getTime() + 30 * 86_400_000), d2y = new Date(now.getTime() - 730 * 86_400_000);
  const base: any = { shop, spam: { notIn: ["spam", "suspicious"] }, marketingConsent: true };
  const notSent = (within?: Date) => ({ emailLogs: { none: { template: key, ...(within ? { sentAt: { gte: within } } : {}) } } });
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000), weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  let where: any;
  switch (key) {
    case "birthday_reminder": where = { ...base, birthday: null, ...notSent(monthAgo) }; break;
    case "subscribe_reminder": where = { shop, spam: { notIn: ["spam", "suspicious"] }, marketingConsent: false, ledger: { some: { type: "ORDER", createdAt: { gte: d2y } } }, ...notSent() }; break;
    case "how_to_redeem": where = { ...base, balance: { gte: Math.max(1, program.minRedeemPoints) }, redemptions: { none: {} }, ...notSent() }; break;
    case "balance_reminder": where = { ...base, balance: { gte: Math.max(1, program.minRedeemPoints) }, ...notSent(monthAgo) }; break;
    case "expiring_soon": where = { ...base, ledger: { some: { status: "AVAILABLE", points: { gt: 0 }, expiresAt: { gt: now, lte: d30 } } }, ...notSent(weekAgo) }; break;
    case "dormant": where = { ...base, balance: { gt: 0 }, ledger: { none: { type: { not: "MIGRATION" }, createdAt: { gte: d90 } } }, ...notSent(monthAgo) }; break;
    case "announcement": where = { ...base, ...notSent() }; break;
    default: where = { ...base, id: "__none__" }; // event templates aren't scheduled
  }
  const [count, rows] = await Promise.all([prisma.customer.count({ where }), prisma.customer.findMany({ where, take: limit, select: { id: true, email: true } })]);
  return { count, rows };
}

/** Sends a template to one member and logs it. */
export async function sendTemplateTo(shop: string, key: TemplateKey, customerId: string, subject: string, intro: string | null, extra: Record<string, string> = {}) {
  const ctx = await buildCtx(shop, customerId, extra);
  const subj = fill(subject, ctx);
  const html = renderTemplate(key, ctx, intro);
  const id = await sendEmail(ctx.customer.email, subj, html);
  await prisma.emailLog.create({ data: { shop, customerId, template: key, subject: subj, providerId: id } });
  await prisma.emailAutomation.updateMany({ where: { shop, template: key }, data: { sentCount: { increment: 1 } } });
  return id;
}

/** Event hook: fire an event template if its automation is enabled. Never throws. */
export async function fireEvent(shop: string, key: "welcome" | "tier_up", customerId: string, extra: Record<string, string> = {}) {
  try {
    const a = await prisma.emailAutomation.findUnique({ where: { shop_template: { shop, template: key } } });
    if (!a?.enabled) return;
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c || !c.marketingConsent || c.spam === "spam" || c.spam === "suspicious") return;
    const already = await prisma.emailLog.findFirst({ where: { shop, customerId, template: key, ...(key === "tier_up" ? { sentAt: { gte: new Date(Date.now() - 86_400_000) } } : {}) } });
    if (already) return;
    await sendTemplateTo(shop, key, customerId, a.subject, a.intro, extra);
  } catch (e) { console.error("[rewards] email event failed", key, e); }
}

/** Scheduled run (called by the daily cron). */
export async function runScheduled(shop: string) {
  const autos = await prisma.emailAutomation.findMany({ where: { shop, enabled: true, cadence: { in: ["once", "weekly", "monthly"] } } });
  const out: Record<string, number> = {};
  for (const a of autos) {
    const { rows } = await audienceFor(shop, a.template as TemplateKey, 300);
    let n = 0;
    for (const r of rows) {
      try {
        const extra: Record<string, string> = {};
        if (a.template === "expiring_soon") {
          const exp = await prisma.pointsLedger.aggregate({ where: { shop, customerId: r.id, status: "AVAILABLE", points: { gt: 0 }, expiresAt: { gt: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) } }, _sum: { points: true }, _min: { expiresAt: true } });
          extra.expiring = (exp._sum.points ?? 0).toLocaleString(); extra.expiresOn = exp._min.expiresAt ? exp._min.expiresAt.toLocaleDateString("en-CA", { month: "long", day: "numeric" }) : "";
        }
        await sendTemplateTo(shop, a.template as TemplateKey, r.id, a.subject, a.intro, extra); n++;
      } catch (e) { console.error("[rewards] scheduled send failed", a.template, r.email, (e as Error).message); }
    }
    await prisma.emailAutomation.update({ where: { id: a.id }, data: { lastRunAt: new Date() } });
    out[a.template] = n;
  }
  return out;
}
