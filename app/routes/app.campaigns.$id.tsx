import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num, bool, fmtInt, fmtDate } from "../lib/rewards/format";
import { Hero, UIStyles, Tabs, EARN_TABS, Card, Field, Chip, Empty, Pill } from "../lib/rewards/ui";

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

const PTYPE: Record<string, string> = { PERCENT_OFF: "% off", AMOUNT_OFF: "$ off", FREE_SHIPPING: "Free shipping", POINTS: "Points", NOTHING: "No prize" };

export default function CampaignEditor() {
  const { campaign: c, prizes, stats, recent } = useLoaderData<typeof loader>();
  useActionToast();
  const [editing, setEditing] = useState<(typeof prizes)[number] | null>(null);
  const [type, setType] = useState("PERCENT_OFF");
  const e = editing;

  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title="Earn & Redeem" sub={<>Campaign: <b>{c.name}</b> · {c.active ? "live" : "paused"} · {fmtInt(stats.plays)} plays</>} />
      <Tabs items={EARN_TABS} active="campaigns" />
      <div style={{ margin: "4px 0 10px" }}><Link to="/app/campaigns" className="st-btn ghost">← All campaigns</Link></div>

      <Card icon="🎟️" title="Prizes" sub="Odds = this prize's weight ÷ total weight. A 'No prize' slice keeps the wheel honest and costs nothing.">
        {prizes.length === 0 ? <Empty>No prizes yet.</Empty> : (
          <div className="st-list" style={{ marginBottom: 18 }}>
            {prizes.map((p) => (
              <div key={p.id} className="st-item">
                <div className="ic" style={p.color ? { background: p.color, borderColor: p.color, color: "#fff" } : undefined}>{p.type === "NOTHING" ? "✖" : "🎁"}</div>
                <div>
                  <div className="ttl">{p.label} <Pill tone="info">{p.odds}% odds</Pill></div>
                  <div className="meta"><span>{PTYPE[p.type]}{p.type === "PERCENT_OFF" ? ` ${p.value}%` : p.type === "AMOUNT_OFF" ? ` $${p.value}` : p.type === "POINTS" ? ` ${fmtInt(p.value ?? 0)}` : ""}</span><span>·</span><span>weight {p.weight}</span>{p.minOrderSubtotal ? <><span>·</span><span>min order ${p.minOrderSubtotal}</span></> : null}<span>·</span><span>code valid {p.codeValidDays}d</span><span>·</span><b>won {p.plays}×</b></div>
                </div>
                <div className="acts">
                  <button className="st-btn secondary sm" type="button" onClick={() => { setEditing(p); setType(p.type); }}>Edit</button>
                  <Form method="post"><input type="hidden" name="intent" value="prize-delete" /><input type="hidden" name="prizeId" value={p.id} /><button className="st-btn danger sm" type="submit">Delete</button></Form>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="aas-h">{e ? `Edit prize: ${e.label}` : "Add a prize"}</div>
        <Form method="post" key={e?.id ?? "new"} className="st-form">
          <input type="hidden" name="intent" value="prize" /><input type="hidden" name="prizeId" value={e?.id ?? ""} />
          <div className="st-grid">
            <Field label="Label (shown on wheel)"><input className="txt" name="label" defaultValue={e?.label ?? ""} placeholder="15% off" required /></Field>
            <Field label="Type"><select name="type" value={type} onChange={(ev) => setType(ev.target.value)}><option value="PERCENT_OFF">% off</option><option value="AMOUNT_OFF">$ off</option><option value="FREE_SHIPPING">Free shipping</option><option value="POINTS">Points</option><option value="NOTHING">No prize</option></select></Field>
            {["PERCENT_OFF", "AMOUNT_OFF", "POINTS"].includes(type) ? <Field label={type === "PERCENT_OFF" ? "Percent" : type === "AMOUNT_OFF" ? "Amount" : "Points"} unit={type === "PERCENT_OFF" ? "%" : type === "AMOUNT_OFF" ? "$" : "pts"}><input name="value" type="number" min="0" defaultValue={e?.value ?? (type === "POINTS" ? 100 : 10)} /></Field> : <Field label="Weight (odds)"><input name="weight" type="number" min="0" defaultValue={e?.weight ?? 10} /></Field>}
          </div>
          <div className="st-grid">
            {["PERCENT_OFF", "AMOUNT_OFF", "POINTS"].includes(type) && <Field label="Weight (odds)"><input name="weight" type="number" min="0" defaultValue={e?.weight ?? 10} /></Field>}
            <Field label="Code valid" unit="days"><input name="codeValidDays" type="number" min="1" defaultValue={e?.codeValidDays ?? 14} /></Field>
            <Field label="Min order" unit="$"><input name="minOrderSubtotal" type="number" min="0" defaultValue={e?.minOrderSubtotal ?? 0} /></Field>
            <Field label="Slice colour" hint="blank = red/blush pattern"><input className="txt" name="color" defaultValue={e?.color ?? ""} placeholder="#c60d11" /></Field>
            <Field label="Order"><input name="sortOrder" type="number" defaultValue={e?.sortOrder ?? prizes.length} /></Field>
          </div>
          <div className="st-foot">
            <button className="st-btn primary" type="submit">{e ? "Save prize" : "Add prize"}</button>
            {e && <button className="st-btn ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>}
          </div>
        </Form>
      </Card>

      <Card icon="🎨" title="Appearance & behaviour" sub="Copy, colour, timing and where it shows.">
        <Form method="post" className="st-form">
          <input type="hidden" name="intent" value="campaign" />
          <div className="st-grid">
            <Field label="Name (internal)"><input className="txt" name="name" defaultValue={c.name} /></Field>
            <Field label="Headline"><input className="txt" name="headline" defaultValue={c.headline} /></Field>
            <Field label="Button label"><input className="txt" name="buttonLabel" defaultValue={c.buttonLabel} /></Field>
          </div>
          <div className="st-grid two"><Field label="Sub-headline"><input className="txt" name="subheadline" defaultValue={c.subheadline} /></Field><Field label="Accent colour"><input className="txt" name="primaryColor" defaultValue={c.primaryColor} /></Field></div>
          <div className="st-grid">
            <Field label="Show after" unit="seconds"><input name="showDelaySeconds" type="number" min="0" defaultValue={c.showDelaySeconds} /></Field>
            <Field label="Show on"><select name="showOnPages" defaultValue={c.showOnPages}><option value="home">Home page only</option><option value="all">All pages</option><option value="collection">Collection pages</option><option value="product">Product pages</option></select></Field>
            <Field label="Starts" hint="optional"><input name="startsAt" type="date" defaultValue={c.startsAt} /></Field>
            <Field label="Ends" hint="optional"><input name="endsAt" type="date" defaultValue={c.endsAt} /></Field>
          </div>
          <div className="st-chips" style={{ marginTop: 4, marginBottom: 16 }}>
            <Chip name="requireEmail" label="Require email to play (subscribes + newsletter points)" defaultChecked={c.requireEmail} />
            <Chip name="onePlayPerEmail" label="One play per email" defaultChecked={c.onePlayPerEmail} />
          </div>
          <div className="st-foot"><button className="st-btn primary" type="submit">Save campaign</button></div>
        </Form>
      </Card>

      {recent.length > 0 && (
        <Card icon="📋" title="Recent plays" sub={`last ${recent.length}`}>
          <div className="aas-tblwrap"><table className="aas-tbl"><thead><tr><th>When</th><th>Email</th><th>Prize</th><th>Code</th></tr></thead><tbody>
            {recent.map((r) => <tr key={r.id}><td className="dim" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.createdAt)}</td><td>{r.email.includes("@") ? r.email : "(anonymous)"}</td><td>{r.prize}</td><td>{r.code ? <code>{r.code}</code> : "—"}</td></tr>)}
          </tbody></table></div>
        </Card>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
