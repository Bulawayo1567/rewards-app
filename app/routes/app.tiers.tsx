import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num } from "../lib/rewards/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tiers = await prisma.tier.findMany({
    where: { shop: session.shop }, orderBy: { rank: "asc" },
    include: { _count: { select: { customers: true } } },
  });
  return { tiers: tiers.map((t) => ({ id: t.id, name: t.name, rank: t.rank, threshold: Number(t.threshold), basis: t.basis, multiplier: Number(t.multiplier), perks: t.perks, color: t.color, members: t._count.customers })) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = str(fd, "intent");

  if (intent === "retier") {
    // Fast bulk re-tier: walk tiers lowest → highest so each member ends on the highest tier they qualify for.
    // Rolling-12-month tiers are approximated with lifetime spend here; exact values settle on each member's next order.
    const tiers = await prisma.tier.findMany({ where: { shop }, orderBy: { rank: "asc" } });
    await prisma.$transaction([
      prisma.customer.updateMany({ where: { shop }, data: { tierId: null } }),
      ...tiers.map((t) => prisma.customer.updateMany({
        where: t.basis === "LIFETIME_POINTS"
          ? { shop, lifetimePoints: { gte: Math.ceil(Number(t.threshold)) } }
          : { shop, lifetimeSpend: { gte: t.threshold } },
        data: { tierId: t.id, tierAssignedAt: new Date() },
      })),
    ]);
    const counts = await prisma.customer.groupBy({ by: ["tierId"], where: { shop }, _count: { _all: true } });
    const placed = counts.filter((c) => c.tierId).reduce((n, c) => n + c._count._all, 0);
    return { ok: true, message: `Recalculated — ${placed.toLocaleString()} members placed in a tier` };
  }

  if (intent === "delete") {
    const id = str(fd, "id");
    await prisma.customer.updateMany({ where: { shop, tierId: id }, data: { tierId: null } });
    await prisma.tier.deleteMany({ where: { shop, id } });
    return { ok: true, message: "Tier deleted" };
  }

  const data = {
    name: str(fd, "name"),
    rank: Math.floor(num(fd, "rank")),
    threshold: num(fd, "threshold"),
    basis: str(fd, "basis") as "LIFETIME_POINTS" | "ROLLING_12M_SPEND" | "LIFETIME_SPEND",
    multiplier: num(fd, "multiplier", 1),
    perks: str(fd, "perks") || null,
    color: str(fd, "color") || null,
  };
  if (!data.name) return { error: "Name is required" };

  const id = str(fd, "id");
  try {
    if (id) await prisma.tier.update({ where: { id }, data });
    else await prisma.tier.create({ data: { shop, ...data } });
  } catch (e: any) {
    if (e?.code === "P2002") return { error: `A tier with that ${e.meta?.target?.includes("rank") ? "rank" : "name"} already exists.` };
    throw e;
  }
  return { ok: true, message: id ? "Tier updated" : "Tier added" };
};

const BASIS_LABEL: Record<string, string> = {
  LIFETIME_POINTS: "lifetime points",
  ROLLING_12M_SPEND: "$ spent in last 12 months",
  LIFETIME_SPEND: "$ spent lifetime",
};

export default function Tiers() {
  const { tiers } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  useActionToast();
  const [editing, setEditing] = useState<(typeof tiers)[number] | null>(null);
  const e = editing;
  useEffect(() => { if (result && "ok" in result && result.ok) setEditing(null); }, [result]);

  return (
    <s-page heading="Tiers" inlineSize="large">
      {result && "error" in result && result.error && <s-banner tone="critical" heading="Not saved">{result.error}</s-banner>}

      <s-section heading="Current tiers" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header format="numeric">Rank</s-table-header>
            <s-table-header listSlot="primary">Name</s-table-header>
            <s-table-header format="numeric">Threshold</s-table-header>
            <s-table-header>Basis</s-table-header>
            <s-table-header format="numeric">Multiplier</s-table-header>
            <s-table-header format="numeric">Members</s-table-header>
            <s-table-header>Perks</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {tiers.map((t) => (
              <s-table-row key={t.id}>
                <s-table-cell>{t.rank}</s-table-cell>
                <s-table-cell><s-badge>{t.name}</s-badge></s-table-cell>
                <s-table-cell>{t.threshold}</s-table-cell>
                <s-table-cell>{BASIS_LABEL[t.basis]}</s-table-cell>
                <s-table-cell>{t.multiplier}×</s-table-cell>
                <s-table-cell>{t.members}</s-table-cell>
                <s-table-cell>{t.perks ?? ""}</s-table-cell>
                <s-table-cell>
                  <s-stack direction="inline" gap="small">
                    <s-button type="button" variant="tertiary" onClick={() => setEditing(t)}>Edit</s-button>
                    <Form method="post" onSubmit={(ev) => { if (!confirm(`Delete tier "${t.name}"? Members are re-tiered on their next activity.`)) ev.preventDefault(); }}>
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={t.id} />
                      <s-button type="submit" tone="critical" variant="tertiary">Delete</s-button>
                    </Form>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
            {tiers.length === 0 && <s-table-row><s-table-cell>No tiers yet — add one below.</s-table-cell></s-table-row>}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Recalculate">
        <s-paragraph>Re-places every member in the highest tier they qualify for. Use after importing balances or changing thresholds. Members' account pages pick up the new tier on their next visit or order.</s-paragraph>
        <Form method="post" onSubmit={(ev) => { if (!confirm("Recalculate tiers for all members now?")) ev.preventDefault(); }}>
          <input type="hidden" name="intent" value="retier" />
          <s-button type="submit" variant="primary">Recalculate all members</s-button>
        </Form>
      </s-section>

      <s-section heading={e ? `Edit tier: ${e.name}` : "Add a tier"}>
        <s-paragraph>
          Rank 0 is the entry tier (threshold 0). The highest rank whose threshold a customer meets is assigned.
          Multiplier 1.25 means 25% more points on every order.
        </s-paragraph>
        <Form method="post" key={e?.id ?? "new"}>
          <input type="hidden" name="id" value={e?.id ?? ""} />
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
            <s-text-field name="name" label="Name" placeholder="Silver" defaultValue={e?.name ?? ""} required />
            <s-number-field name="rank" label="Rank" defaultValue={String(e?.rank ?? tiers.length)} min={0} />
            <s-number-field name="threshold" label="Threshold" defaultValue={String(e?.threshold ?? 0)} min={0} />
            <s-select name="basis" label="Threshold basis" defaultValue={e?.basis ?? "LIFETIME_POINTS"}>
              <s-option value="LIFETIME_POINTS">Lifetime points</s-option>
              <s-option value="ROLLING_12M_SPEND">$ spent, last 12 months</s-option>
              <s-option value="LIFETIME_SPEND">$ spent, lifetime</s-option>
            </s-select>
            <s-number-field name="multiplier" label="Multiplier" defaultValue={String(e?.multiplier ?? 1)} step={0.05} min={0} />
            <s-text-field name="color" label="Colour (hex)" placeholder="#c60d11" defaultValue={e?.color ?? ""} />
          </s-grid>
          <s-text-field name="perks" label="Perks (shown to customers)" placeholder="Free shipping on orders over $99, early access to sales" defaultValue={e?.perks ?? ""} />
          <s-stack direction="inline" gap="base">
            <s-button type="submit" variant="primary">{e ? "Save changes" : "Add tier"}</s-button>
            {e && <s-button type="button" onClick={() => setEditing(null)}>Cancel</s-button>}
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
