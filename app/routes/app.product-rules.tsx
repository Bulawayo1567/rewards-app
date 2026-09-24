import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num } from "../lib/rewards/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const rules = await prisma.productRule.findMany({ where: { shop: session.shop }, orderBy: [{ mode: "asc" }, { priority: "desc" }, { createdAt: "desc" }] });
  return { rules: rules.map((r) => ({ id: r.id, target: r.target, targetId: r.targetId, targetLabel: r.targetLabel, mode: r.mode, value: r.value == null ? null : Number(r.value), priority: r.priority, active: r.active, startsAt: r.startsAt?.toISOString().slice(0, 10) ?? "", endsAt: r.endsAt?.toISOString().slice(0, 10) ?? "" })) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = str(fd, "intent");

  if (intent === "delete") { await prisma.productRule.deleteMany({ where: { shop, id: str(fd, "id") } }); return { ok: true, message: "Rule deleted" }; }
  if (intent === "toggle") {
    const r = await prisma.productRule.findFirst({ where: { shop, id: str(fd, "id") } });
    if (r) await prisma.productRule.update({ where: { id: r.id }, data: { active: !r.active } });
    return { ok: true, message: r?.active ? "Rule paused" : "Rule active" };
  }

  const target = str(fd, "target") as any;
  const mode = str(fd, "mode") as any;
  const targetId = str(fd, "targetId");
  const targetLabel = str(fd, "targetLabel") || targetId;
  if (!targetId) return { error: "Pick or type a target." };
  const data = {
    target, targetId, targetLabel, mode,
    value: mode === "EXCLUDE" ? null : num(fd, "value", mode === "MULTIPLIER" ? 2 : 0),
    priority: Math.floor(num(fd, "priority")),
    startsAt: str(fd, "startsAt") ? new Date(str(fd, "startsAt")) : null,
    endsAt: str(fd, "endsAt") ? new Date(str(fd, "endsAt") + "T23:59:59") : null,
  };
  const id = str(fd, "id");
  if (id) await prisma.productRule.updateMany({ where: { shop, id }, data });
  else await prisma.productRule.create({ data: { shop, ...data } });
  return { ok: true, message: id ? "Rule updated" : "Rule added" };
};

const MODE_LABEL: Record<string, string> = { EXCLUDE: "Excluded", MULTIPLIER: "Multiplier", FIXED_BONUS: "Bonus points" };

