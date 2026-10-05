import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, Link, useLoaderData, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, fmtInt, fmtDate } from "../lib/rewards/format";
import { Hero, UIStyles, Tabs, EARN_TABS, Card, Field, Empty, Pill } from "../lib/rewards/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const campaigns = await prisma.campaign.findMany({ where: { shop: session.shop }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { plays: true, prizes: true } } } });
  return { campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, kind: c.kind, active: c.active, startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null, plays: c._count.plays, prizes: c._count.prizes, updatedAt: c.updatedAt.toISOString() })) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = str(fd, "intent");
  if (intent === "toggle") {
    const c = await prisma.campaign.findFirst({ where: { shop, id: str(fd, "id") }, include: { _count: { select: { prizes: true } } } });
    if (!c) return { error: "Not found" };
    if (!c.active && c._count.prizes === 0) return { error: "Add at least one prize before activating." };
    if (!c.active) await prisma.campaign.updateMany({ where: { shop, active: true }, data: { active: false } }); // one live campaign at a time
    await prisma.campaign.update({ where: { id: c.id }, data: { active: !c.active } });
    return { ok: true, message: c.active ? "Campaign paused" : "Campaign is live" };
  }
  if (intent === "delete") {
    await prisma.campaign.deleteMany({ where: { shop, id: str(fd, "id") } });
    return { ok: true, message: "Campaign deleted" };
  }
  const name = str(fd, "name");
  if (!name) return { error: "Name required" };
  const kind = (str(fd, "kind") || "WHEEL") as "WHEEL" | "SCRATCH" | "INSTANT";
  const c = await prisma.campaign.create({
    data: {
      shop, name, kind, headline: kind === "WHEEL" ? "Spin to win!" : kind === "SCRATCH" ? "Scratch & win!" : "You've unlocked a surprise",
      subheadline: "Enter your email for a chance at an exclusive discount.", buttonLabel: kind === "WHEEL" ? "Spin the wheel" : kind === "SCRATCH" ? "Scratch now" : "Reveal my prize",
      prizes: { create: [
        { label: "10% off", type: "PERCENT_OFF", value: 10, weight: 30, color: "#c60d11", sortOrder: 0 },
        { label: "Free shipping", type: "FREE_SHIPPING", weight: 20, color: "#222222", sortOrder: 1 },
        { label: "$15 off", type: "AMOUNT_OFF", value: 15, weight: 10, minOrderSubtotal: 100, color: "#c60d11", sortOrder: 2 },
        { label: "Try again next time", type: "NOTHING", weight: 40, color: "#888888", sortOrder: 3 },
      ] },
    },
  });
  return redirect(`/app/campaigns/${c.id}`);
};

const KIND: Record<string, string> = { WHEEL: "Spin wheel", SCRATCH: "Scratch card", INSTANT: "Instant win" };

const KIND: Record<string, string> = { WHEEL: "Spin wheel", SCRATCH: "Scratch card", INSTANT: "Instant win" };
const KICON: Record<string, string> = { WHEEL: "🎡", SCRATCH: "🎟️", INSTANT: "🎁" };

export default function Campaigns() {
  const { campaigns } = useLoaderData<typeof loader>();
  useActionToast();
  const live = campaigns.find((c) => c.active);
  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title="Earn & Redeem" sub={live ? `Pop-up live: ${live.name}` : "No pop-up is live right now"} />
      <Tabs items={EARN_TABS} active="campaigns" />

      <Card icon="🎡" title="New campaign" sub="Only one campaign is live at a time. A new one starts paused with four sample prizes you can edit.">
        <Form method="post" className="st-form">
          <div className="st-grid">
            <Field label="Name (internal)"><input className="txt" name="name" placeholder="Fall welcome wheel" required /></Field>
            <Field label="Type"><select name="kind" defaultValue="WHEEL"><option value="WHEEL">Spin wheel</option><option value="SCRATCH">Scratch card</option><option value="INSTANT">Instant win</option></select></Field>
            <div className="fld"><label>&nbsp;</label><button className="st-btn primary" type="submit" style={{ width: "100%" }}>Create</button></div>
          </div>
        </Form>
      </Card>

      <Card icon="🧵" title="Campaigns" sub={`${campaigns.length} saved`}>
        {campaigns.length === 0 ? <Empty>No campaigns yet.</Empty> : (
          <div className="st-list">
            {campaigns.map((c) => (
              <div key={c.id} className={`st-item${c.active ? "" : " off"}`}>
                <div className="ic">{KICON[c.kind]}</div>
                <div>
                  <div className="ttl"><Link to={`/app/campaigns/${c.id}`} style={{ color: "inherit" }}>{c.name}</Link> {c.active ? <Pill>live</Pill> : <Pill tone="warn">paused</Pill>}</div>
                  <div className="meta"><span>{KIND[c.kind]}</span><span>·</span><span>{c.prizes} prizes</span><span>·</span><b>{fmtInt(c.plays)} plays</b><span>·</span><span>{c.startsAt || c.endsAt ? `${c.startsAt?.slice(0, 10) ?? "…"} → ${c.endsAt?.slice(0, 10) ?? "…"}` : "no date limits"}</span></div>
                </div>
                <div className="acts">
                  <Form method="post"><input type="hidden" name="intent" value="toggle" /><input type="hidden" name="id" value={c.id} /><button className={`st-btn ${c.active ? "secondary" : "primary"} sm`} type="submit">{c.active ? "Pause" : "Go live"}</button></Form>
                  <Link className="st-btn secondary sm" to={`/app/campaigns/${c.id}`}>Edit</Link>
                  <Form method="post" onSubmit={(e) => { if (!confirm(`Delete "${c.name}" and its ${c.plays} plays?`)) e.preventDefault(); }}><input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={c.id} /><button className="st-btn danger sm" type="submit">Delete</button></Form>
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
