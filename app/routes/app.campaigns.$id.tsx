import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num, bool, fmtInt, fmtDate } from "../lib/rewards/format";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const c = await prisma.campaign.findFirst({ where: { shop, id: params.id }, include: { prizes: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { plays: true } } } } } });
  if (!c) throw new Response("Not found", { status: 404 });
  const [plays, recent] = await Promise.all([
    prisma.campaignPlay.count({ where: { campaignId: c.id } }),
    prisma.campaignPlay.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "desc" }, take: 25, include: { prize: true } }),
  ]);
  const totalWeight = c.prizes.reduce((s, p) => s + p.weight, 0) || 1;
  return {
    campaign: { id: c.id, name: c.name, kind: c.kind, headline: c.headline, subheadline: c.subheadline ?? "", buttonLabel: c.buttonLabel, active: c.active, startsAt: c.startsAt?.toISOString().slice(0, 10) ?? "", endsAt: c.endsAt?.toISOString().slice(0, 10) ?? "", showDelaySeconds: c.showDelaySeconds, showOnPages: c.showOnPages, onePlayPerEmail: c.onePlayPerEmail, requireEmail: c.requireEmail, primaryColor: c.primaryColor },
    prizes: c.prizes.map((p) => ({ id: p.id, label: p.label, type: p.type, value: p.value == null ? null : Number(p.value), weight: p.weight, odds: Math.round((p.weight / totalWeight) * 1000) / 10, codeValidDays: p.codeValidDays, minOrderSubtotal: p.minOrderSubtotal == null ? null : Number(p.minOrderSubtotal), color: p.color ?? "", sortOrder: p.sortOrder, plays: p._count.plays })),
    stats: { plays, emails: recent.length },
    recent: recent.map((r) => ({ id: r.id, email: r.email, prize: r.prize.label, code: r.discountCode, createdAt: r.createdAt.toISOString() })),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = str(fd, "intent");
  const c = await prisma.campaign.findFirst({ where: { shop, id: params.id } });
  if (!c) throw new Response("Not found", { status: 404 });

  if (intent === "campaign") {
    await prisma.campaign.update({
      where: { id: c.id },
      data: {
        name: str(fd, "name") || c.name, headline: str(fd, "headline") || c.headline, subheadline: str(fd, "subheadline") || null,
        buttonLabel: str(fd, "buttonLabel") || c.buttonLabel, primaryColor: str(fd, "primaryColor") || "#c60d11",
        showDelaySeconds: Math.max(0, Math.floor(num(fd, "showDelaySeconds", 5))), showOnPages: str(fd, "showOnPages") || "home",
        onePlayPerEmail: bool(fd, "onePlayPerEmail"), requireEmail: bool(fd, "requireEmail"),
        startsAt: str(fd, "startsAt") ? new Date(str(fd, "startsAt")) : null, endsAt: str(fd, "endsAt") ? new Date(str(fd, "endsAt") + "T23:59:59") : null,
      },
    });
    return { ok: true, message: "Campaign saved" };
  }
  if (intent === "prize-delete") {
    const p = await prisma.campaignPrize.findFirst({ where: { id: str(fd, "prizeId"), campaignId: c.id }, include: { _count: { select: { plays: true } } } });
    if (!p) return { error: "Prize not found" };
    if (p._count.plays > 0) return { error: "This prize has been won already — set its odds to 0 instead of deleting." };
    await prisma.campaignPrize.delete({ where: { id: p.id } });
    return { ok: true, message: "Prize removed" };
  }
  if (intent === "prize") {
    const type = str(fd, "type") as any;
    const data = {
      label: str(fd, "label"), type,
      value: ["PERCENT_OFF", "AMOUNT_OFF", "POINTS"].includes(type) ? num(fd, "value") : null,
      weight: Math.max(0, Math.floor(num(fd, "weight"))),
      codeValidDays: Math.max(1, Math.floor(num(fd, "codeValidDays", 14))),
      minOrderSubtotal: num(fd, "minOrderSubtotal") > 0 ? num(fd, "minOrderSubtotal") : null,
      color: str(fd, "color") || null, sortOrder: Math.floor(num(fd, "sortOrder")),
    };
    if (!data.label) return { error: "Prize label required" };
    const id = str(fd, "prizeId");
    if (id) await prisma.campaignPrize.updateMany({ where: { id, campaignId: c.id }, data });
    else await prisma.campaignPrize.create({ data: { ...data, campaignId: c.id } });
    return { ok: true, message: id ? "Prize updated" : "Prize added" };
  }
  return { error: "Unknown action" };
};

