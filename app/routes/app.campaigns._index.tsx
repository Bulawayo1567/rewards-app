import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, fmtInt, fmtDate } from "../lib/rewards/format";

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

export default function Campaigns() {
  const { campaigns } = useLoaderData<typeof loader>();
  useActionToast();
  return (
    <s-page heading="Pop-up campaigns" inlineSize="large">
      <s-section padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Campaign</s-table-header>
            <s-table-header>Type</s-table-header>
            <s-table-header>Window</s-table-header>
            <s-table-header format="numeric">Prizes</s-table-header>
            <s-table-header format="numeric">Plays</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {campaigns.map((c) => (
              <s-table-row key={c.id}>
                <s-table-cell><s-link href={`/app/campaigns/${c.id}`}>{c.name}</s-link></s-table-cell>
                <s-table-cell>{KIND[c.kind]}</s-table-cell>
                <s-table-cell>{c.startsAt || c.endsAt ? `${c.startsAt?.slice(0, 10) ?? "…"} → ${c.endsAt?.slice(0, 10) ?? "…"}` : "always"}</s-table-cell>
                <s-table-cell>{c.prizes}</s-table-cell>
                <s-table-cell>{fmtInt(c.plays)}</s-table-cell>
                <s-table-cell>
                  <Form method="post"><input type="hidden" name="intent" value="toggle" /><input type="hidden" name="id" value={c.id} />
                    <s-button type="submit" variant="tertiary" tone={c.active ? "success" : "neutral"}>{c.active ? "Live" : "Paused"}</s-button></Form>
                </s-table-cell>
                <s-table-cell>
                  <Form method="post" onSubmit={(e) => { if (!confirm(`Delete "${c.name}" and its ${c.plays} plays?`)) e.preventDefault(); }}>
                    <input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={c.id} />
                    <s-button type="submit" tone="critical" variant="tertiary">Delete</s-button></Form>
                </s-table-cell>
              </s-table-row>
            ))}
            {campaigns.length === 0 && <s-table-row><s-table-cell>No campaigns yet.</s-table-cell></s-table-row>}
          </s-table-body>
        </s-table>
      </s-section>
      <s-section heading="New campaign">
        <s-paragraph>Only one campaign is live at a time. A new campaign starts paused with four sample prizes you can edit.</s-paragraph>
        <Form method="post">
          <s-grid gridTemplateColumns="2fr 1fr auto" gap="base" alignItems="end">
            <s-text-field name="name" label="Name (internal)" placeholder="Fall welcome wheel" required />
            <s-select name="kind" label="Type" defaultValue="WHEEL">
              <s-option value="WHEEL">Spin wheel</s-option>
              <s-option value="SCRATCH">Scratch card</s-option>
              <s-option value="INSTANT">Instant win</s-option>
            </s-select>
            <s-button type="submit" variant="primary">Create</s-button>
          </s-grid>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
