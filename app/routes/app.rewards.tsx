import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num, fmtInt } from "../lib/rewards/format";

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

export default function Rewards() {
  const { rewards, tiers } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const shopify = useAppBridge();
  const [editing, setEditing] = useState<(typeof rewards)[number] | null>(null);
  const [type, setType] = useState("FIXED_AMOUNT");
  const [variant, setVariant] = useState<{ id: string; label: string } | null>(null);
  const e = editing;
  useActionToast();
  useEffect(() => { if (result && "ok" in result && result.ok && editing) cancel(); }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (r: (typeof rewards)[number]) => {
    setEditing(r); setType(r.type);
    setVariant(r.variantId ? { id: r.variantId, label: r.variantId.split("/").pop()! } : null);
  };
  const cancel = () => { setEditing(null); setType("FIXED_AMOUNT"); setVariant(null); };

  const pickVariant = async () => {
    const sel = await shopify.resourcePicker({ type: "variant", multiple: false, action: "select" });
    const v = sel?.[0] as any;
    if (v) setVariant({ id: v.id, label: v.displayName ?? v.title ?? v.id });
  };

  return (
    <s-page heading="Rewards" inlineSize="large">
      {result && "error" in result && result.error && <s-banner tone="critical" heading="Not saved">{result.error}</s-banner>}

      <s-section heading="Catalog" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Reward</s-table-header>
            <s-table-header>Type</s-table-header>
            <s-table-header format="numeric">Points</s-table-header>
            <s-table-header format="numeric">Value</s-table-header>
            <s-table-header format="numeric">Min order</s-table-header>
            <s-table-header>Min tier</s-table-header>
            <s-table-header format="numeric">Redeemed</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rewards.map((r) => (
              <s-table-row key={r.id}>
                <s-table-cell>{r.name}</s-table-cell>
                <s-table-cell>{TYPE_LABEL[r.type]}</s-table-cell>
                <s-table-cell>{fmtInt(r.pointsCost)}</s-table-cell>
                <s-table-cell>{r.type === "FIXED_AMOUNT" ? `$${r.value}` : r.type === "PERCENTAGE" ? `${r.value}%` : "—"}</s-table-cell>
                <s-table-cell>{r.minOrderSubtotal ? `$${r.minOrderSubtotal}` : "—"}</s-table-cell>
                <s-table-cell>{r.minTierRank == null ? "any" : tiers.find((t) => t.rank === r.minTierRank)?.name ?? `rank ${r.minTierRank}`}</s-table-cell>
                <s-table-cell>{r.redemptions}</s-table-cell>
                <s-table-cell>
                  <Form method="post"><input type="hidden" name="intent" value="toggle" /><input type="hidden" name="id" value={r.id} />
                    <s-button type="submit" variant="tertiary">{r.active ? "Active" : "Hidden"}</s-button></Form>
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="inline" gap="small">
                    <s-button type="button" variant="tertiary" onClick={() => startEdit(r)}>Edit</s-button>
                    <Form method="post" onSubmit={(ev) => { if (!confirm(`Delete "${r.name}"?${r.redemptions ? " It has redemptions, so it will be hidden instead of deleted." : ""}`)) ev.preventDefault(); }}>
                      <input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={r.id} />
                      <s-button type="submit" tone="critical" variant="tertiary">Delete</s-button>
                    </Form>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
            {rewards.length === 0 && <s-table-row><s-table-cell>No rewards yet — add one below.</s-table-cell></s-table-row>}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading={e ? `Edit reward: ${e.name}` : "Add a reward"}>
        <Form method="post" key={e?.id ?? "new"}>
          <input type="hidden" name="id" value={e?.id ?? ""} />
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
            <s-text-field name="name" label="Name" placeholder="$10 off your order" defaultValue={e?.name ?? ""} required />
            <s-select name="type" label="Type" value={type} onChange={(ev: any) => setType(ev.currentTarget.value)}>
              <s-option value="FIXED_AMOUNT">$ off</s-option>
              <s-option value="PERCENTAGE">% off</s-option>
              <s-option value="FREE_SHIPPING">Free shipping</s-option>
              <s-option value="FREE_PRODUCT">Free product</s-option>
            </s-select>
            <s-number-field name="pointsCost" label="Points cost" defaultValue={String(e?.pointsCost ?? 1000)} min={1} />
            {(type === "FIXED_AMOUNT" || type === "PERCENTAGE") && (
              <s-number-field name="value" label={type === "FIXED_AMOUNT" ? "Amount ($)" : "Percent"} defaultValue={String(e?.value ?? 10)} min={0} />
            )}
            <s-number-field name="minOrderSubtotal" label="Minimum order ($, optional)" defaultValue={String(e?.minOrderSubtotal ?? 0)} min={0} />
            <s-number-field name="codeValidDays" label="Code valid for (days)" defaultValue={String(e?.codeValidDays ?? 90)} min={1} />
            <s-select name="minTierRank" label="Minimum tier" defaultValue={e?.minTierRank == null ? "" : String(e.minTierRank)}>
              <s-option value="">Any</s-option>
              {tiers.map((t) => <s-option key={t.id} value={String(t.rank)}>{t.name}</s-option>)}
            </s-select>
            <s-number-field name="sortOrder" label="Sort order" defaultValue={String(e?.sortOrder ?? 0)} />
          </s-grid>
          {type === "FREE_PRODUCT" && (
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-button type="button" onClick={pickVariant}>Choose product variant…</s-button>
              <s-text>{variant?.label ?? "Nothing selected"}</s-text>
              <input type="hidden" name="variantId" value={variant?.id ?? ""} />
            </s-stack>
          )}
          <s-stack direction="inline" gap="base">
            <s-button type="submit" variant="primary">{e ? "Save changes" : "Add reward"}</s-button>
            {e && <s-button type="button" onClick={cancel}>Cancel</s-button>}
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