export default function ProductRules() {
  const { rules } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const shopify = useAppBridge();
  const [editing, setEditing] = useState<(typeof rules)[number] | null>(null);
  const [target, setTarget] = useState("VENDOR");
  const [mode, setMode] = useState("EXCLUDE");
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(null);
  const e = editing;
  useActionToast();
  useEffect(() => { if (result && "ok" in result && result.ok && editing) cancel(); }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (r: (typeof rules)[number]) => {
    setEditing(r); setTarget(r.target); setMode(r.mode);
    setPicked(["PRODUCT", "VARIANT", "COLLECTION"].includes(r.target) ? { id: r.targetId, label: r.targetLabel } : null);
  };
  const cancel = () => { setEditing(null); setTarget("VENDOR"); setMode("EXCLUDE"); setPicked(null); };

  const pick = async () => {
    const type = target === "COLLECTION" ? "collection" : target === "VARIANT" ? "variant" : "product";
    const sel = await shopify.resourcePicker({ type, multiple: false, action: "select" });
    const item = sel?.[0] as any;
    if (item) setPicked({ id: item.id, label: item.title ?? item.displayName ?? item.id });
  };
  const needsPicker = ["PRODUCT", "VARIANT", "COLLECTION"].includes(target);

  return (
    <s-page heading="Product rules" inlineSize="large">
      {result && "error" in result && result.error && <s-banner tone="critical" heading="Not saved">{result.error}</s-banner>}

      <s-section heading="Rules" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header>Mode</s-table-header>
            <s-table-header>Applies to</s-table-header>
            <s-table-header listSlot="primary">Target</s-table-header>
            <s-table-header format="numeric">Value</s-table-header>
            <s-table-header format="numeric">Priority</s-table-header>
            <s-table-header>Window</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rules.map((r) => (
              <s-table-row key={r.id}>
                <s-table-cell><s-badge tone={r.mode === "EXCLUDE" ? "critical" : "success"}>{MODE_LABEL[r.mode]}</s-badge></s-table-cell>
                <s-table-cell>{r.target.replace("_", " ").toLowerCase()}</s-table-cell>
                <s-table-cell>{r.targetLabel}</s-table-cell>
                <s-table-cell>{r.mode === "EXCLUDE" ? "—" : r.mode === "MULTIPLIER" ? `${r.value}×` : `+${r.value}/unit`}</s-table-cell>
                <s-table-cell>{r.priority}</s-table-cell>
                <s-table-cell>{r.startsAt || r.endsAt ? `${r.startsAt || "…"} → ${r.endsAt || "…"}` : "always"}</s-table-cell>
                <s-table-cell>
                  <Form method="post"><input type="hidden" name="intent" value="toggle" /><input type="hidden" name="id" value={r.id} />
                    <s-button type="submit" variant="tertiary">{r.active ? "Active" : "Paused"}</s-button></Form>
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="inline" gap="small">
                    <s-button type="button" variant="tertiary" onClick={() => startEdit(r)}>Edit</s-button>
                    <Form method="post" onSubmit={(ev) => { if (!confirm(`Delete rule for "${r.targetLabel}"?`)) ev.preventDefault(); }}>
                      <input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={r.id} />
                      <s-button type="submit" tone="critical" variant="tertiary">Delete</s-button>
                    </Form>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
            {rules.length === 0 && <s-table-row><s-table-cell>No rules — every product earns the base rate.</s-table-cell></s-table-row>}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading={e ? `Edit rule: ${e.targetLabel}` : "Add a rule"}>
        <s-paragraph>
          <b>Excluded</b> always wins. If several <b>Multiplier</b> rules match, the highest priority applies (ties: the bigger multiplier).
          <b>Bonus points</b> rules stack on top.
        </s-paragraph>
        <Form method="post" key={e?.id ?? "new"}>
          <input type="hidden" name="id" value={e?.id ?? ""} />
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
            <s-select name="target" label="Applies to" value={target} onChange={(ev: any) => { setTarget(ev.currentTarget.value); setPicked(null); }}>
              <s-option value="VENDOR">Vendor / brand</s-option>
              <s-option value="TAG">Product tag</s-option>
              <s-option value="PRODUCT_TYPE">Product type</s-option>
              <s-option value="COLLECTION">Collection</s-option>
              <s-option value="PRODUCT">Single product</s-option>
              <s-option value="VARIANT">Single variant</s-option>
            </s-select>
            <s-select name="mode" label="Rule" value={mode} onChange={(ev: any) => setMode(ev.currentTarget.value)}>
              <s-option value="EXCLUDE">Excluded — earns nothing</s-option>
              <s-option value="MULTIPLIER">Multiplier (e.g. 2 = double)</s-option>
              <s-option value="FIXED_BONUS">Bonus points per unit</s-option>
            </s-select>
            {mode !== "EXCLUDE" && <s-number-field name="value" label={mode === "MULTIPLIER" ? "Multiplier" : "Bonus points"} defaultValue={String(e?.value ?? (mode === "MULTIPLIER" ? 2 : 50))} step={mode === "MULTIPLIER" ? 0.25 : 1} min={0} />}
            <s-number-field name="priority" label="Priority" defaultValue={String(e?.priority ?? 0)} details="Higher wins" />
            <s-date-field name="startsAt" label="Starts (optional)" defaultValue={e?.startsAt ?? ""} />
            <s-date-field name="endsAt" label="Ends (optional)" defaultValue={e?.endsAt ?? ""} />
          </s-grid>

          {needsPicker ? (
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-button type="button" onClick={pick}>Choose {target.toLowerCase()}…</s-button>
              <s-text>{picked ? picked.label : "Nothing selected"}</s-text>
              <input type="hidden" name="targetId" value={picked?.id ?? ""} />
              <input type="hidden" name="targetLabel" value={picked?.label ?? ""} />
            </s-stack>
          ) : (
            <s-text-field
              name="targetId"
              label={target === "VENDOR" ? "Vendor name (exactly as on the product)" : target === "TAG" ? "Tag" : "Product type"}
              placeholder={target === "VENDOR" ? "BERNINA" : target === "TAG" ? "clearance" : "Sewing Machine"}
              defaultValue={e && !["PRODUCT", "VARIANT", "COLLECTION"].includes(e.target) ? e.targetId : ""}
              required
            />
          )}
          <s-stack direction="inline" gap="base">
            <s-button type="submit" variant="primary">{e ? "Save changes" : "Add rule"}</s-button>
            {e && <s-button type="button" onClick={cancel}>Cancel</s-button>}
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
