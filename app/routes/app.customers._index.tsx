import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { fmtDate, fmtInt } from "../lib/rewards/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const customers = await prisma.customer.findMany({
    where: {
      shop: session.shop,
      ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: { tier: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return { q, customers: customers.map((c) => ({ ...c, lifetimeSpend: Number(c.lifetimeSpend), updatedAt: c.updatedAt.toISOString(), createdAt: c.createdAt.toISOString(), birthday: c.birthday?.toISOString() ?? null, tierAssignedAt: c.tierAssignedAt?.toISOString() ?? null })) };
};

export default function Customers() {
  const { q, customers } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Members" inlineSize="large">
      <s-section>
        <Form method="get">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field name="q" label="Search by email or name" defaultValue={q} />
            <s-button type="submit">Search</s-button>
          </s-stack>
        </Form>
      </s-section>
      <s-section padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Customer</s-table-header>
            <s-table-header>Email</s-table-header>
            <s-table-header>Tier</s-table-header>
            <s-table-header format="numeric">Balance</s-table-header>
            <s-table-header format="numeric">Pending</s-table-header>
            <s-table-header format="numeric">Lifetime</s-table-header>
            <s-table-header>Last activity</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {customers.map((c) => (
              <s-table-row key={c.id}>
                <s-table-cell><s-link href={`/app/customers/${c.id}`}>{[c.firstName, c.lastName].filter(Boolean).join(" ") || "(no name)"}</s-link></s-table-cell>
                <s-table-cell>{c.email}</s-table-cell>
                <s-table-cell>{c.tier ? <s-badge>{c.tier.name}</s-badge> : "—"}</s-table-cell>
                <s-table-cell>{fmtInt(c.balance)}</s-table-cell>
                <s-table-cell>{fmtInt(c.pendingBalance)}</s-table-cell>
                <s-table-cell>{fmtInt(c.lifetimePoints)}</s-table-cell>
                <s-table-cell>{fmtDate(c.updatedAt)}</s-table-cell>
              </s-table-row>
            ))}
            {customers.length === 0 && <s-table-row><s-table-cell>No members found.</s-table-cell></s-table-row>}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
