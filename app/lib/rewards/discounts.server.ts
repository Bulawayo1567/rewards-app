type AdminGraphql = (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function generateCode(prefix: string, len = 7) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${prefix}-${s}`;
}

export interface MintOptions {
  code: string;
  title: string;
  customerGid: string | null;       // lock to this customer when known
  endsAt: Date;
  minSubtotal?: number | null;
  kind: "FIXED_AMOUNT" | "PERCENTAGE" | "FREE_SHIPPING" | "FREE_PRODUCT";
  value?: number | null;            // dollars or percent (10 = 10%)
  variantGid?: string | null;       // FREE_PRODUCT
}

/** Creates a single-use, customer-locked discount code. Returns the DiscountCodeNode gid. */
export async function mintDiscountCode(graphql: AdminGraphql, o: MintOptions): Promise<string> {
  const customerSelection = o.customerGid ? { customers: { add: [o.customerGid] } } : { all: true };
  const minimumRequirement = o.minSubtotal && o.minSubtotal > 0
    ? { subtotal: { greaterThanOrEqualToSubtotal: o.minSubtotal.toFixed(2) } }
    : undefined;
  const common = {
    title: o.title,
    code: o.code,
    startsAt: new Date().toISOString(),
    endsAt: o.endsAt.toISOString(),
    usageLimit: 1,
    appliesOncePerCustomer: true,
    customerSelection,
    ...(minimumRequirement ? { minimumRequirement } : {}),
  };

  if (o.kind === "FREE_SHIPPING") {
    const res = await graphql(
      `#graphql
      mutation Mint($d: DiscountCodeFreeShippingInput!) {
        discountCodeFreeShippingCreate(freeShippingCodeDiscount: $d) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }`,
      { variables: { d: { ...common, destination: { all: true }, combinesWith: { orderDiscounts: true, productDiscounts: true } } } },
    );
    const j = await res.json();
    const errs = j?.data?.discountCodeFreeShippingCreate?.userErrors;
    if (errs?.length) throw new Error(errs.map((e: any) => e.message).join("; "));
    return j.data.discountCodeFreeShippingCreate.codeDiscountNode.id;
  }

  let customerGets: Record<string, unknown>;
  if (o.kind === "FIXED_AMOUNT") {
    customerGets = { value: { discountAmount: { amount: (o.value ?? 0).toFixed(2), appliesOnEachItem: false } }, items: { all: true } };
  } else if (o.kind === "PERCENTAGE") {
    customerGets = { value: { percentage: (o.value ?? 0) / 100 }, items: { all: true } };
  } else {
    customerGets = { value: { percentage: 1 }, items: { products: { productVariantsToAdd: [o.variantGid] } } };
  }

  const res = await graphql(
    `#graphql
    mutation Mint($d: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $d) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`,
    { variables: { d: { ...common, customerGets, combinesWith: { orderDiscounts: false, productDiscounts: true, shippingDiscounts: true } } } },
  );
  const j = await res.json();
  const errs = j?.data?.discountCodeBasicCreate?.userErrors;
  if (errs?.length) throw new Error(errs.map((e: any) => e.message).join("; "));
  return j.data.discountCodeBasicCreate.codeDiscountNode.id;
}

export async function deactivateDiscount(graphql: AdminGraphql, nodeId: string) {
  const res = await graphql(
    `#graphql
    mutation Off($id: ID!) { discountCodeDeactivate(id: $id) { userErrors { field message } } }`,
    { variables: { id: nodeId } },
  );
  const j = await res.json();
  const errs = j?.data?.discountCodeDeactivate?.userErrors;
  if (errs?.length) console.error("[rewards] deactivate errors", errs);
}