const TYPE_LABEL: Record<string, string> = { PERCENT_OFF: "% off", AMOUNT_OFF: "$ off", FREE_SHIPPING: "Free shipping", POINTS: "Points", NOTHING: "No prize" };

export default function CampaignEditor() {
  const { campaign: c, prizes, stats, recent } = useLoaderData<typeof loader>();
  useActionToast();
  const [editing, setEditing] = useState<(typeof prizes)[number] | null>(null);
  const [type, setType] = useState("PERCENT_OFF");
  const e = editing;

  return (
    <s-page heading={c.name} inlineSize="large">
      {!c.active && <s-banner tone="info" heading="Paused">This campaign isn't showing to customers. Switch it to Live from the Campaigns list when the prizes look right.</s-banner>}
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
        <Stat label="Plays" value={fmtInt(stats.plays)} />
        <Stat label="Type" value={c.kind === "WHEEL" ? "Spin wheel" : c.kind === "SCRATCH" ? "Scratch card" : "Instant win"} />
        <Stat label="Status" value={c.active ? "Live" : "Paused"} />
      </s-grid>

      <s-section heading="Prizes" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Prize</s-table-header>
            <s-table-header>Type</s-table-header>
            <s-table-header format="numeric">Value</s-table-header>
            <s-table-header format="numeric">Weight</s-table-header>
            <s-table-header format="numeric">Odds</s-table-header>
            <s-table-header format="numeric">Min order</s-table-header>
            <s-table-header format="numeric">Code days</s-table-header>
            <s-table-header format="numeric">Won</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {prizes.map((p) => (
              <s-table-row key={p.id}>
                <s-table-cell><s-stack direction="inline" gap="small" alignItems="center">{p.color && <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: p.color }} />}{p.label}</s-stack></s-table-cell>
                <s-table-cell>{TYPE_LABEL[p.type]}</s-table-cell>
                <s-table-cell>{p.type === "PERCENT_OFF" ? `${p.value}%` : p.type === "AMOUNT_OFF" ? `$${p.value}` : p.type === "POINTS" ? fmtInt(p.value ?? 0) : "—"}</s-table-cell>
                <s-table-cell>{p.weight}</s-table-cell>
                <s-table-cell>{p.odds}%</s-table-cell>
                <s-table-cell>{p.minOrderSubtotal ? `$${p.minOrderSubtotal}` : "—"}</s-table-cell>
                <s-table-cell>{p.codeValidDays}</s-table-cell>
                <s-table-cell>{p.plays}</s-table-cell>
                <s-table-cell>
                  <s-stack direction="inline" gap="small">
                    <s-button type="button" variant="tertiary" onClick={() => { setEditing(p); setType(p.type); }}>Edit</s-button>
                    <Form method="post"><input type="hidden" name="intent" value="prize-delete" /><input type="hidden" name="prizeId" value={p.id} />
                      <s-button type="submit" tone="critical" variant="tertiary">Delete</s-button></Form>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading={e ? `Edit prize: ${e.label}` : "Add a prize"}>
        <s-paragraph>Odds = this prize's weight ÷ total weight. A "No prize" slice keeps the wheel honest and costs nothing.</s-paragraph>
        <Form method="post" key={e?.id ?? "new"}>
          <input type="hidden" name="intent" value="prize" />
          <input type="hidden" name="prizeId" value={e?.id ?? ""} />
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(150px, 1fr))" gap="base">
            <s-text-field name="label" label="Label (shown on wheel)" defaultValue={e?.label ?? ""} placeholder="15% off" required />
            <s-select name="type" label="Type" value={type} onChange={(ev: any) => setType(ev.currentTarget.value)}>
              <s-option value="PERCENT_OFF">% off</s-option>
              <s-option value="AMOUNT_OFF">$ off</s-option>
              <s-option value="FREE_SHIPPING">Free shipping</s-option>
              <s-option value="POINTS">Points</s-option>
              <s-option value="NOTHING">No prize</s-option>
            </s-select>
            {["PERCENT_OFF", "AMOUNT_OFF", "POINTS"].includes(type) && <s-number-field name="value" label={type === "PERCENT_OFF" ? "Percent" : type === "AMOUNT_OFF" ? "Amount ($)" : "Points"} defaultValue={String(e?.value ?? (type === "POINTS" ? 100 : 10))} min={0} />}
            <s-number-field name="weight" label="Weight (odds)" defaultValue={String(e?.weight ?? 10)} min={0} />
            <s-number-field name="codeValidDays" label="Code valid (days)" defaultValue={String(e?.codeValidDays ?? 14)} min={1} />
            <s-number-field name="minOrderSubtotal" label="Min order ($)" defaultValue={String(e?.minOrderSubtotal ?? 0)} min={0} />
            <s-text-field name="color" label="Slice colour (hex)" defaultValue={e?.color ?? ""} placeholder="#c60d11" />
            <s-number-field name="sortOrder" label="Order" defaultValue={String(e?.sortOrder ?? prizes.length)} />
          </s-grid>
          <s-stack direction="inline" gap="base">
            <s-button type="submit" variant="primary">{e ? "Save prize" : "Add prize"}</s-button>
            {e && <s-button type="button" onClick={() => setEditing(null)}>Cancel</s-button>}
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Appearance & behaviour">
        <Form method="post">
          <input type="hidden" name="intent" value="campaign" />
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
            <s-text-field name="name" label="Name (internal)" defaultValue={c.name} />
            <s-text-field name="headline" label="Headline" defaultValue={c.headline} />
            <s-text-field name="subheadline" label="Sub-headline" defaultValue={c.subheadline} />
            <s-text-field name="buttonLabel" label="Button label" defaultValue={c.buttonLabel} />
            <s-text-field name="primaryColor" label="Accent colour (hex)" defaultValue={c.primaryColor} />
            <s-number-field name="showDelaySeconds" label="Show after (seconds)" defaultValue={String(c.showDelaySeconds)} min={0} />
            <s-select name="showOnPages" label="Show on" defaultValue={c.showOnPages}>
              <s-option value="home">Home page only</s-option>
              <s-option value="all">All pages</s-option>
              <s-option value="collection">Collection pages</s-option>
              <s-option value="product">Product pages</s-option>
            </s-select>
            <s-date-field name="startsAt" label="Starts (optional)" defaultValue={c.startsAt} />
            <s-date-field name="endsAt" label="Ends (optional)" defaultValue={c.endsAt} />
          </s-grid>
          <s-checkbox name="requireEmail" label="Require email to play (recommended — subscribes them and awards newsletter points)" defaultChecked={c.requireEmail} />
          <s-checkbox name="onePlayPerEmail" label="One play per email" defaultChecked={c.onePlayPerEmail} />
          <s-button type="submit" variant="primary">Save campaign</s-button>
        </Form>
      </s-section>

      {recent.length > 0 && (
        <s-section heading="Recent plays" padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header>When</s-table-header>
              <s-table-header listSlot="primary">Email</s-table-header>
              <s-table-header>Prize</s-table-header>
              <s-table-header>Code</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recent.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{fmtDate(r.createdAt)}</s-table-cell>
                  <s-table-cell>{r.email.includes("@") ? r.email : "(anonymous)"}</s-table-cell>
                  <s-table-cell>{r.prize}</s-table-cell>
                  <s-table-cell>{r.code ? <code>{r.code}</code> : "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <s-box padding="base" background="subdued" border="base" borderRadius="base">
      <s-text color="subdued">{label}</s-text>
      <s-heading>{value}</s-heading>
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
