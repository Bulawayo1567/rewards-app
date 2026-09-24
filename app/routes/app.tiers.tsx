import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { str, num } from "../lib/rewards/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tiers = await prisma.tier.findMany({
    where: { shop: session.shop }, orderBy: { rank: "asc" },
    include: { _count: { select: { customers: true } } },
  });
  return { tiers: tiers.map((t) => ({ ...t, threshold: Number(t.threshold), multiplier: Number(t.multiplier) })) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  console.log("[tiers] form data:", Object.fromEntries(fd));
  const intent = str(fd, "intent");

  if (intent === "delete") {
    const id = str(fd, "id");
    await prisma.customer.updateMany({ where: { shop, tierId: id }, data: { tierId: null } });
    await prisma.tier.delete({ where: { id } });
    return { ok: true };
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
  if (id) await prisma.tier.update({ where: { id }, data });
  else await prisma.tier.upsert({
    where: { shop_name: { shop, name: data.name } },
    update: data,
    create: { shop, ...data },
  });
  return { ok: true };
};

const BASIS_LABEL: Record<string, string> = {
  LIFETIME_POINTS: "lifetime points",
  ROLLING_12M_SPEND: "$ spent in last 12 months",
  LIFETIME_SPEND: "$ spent lifetime",
};

export default function Tiers() {
  const { tiers } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Tiers" inlineSize="large">
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
                <s-table-cell>{t._count.customers}</s-table-cell>
                <s-table-cell>{t.perks ?? ""}</s-table-cell>
                <s-table-cell>
                  <Form method="post" onSubmit={(e) => { if (!confirm(`Delete tier "${t.name}"? Members drop to the next lower tier on their next order.`)) e.preventDefault(); }}>
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={t.id} />
                    <s-button type="submit" tone="critical" variant="tertiary">Delete</s-button>
                  </Form>
                </s-table-cell>
              </s-table-row>
            ))}
            {tiers.length === 0 && <s-table-row><s-table-cell>No tiers yet — add one below.</s-table-cell></s-table-row>}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Add a tier">
        <s-paragraph>
          Rank 0 is the entry tier (threshold 0). The highest rank whose threshold a customer meets is assigned.
          Multiplier 1.25 means 25% more points on every order.
        </s-paragraph>
        <Form method="post">
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
            <s-text-field name="name" label="Name" placeholder="Silver" required />
            <s-number-field name="rank" label="Rank" defaultValue={String(tiers.length)} min={0} />
            <s-number-field name="threshold" label="Threshold" defaultValue="0" min={0} />
            <s-select name="basis" label="Threshold basis" defaultValue="LIFETIME_POINTS">
              <s-option value="LIFETIME_POINTS">Lifetime points</s-option>
              <s-option value="ROLLING_12M_SPEND">$ spent, last 12 months</s-option>
              <s-option value="LIFETIME_SPEND">$ spent, lifetime</s-option>
            </s-select>
            <s-number-field name="multiplier" label="Multiplier" defaultValue="1" step={0.05} min={0} />
            <s-text-field name="color" label="Colour (hex)" placeholder="#c60d11" />
          </s-grid>
          <s-text-field name="perks" label="Perks (shown to customers)" placeholder="Free shipping on orders over $99, early access to sales" />
          <s-button type="submit" variant="primary">Add tier</s-button>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
