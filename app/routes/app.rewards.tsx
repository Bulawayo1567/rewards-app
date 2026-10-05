import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num, fmtInt } from "../lib/rewards/format";
import { Hero, UIStyles, Tabs, EARN_TABS, Card, Field, Empty, Pill } from "../lib/rewards/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [rewards, tiers] = await Promise.all([
    prisma.reward.findMany({ where: { shop: session.shop }, orderBy: [{ sortOrder: "asc" }, { pointsCost: "asc" }], include: { _count: { select: { redemptions: true } } } }),
    prisma.tier.findMany({ where: { shop: session.shop }, orderBy: { rank: "asc" } }),
  ]);
  return {
    rewards: rewards.map((r) => ({ id: r.id, name: r.name, type: r.type, pointsCost: r.pointsCost, value: r.value == null ? null : Number(r.value), variantId: r.variantId, minOrderSubtotal: r.minOrderSubtotal == null ? null : Number(r.minOrderSubtotal), codeValidDays: r.codeValidDays, minTierRank: r.minTierRank, active: r.active, sortOrder: r.sortOrder, redemptions: r._count.redemptions })),
    tiers: tiers.map((t) => ({ id: t.id, name: t.name, rank: t.rank })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = str(fd, "intent");

  if (intent === "toggle") {
    const r = await prisma.reward.findFirst({ where: { shop, id: str(fd, "id") } });
    if (r) await prisma.reward.update({ where: { id: r.id }, data: { active: !r.active } });
    return { ok: true, message: r?.active ? "Reward hidden from customers" : "Reward is now active" };
  }
  if (intent === "delete") {
    const r = await prisma.reward.findFirst({ where: { shop, id: str(fd, "id") }, include: { _count: { select: { redemptions: true } } } });
    if (!r) return { ok: true };
    if (r._count.redemptions > 0) await prisma.reward.update({ where: { id: r.id }, data: { active: false } });
    else await prisma.reward.delete({ where: { id: r.id } });
    return { ok: true, message: r._count.redemptions > 0 ? "Reward hidden (it has redemption history)" : "Reward deleted" };
  }

  const type = str(fd, "type") as any;
  const name = str(fd, "name");
  if (!name) return { error: "Name required" };
  const data = {
    name, type,
    pointsCost: Math.max(1, Math.floor(num(fd, "pointsCost", 1))),
    value: type === "FREE_SHIPPING" || type === "FREE_PRODUCT" ? null : num(fd, "value"),
    variantId: type === "FREE_PRODUCT" ? str(fd, "variantId") || null : null,
    minOrderSubtotal: num(fd, "minOrderSubtotal") > 0 ? num(fd, "minOrderSubtotal") : null,
    codeValidDays: Math.max(1, Math.floor(num(fd, "codeValidDays", 90))),
    minTierRank: str(fd, "minTierRank") === "" ? null : Math.floor(num(fd, "minTierRank")),
    sortOrder: Math.floor(num(fd, "sortOrder")),
  };
  if (type === "FREE_PRODUCT" && !data.variantId) return { error: "Choose the product variant for a free-product reward." };

  const id = str(fd, "id");
  if (id) await prisma.reward.updateMany({ where: { shop, id }, data });
  else await prisma.reward.create({ data: { shop, ...data } });
  return { ok: true, message: id ? "Reward updated" : "Reward added" };
};

const TYPE_LABEL: Record<string, string> = { FIXED_AMOUNT: "$ off", PERCENTAGE: "% off", FREE_SHIPPING: "Free shipping", FREE_PRODUCT: "Free product" };

const TYPE_ICON: Record<string, string> = { FIXED_AMOUNT: "🏷️", PERCENTAGE: "％", FREE_SHIPPING: "📦", FREE_PRODUCT: "🎁" };

export default function Rewards() {
  const { rewards, tiers } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const shopify = useAppBridge();
  useActionToast();
  const [editing, setEditing] = useState<(typeof rewards)[number] | null>(null);
  const [type, setType] = useState("FIXED_AMOUNT");
  const [variant, setVariant] = useState<{ id: string; label: string } | null>(null);
  const e = editing;
  const startEdit = (r: (typeof rewards)[number]) => { setEditing(r); setType(r.type); setVariant(r.variantId ? { id: r.variantId, label: r.variantId.split("/").pop()! } : null); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancel = () => { setEditing(null); setType("FIXED_AMOUNT"); setVariant(null); };
  useEffect(() => { if (result && "ok" in result && result.ok && editing) cancel(); }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickVariant = async () => {
    const sel = await shopify.resourcePicker({ type: "variant", multiple: false, action: "select" });
    const v = sel?.[0] as any;
    if (v) setVariant({ id: v.id, label: v.displayName ?? v.title ?? v.id });
  };
  const valueOf = (r: (typeof rewards)[number]) => r.type === "FIXED_AMOUNT" ? `$${r.value} off` : r.type === "PERCENTAGE" ? `${r.value}% off` : r.type === "FREE_SHIPPING" ? "Free shipping" : "Free product";

  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title="Earn & Redeem" sub="What members can redeem their points for" />
      <Tabs items={EARN_TABS} active="rewards" />
      {result && "error" in result && result.error && <s-banner tone="critical" heading="Not saved">{result.error}</s-banner>}

      <Card icon={e ? "✏️" : "🎁"} title={e ? `Edit reward: ${e.name}` : "Add a reward"} sub="Customers pick these from the launcher and their account page. Each redemption mints a single-use code locked to that customer.">
        <Form method="post" key={e?.id ?? "new"} className="st-form">
          <input type="hidden" name="id" value={e?.id ?? ""} />
          <div className="st-grid">
            <Field label="Name"><input className="txt" name="name" placeholder="$10 off your order" defaultValue={e?.name ?? ""} required /></Field>
            <Field label="Type"><select name="type" value={type} onChange={(ev) => setType(ev.target.value)}>
              <option value="FIXED_AMOUNT">$ off</option><option value="PERCENTAGE">% off</option><option value="FREE_SHIPPING">Free shipping</option><option value="FREE_PRODUCT">Free product</option></select></Field>
            <Field label="Points cost" unit="pts"><input name="pointsCost" type="number" min="1" defaultValue={e?.pointsCost ?? 1000} /></Field>
          </div>
          <div className="st-grid">
            {(type === "FIXED_AMOUNT" || type === "PERCENTAGE") && <Field label={type === "FIXED_AMOUNT" ? "Amount" : "Percent"} unit={type === "FIXED_AMOUNT" ? "$" : "%"}><input name="value" type="number" min="0" step="0.5" defaultValue={e?.value ?? 10} /></Field>}
            <Field label="Minimum order" unit="$" hint="0 = none"><input name="minOrderSubtotal" type="number" min="0" defaultValue={e?.minOrderSubtotal ?? 0} /></Field>
            <Field label="Code valid for" unit="days"><input name="codeValidDays" type="number" min="1" defaultValue={e?.codeValidDays ?? 90} /></Field>
            <Field label="Minimum tier"><select name="minTierRank" defaultValue={e?.minTierRank == null ? "" : String(e.minTierRank)}><option value="">Any</option>{tiers.map((t) => <option key={t.id} value={String(t.rank)}>{t.name}</option>)}</select></Field>
            <Field label="Sort order"><input name="sortOrder" type="number" defaultValue={e?.sortOrder ?? 0} /></Field>
          </div>
          {type === "FREE_PRODUCT" && (
            <div className="st-foot" style={{ marginBottom: 14 }}>
              <button className="st-btn secondary" type="button" onClick={pickVariant}>Choose product variant…</button>
              <span className="aas-muted">{variant?.label ?? "Nothing selected"}</span>
              <input type="hidden" name="variantId" value={variant?.id ?? ""} />
            </div>
          )}
          <div className="st-foot">
            <button className="st-btn primary" type="submit">{e ? "Save changes" : "Add reward"}</button>
            {e && <button className="st-btn ghost" type="button" onClick={cancel}>Cancel</button>}
          </div>
        </Form>
      </Card>

      <Card icon="🧺" title="Catalog" sub={`${rewards.filter((r) => r.active).length} active · ${rewards.length} total`}>
        {rewards.length === 0 ? <Empty>No rewards yet — add your first one above.</Empty> : (
          <div className="st-list">
            {rewards.map((r) => (
              <div key={r.id} className={`st-item${r.active ? "" : " off"}`}>
                <div className="ic">{TYPE_ICON[r.type]}</div>
                <div>
                  <div className="ttl">{r.name} {!r.active && <Pill tone="warn">hidden</Pill>}</div>
                  <div className="meta"><b>{r.pointsCost.toLocaleString()} pts</b><span>·</span><span>{valueOf(r)}</span>{r.minOrderSubtotal ? <><span>·</span><span>min order ${r.minOrderSubtotal}</span></> : null}<span>·</span><span>{r.minTierRank == null ? "any tier" : tiers.find((t) => t.rank === r.minTierRank)?.name ?? `rank ${r.minTierRank}`}</span><span>·</span><span>{r.redemptions} redeemed</span></div>
                </div>
                <div className="acts">
                  <Form method="post"><input type="hidden" name="intent" value="toggle" /><input type="hidden" name="id" value={r.id} /><button className="st-btn secondary sm" type="submit">{r.active ? "Hide" : "Show"}</button></Form>
                  <button className="st-btn secondary sm" type="button" onClick={() => startEdit(r)}>Edit</button>
                  <Form method="post" onSubmit={(ev) => { if (!confirm(`Delete "${r.name}"?${r.redemptions ? " It has redemption history, so it will be hidden instead." : ""}`)) ev.preventDefault(); }}>
                    <input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={r.id} /><button className="st-btn danger sm" type="submit">Delete</button></Form>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
