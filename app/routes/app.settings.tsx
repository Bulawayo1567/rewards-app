import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProgram } from "../lib/rewards/program.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num, bool } from "../lib/rewards/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { program: await getProgram(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const fd = await request.formData();
  await prisma.program.update({
    where: { shop: session.shop },
    data: {
      name: str(fd, "name") || "Rewards",
      pointsName: str(fd, "pointsName") || "points",
      pointsPerDollar: num(fd, "pointsPerDollar", 1),
      holdDays: Math.max(0, Math.floor(num(fd, "holdDays"))),
      expiryMonths: num(fd, "expiryMonths") > 0 ? Math.floor(num(fd, "expiryMonths")) : null,
      minRedeemPoints: Math.max(0, Math.floor(num(fd, "minRedeemPoints"))),
      earnOnShipping: bool(fd, "earnOnShipping"),
      earnOnTax: bool(fd, "earnOnTax"),
      active: bool(fd, "active"),
      codePrefix: (str(fd, "codePrefix") || "RW").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
    },
  });
  return { ok: true, message: "Settings saved" };
};

export default function Settings() {
  const { program } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  useActionToast();
  const saving = nav.state !== "idle";
  return (
    <s-page heading="Program settings">
      <Form method="post">
        <s-section heading="Basics">
          <s-text-field name="name" label="Program name" defaultValue={program.name} />
          <s-text-field name="pointsName" label="What points are called" defaultValue={program.pointsName} details='Shown to customers, e.g. "points" or "stitches"' />
          <s-checkbox name="active" label="Program active (award points on paid orders)" defaultChecked={program.active} />
        </s-section>

        <s-section heading="Earning">
          <s-number-field name="pointsPerDollar" label="Points per $1 spent" defaultValue={String(program.pointsPerDollar)} step={0.25} min={0} />
          <s-number-field name="holdDays" label="Hold period (days)" defaultValue={String(program.holdDays)} min={0} details="Points from an order stay pending this many days (your return window). 0 = available immediately." />
          <s-number-field name="expiryMonths" label="Points expire after (months)" defaultValue={String(program.expiryMonths ?? 0)} min={0} details="0 = never expire" />
          <s-checkbox name="earnOnShipping" label="Earn on shipping charges" defaultChecked={program.earnOnShipping} />
          <s-checkbox name="earnOnTax" label="Earn on tax" defaultChecked={program.earnOnTax} />
        </s-section>

        <s-section heading="Redeeming">
          <s-number-field name="minRedeemPoints" label="Minimum balance to redeem" defaultValue={String(program.minRedeemPoints)} min={0} />
          <s-text-field name="codePrefix" label="Discount code prefix" defaultValue={program.codePrefix} details="Generated codes look like RW-7K2M9Q" />
        </s-section>

        <s-section>
          <s-button type="submit" variant="primary" loading={saving}>Save settings</s-button>
        </s-section>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
