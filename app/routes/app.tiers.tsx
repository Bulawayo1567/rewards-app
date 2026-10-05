import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num, fmtInt } from "../lib/rewards/format";
import { Hero, UIStyles } from "../lib/rewards/ui";

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
  const nextRank = tiers.length ? Math.max(...tiers.map((t) => t.rank)) + 1 : 0;
  const totalMembers = tiers.reduce((n, t) => n + t.members, 0);

  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero
        title="Tiers"
        sub={<>{tiers.length} tier{tiers.length === 1 ? "" : "s"} · {fmtInt(totalMembers)} members placed</>}
        right={
          <Form method="post" onSubmit={(ev) => { if (!confirm("Recalculate tiers for all members now?")) ev.preventDefault(); }}>
            <input type="hidden" name="intent" value="retier" />
            <s-button type="submit" variant="primary">Recalculate all members</s-button>
          </Form>
        }
      />

      {result && "error" in result && result.error && <s-banner tone="critical" heading="Not saved">{result.error}</s-banner>}

      {/* Tier ladder */}
      <div className="aas-panel">
        <div className="aas-h">Tier ladder — lowest to highest</div>
        {tiers.length === 0 ? <div className="aas-muted">No tiers yet — add your entry tier below (rank 0, threshold 0).</div> : (
          <div className="aas-ladder">
            {tiers.map((t) => (
              <div key={t.id} className="aas-tiercard" style={e?.id === t.id ? { borderColor: "#c60d11" } : undefined}>
                <div className="rk">RANK {t.rank}</div>
                <div className="nm" style={{ color: t.color || "#c60d11" }}>{t.name}</div>
                <div className="aas-kv"><span>Members</span><b>{fmtInt(t.members)}</b></div>
                <div className="aas-kv"><span>Reached at</span><b>{t.basis === "LIFETIME_POINTS" ? `${fmtInt(t.threshold)} lifetime pts` : t.basis === "LIFETIME_SPEND" ? `$${fmtInt(t.threshold)} lifetime` : `$${fmtInt(t.threshold)} / 12 mo`}</b></div>
                <div className="aas-kv"><span>Earning</span><b>{t.multiplier}×</b></div>
                <div className="aas-kv"><span>Perks</span><b style={{ textAlign: "right" }}>{t.perks || "—"}</b></div>
                <div className="ft">
                  <s-button type="button" variant="secondary" onClick={() => setEditing(t)}>Edit</s-button>
                  <Form method="post" onSubmit={(ev) => { if (!confirm(`Delete tier "${t.name}"? Its members drop to the next lower tier when you recalculate.`)) ev.preventDefault(); }}>
                    <input type="hidden" name="intent" value="delete" /><input type="hidden" name="id" value={t.id} />
                    <s-button type="submit" tone="critical" variant="tertiary">Delete</s-button>
                  </Form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / edit */}
      <div className="aas-panel">
        <div className="aas-h">{e ? `Edit tier: ${e.name}` : "Add a tier"}</div>
        <p className="aas-muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
          Members land in the highest-ranked tier whose threshold they meet. A multiplier of 1.25 means 25% more points on every order. After adding or changing tiers, press <b>Recalculate all members</b>.
        </p>
        <Form method="post" key={e?.id ?? "new"}>
          <input type="hidden" name="id" value={e?.id ?? ""} />
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
            <s-text-field name="name" label="Name" placeholder="Silver" defaultValue={e?.name ?? ""} required />
            <s-number-field name="rank" label="Rank" defaultValue={String(e?.rank ?? nextRank)} min={0} />
            <s-number-field name="threshold" label="Threshold" defaultValue={String(e?.threshold ?? 0)} min={0} />
            <s-select name="basis" label="Threshold basis" defaultValue={e?.basis ?? "LIFETIME_POINTS"}>
              <s-option value="LIFETIME_POINTS">Lifetime points</s-option>
              <s-option value="ROLLING_12M_SPEND">$ spent, last 12 months</s-option>
              <s-option value="LIFETIME_SPEND">$ spent, lifetime</s-option>
            </s-select>
            <s-number-field name="multiplier" label="Multiplier" defaultValue={String(e?.multiplier ?? 1)} step={0.05} min={0} />
            <s-text-field name="color" label="Colour (hex)" placeholder="#c60d11" defaultValue={e?.color ?? ""} />
          </s-grid>
          <div style={{ marginTop: 12 }}>
            <s-text-field name="perks" label="Perks (shown to customers)" placeholder="Free shipping on orders over $99, early access to sales" defaultValue={e?.perks ?? ""} />
          </div>
          <div className="aas-actions" style={{ marginTop: 14 }}>
            <s-button type="submit" variant="primary">{e ? "Save changes" : "Add tier"}</s-button>
            {e && <s-button type="button" onClick={() => setEditing(null)}>Cancel</s-button>}
          </div>
        </Form>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
