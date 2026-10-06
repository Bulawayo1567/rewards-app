import { createHash } from "node:crypto";
import prisma from "../../db.server";

/**
 * Pushes balance + tier to Mailchimp merge fields REWARDPTS / REWARDTIER for existing audience members.
 * Never creates members, never changes subscription status. Fire-and-forget; errors are logged only.
 */
export async function syncMailchimp(shop: string, customerId: string) {
  try {
    const p = await prisma.program.findUnique({ where: { shop } });
    if (!p?.mailchimpEnabled || !p.mailchimpApiKey || !p.mailchimpAudienceId) return;
    const c = await prisma.customer.findUnique({ where: { id: customerId }, include: { tier: true } });
    if (!c) return;
    const dc = p.mailchimpApiKey.split("-").pop();
    const hash = createHash("md5").update(c.email.toLowerCase()).digest("hex");
    const url = `https://${dc}.api.mailchimp.com/3.0/lists/${p.mailchimpAudienceId}/members/${hash}`;
    const auth = { Authorization: `Basic ${Buffer.from(`anystring:${p.mailchimpApiKey}`).toString("base64")}`, "Content-Type": "application/json" };
    const exists = await fetch(url, { headers: auth });
    if (exists.status === 404) return; // not in the audience — leave it to Mailchimp/Shopify sync
    const r = await fetch(url, { method: "PATCH", headers: auth, body: JSON.stringify({ merge_fields: { REWARDPTS: c.balance, REWARDTIER: c.tier?.name ?? "" } }) });
    if (!r.ok) console.error("[rewards] mailchimp sync", r.status, await r.text());
  } catch (e) { console.error("[rewards] mailchimp sync failed", (e as Error).message); }
}

/** Ensures the two merge fields exist on the audience (idempotent). Returns a status string for the UI. */
export async function ensureMergeFields(apiKey: string, audienceId: string) {
  const dc = apiKey.split("-").pop();
  const auth = { Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`, "Content-Type": "application/json" };
  const base = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/merge-fields`;
  const r = await fetch(`${base}?count=100`, { headers: auth });
  if (!r.ok) throw new Error(`Mailchimp: ${r.status} ${(await r.text()).slice(0, 120)}`);
  const have = new Set(((await r.json()).merge_fields ?? []).map((f: any) => f.tag));
  for (const f of [{ tag: "REWARDPTS", name: "Reward points", type: "number" }, { tag: "REWARDTIER", name: "Reward tier", type: "text" }]) {
    if (have.has(f.tag)) continue;
    const c = await fetch(base, { method: "POST", headers: auth, body: JSON.stringify(f) });
    if (!c.ok) throw new Error(`Couldn't create ${f.tag}: ${(await c.text()).slice(0, 120)}`);
  }
  return "Connected — merge fields REWARDPTS and REWARDTIER are ready.";
}
