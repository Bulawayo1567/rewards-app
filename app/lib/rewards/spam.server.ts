import prisma from "../../db.server";

const THROWAWAY = ["yandex.", "mail.ru", "qq.com", "163.com", "126.com", "rambler.ru", "tempmail", "mailinator", "guerrillamail", "10minutemail", "yopmail", "sharklasers", "trashmail", "dispostable"];
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export interface SpamInput { email: string; firstName: string | null; lastName: string | null; createdAt: Date; lifetimeSpend: number; shopifyId: string | null }

/** Scores one member 0–100 with human-readable reasons. ≥60 = suspicious. */
export function scoreOne(c: SpamInput, ctx: { sameNameCount: number; burstCount: number }) {
  let score = 0; const reasons: string[] = [];
  const local = c.email.split("@")[0].toLowerCase();
  const domain = c.email.split("@")[1] ?? "";
  const fn = norm(c.firstName), ln = norm(c.lastName);
  const hasName = fn.length >= 3 || ln.length >= 3;
  const nameInEmail = (fn.length >= 3 && local.includes(fn)) || (ln.length >= 3 && local.includes(ln));

  if (hasName && !nameInEmail && /^[a-z]+[a-z]*\d{2,4}$/.test(local)) { score += 45; reasons.push("email is a different name + digits"); }
  else if (hasName && !nameInEmail && /\d{3,}/.test(local)) { score += 20; reasons.push("email doesn't match the account name"); }
  if (THROWAWAY.some((d) => domain.includes(d))) { score += 25; reasons.push(`throwaway or high-abuse domain (${domain})`); }
  if (ctx.sameNameCount >= 3) { score += 30; reasons.push(`same name used by ${ctx.sameNameCount} accounts`); }
  if (ctx.burstCount >= 5) { score += 20; reasons.push(`${ctx.burstCount} sign-ups within 10 minutes`); }
  if (c.firstName && c.firstName === c.firstName.toLowerCase() && c.lastName && c.lastName === c.lastName.toLowerCase() && hasName) { score += 10; reasons.push("all-lowercase name"); }
  if (/^[a-z]{2,}\.[a-z]{2,}\d{2,}@/.test(c.email) && !nameInEmail) { score += 10; reasons.push("generated-looking address"); }
  if (c.lifetimeSpend > 0) { score -= 60; reasons.push("has placed a paid order"); }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/** Rescans every unconfirmed member for the shop. Returns counts. */
export async function scanShop(shop: string) {
  const members = await prisma.customer.findMany({ where: { shop }, select: { id: true, email: true, firstName: true, lastName: true, createdAt: true, lifetimeSpend: true, shopifyId: true, spam: true } });
  const byName = new Map<string, number>();
  for (const m of members) { const k = `${norm(m.firstName)} ${norm(m.lastName)}`.trim(); if (k.length > 3) byName.set(k, (byName.get(k) ?? 0) + 1); }
  const times = members.map((m) => m.createdAt.getTime()).sort((a, b) => a - b);
  const burst = (t: number) => { let lo = 0, hi = 0; for (const x of times) { if (x < t - 300_000) lo++; else if (x <= t + 300_000) hi++; } return hi; };
  let suspicious = 0, cleared = 0;
  for (const m of members) {
    if (m.spam === "spam" || m.spam === "trusted") continue;
    const k = `${norm(m.firstName)} ${norm(m.lastName)}`.trim();
    const { score, reasons } = scoreOne({ ...m, lifetimeSpend: Number(m.lifetimeSpend) }, { sameNameCount: byName.get(k) ?? 0, burstCount: burst(m.createdAt.getTime()) });
    const status = score >= 60 ? "suspicious" : "ok";
    if (status !== m.spam || true) await prisma.customer.update({ where: { id: m.id }, data: { spam: status, spamScore: score, spamReasons: reasons.join("; ") || null } });
    if (status === "suspicious") suspicious++; else cleared++;
  }
  return { scanned: members.length, suspicious, cleared };
}

/** Score a single new member at signup (cheap context: same-name + burst in last 10 minutes). */
export async function scoreNew(shop: string, id: string) {
  const m = await prisma.customer.findUnique({ where: { id } });
  if (!m) return null;
  const since = new Date(Date.now() - 600_000);
  const [sameName, burst] = await Promise.all([
    m.firstName || m.lastName ? prisma.customer.count({ where: { shop, firstName: { equals: m.firstName, mode: "insensitive" }, lastName: { equals: m.lastName, mode: "insensitive" } } }) : 0,
    prisma.customer.count({ where: { shop, createdAt: { gte: since } } }),
  ]);
  const { score, reasons } = scoreOne({ ...m, lifetimeSpend: Number(m.lifetimeSpend) }, { sameNameCount: sameName, burstCount: burst });
  const status = score >= 60 ? "suspicious" : "ok";
  await prisma.customer.update({ where: { id }, data: { spam: status, spamScore: score, spamReasons: reasons.join("; ") || null } });
  return status;
}
