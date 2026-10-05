import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num } from "../lib/rewards/format";
import { Hero, UIStyles, Tabs, EARN_TABS, Card, Field, Empty, Pill } from "../lib/rewards/ui";

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

const TARGET_LABEL: Record<string, string> = { VENDOR: "Brand", TAG: "Tag", PRODUCT_TYPE: "Product type", COLLECTION: "Collection", PRODUCT: "Product", VARIANT: "Variant" };

export default function ProductRules() {
  const { rules } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const shopify = useAppBridge();
  useActionToast();
  const [editing, setEditing] = useState<(typeof rules)[number] | null>(null);
  const [target, setTarget] = useState("VENDOR");
  const [mode, setMode] = useState("EXCLUDE");
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(null);
  const e = editing;
  const startEdit = (r: (typeof rules)[number]) => { setEditing(r); setTarget(r.target); setMode(r.mode); setPicked(["PRODUCT", "VARIANT", "COLLECTION"].includes(r.target) ? { id: r.targetId, label: r.targetLabel } : null); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancel = () => { setEditing(null); setTarget("VENDOR"); setMode("EXCLUDE"); setPicked(null); };
  useEffect(() => { if (result && "ok" in result && result.ok && editing) cancel(); }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = async () => {
    const type = target === "COLLECTION" ? "collection" : target === "VARIANT" ? "variant" : "product";
    const sel = await shopify.resourcePicker({ type, multiple: false, action: "select" });
    const item = sel?.[0] as any;
    if (item) setPicked({ id: item.id, label: item.title ?? item.displayName ?? item.id });
  };
  const needsPicker = ["PRODUCT", "VARIANT", "COLLECTION"].includes(target);

  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title="Earn & Redeem" sub="Exclude products from earning, or boost them with multipliers and bonuses" />
      <Tabs items={EARN_TABS} active="rules" />
      {result && "error" in result && result.error && <s-banner tone="critical" heading="Not saved">{result.error}</s-banner>}

      <Card icon={e ? "✏️" : "📏"} title={e ? `Edit rule: ${e.targetLabel}` : "Add a rule"} sub="Excluded always wins. Among multipliers the highest priority applies; bonus points stack on top.">
        <Form method="post" key={e?.id ?? "new"} className="st-form">
          <input type="hidden" name="id" value={e?.id ?? ""} />
          <div className="st-grid">
            <Field label="Applies to"><select name="target" value={target} onChange={(ev) => { setTarget(ev.target.value); setPicked(null); }}>
              <option value="VENDOR">Brand / vendor</option><option value="TAG">Product tag</option><option value="PRODUCT_TYPE">Product type</option><option value="COLLECTION">Collection</option><option value="PRODUCT">Single product</option><option value="VARIANT">Single variant</option></select></Field>
            <Field label="Rule"><select name="mode" value={mode} onChange={(ev) => setMode(ev.target.value)}>
              <option value="EXCLUDE">Excluded — earns nothing</option><option value="MULTIPLIER">Multiplier</option><option value="FIXED_BONUS">Bonus points per unit</option></select></Field>
            {mode !== "EXCLUDE" ? <Field label={mode === "MULTIPLIER" ? "Multiplier" : "Bonus"} unit={mode === "MULTIPLIER" ? "×" : "pts / unit"}><input name="value" type="number" min="0" step={mode === "MULTIPLIER" ? "0.25" : "1"} defaultValue={e?.value ?? (mode === "MULTIPLIER" ? 2 : 50)} /></Field> : <Field label="Priority" hint="Higher wins"><input name="priority" type="number" defaultValue={e?.priority ?? 0} /></Field>}
          </div>
          <div className="st-grid">
            {mode !== "EXCLUDE" && <Field label="Priority" hint="Higher wins"><input name="priority" type="number" defaultValue={e?.priority ?? 0} /></Field>}
            <Field label="Starts" hint="optional"><input name="startsAt" type="date" defaultValue={e?.startsAt ?? ""} /></Field>
            <Field label="Ends" hint="optional"><input name="endsAt" type="date" defaultValue={e?.endsAt ?? ""} /></Field>
          </div>
          {needsPicker ? (
            <div className="st-foot" style={{ marginBottom: 14 }}>
              <button className="st-btn secondary" type="button" onClick={pick}>Choose {target.toLowerCase()}…</button>
              <span className="aas-muted">{picked ? picked.label : "Nothing selected"}</span>
              <input type="hidden" name="targetId" value={picked?.id ?? ""} /><input type="hidden" name="targetLabel" value={picked?.label ?? ""} />
            </div>
          ) : (
            <div className="st-grid two" style={{ marginBottom: 14 }}>
              <Field label={target === "VENDOR" ? "Vendor name (exactly as on the product)" : target === "TAG" ? "Tag" : "Product type"}>
                <input className="txt" name="targetId" placeholder={target === "VENDOR" ? "BERNINA" : target === "TAG" ? "clearance" : "Sewing Machine"} defaultValue={e && !["PRODUCT", "VARIANT", "COLLECTION"].includes(e.target) ? e.targetId : ""} required />
              </Field>
            </div>
          )}
          <div className="st-foot">
            <button className="st-btn primary" type="submit">{e ? "Save changes" : "Add rule"}</button>
            {e && <button className="st-btn ghost" type="button" onClick={cancel}>Cancel</button>}
          </div>
        </Form>
      </Card>

      <Card icon="🧵" title="Rules" sub={`${rules.filter((r) => r.active).length} active · ${rules.length} total`}>
        {rules.length === 0 ? <Empty>No rules — every product earns the base rate.</Empty> : (
          <div className="st-list">
            {rules.map((r) => (
              <div key={r.id} className={`st-item${r.active ? "" : " off"}`}>
                <div className="ic">{r.mode === "EXCLUDE" ? "🚫" : r.mode === "MULTIPLIER" ? "✖️" : "➕"}</div>
                <div>
                  <div className="ttl">{r.targetLabel} <Pill tone={r.mode === "EXCLUDE" ? "neg" : "ok"}>{r.mode === "EXCLUDE" ? "Excluded" : r.mode === "MULTIPLIER" ? `${r.value}× points` : `+${r.value} / unit`}</Pill> {!r.active && <Pill tone="warn">paused</Pill>}</div>
                  <div className="meta"><span>{TARGET_LABEL[r.target]}</span><span>·</span><span>priority {r.priority}</span><span>·</span><span>{r.startsAt || r.endsAt ? `${r.startsAt || "…"} → ${r.endsAt || "…"}` : "always"}</span></div>
                </div>
                <div className="acts">
                  <Form method="post"><input type="hidden" name="intent" value="toggle" /><input type="hidden" name="id" value={r.id} /><button className="st-btn secondary sm" type="submit">{r.active ? "Pause" : "Resume"}</button></Form>
                  <button className="st-btn secondary sm" type="button" onClick={() => startEdit(r)}>Edit</button>
                  <Form method="post" onSubmit={(ev) => { if (!confirm(`Delete rule for "${r.targetLabel}"?`)) ev.preventDefault(); }}><input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={r.id} /><button className="st-btn danger sm" type="submit">Delete</button></Form>
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
