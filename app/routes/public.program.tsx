import type { LoaderFunctionArgs } from "react-router";
import { getProgram } from "../lib/rewards/program.server";

/** Public, cacheable program facts for checkout/thank-you blocks: GET /public/program?shop=x.myshopify.com */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = new URL(request.url).searchParams.get("shop") ?? "";
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) return new Response("bad shop", { status: 400 });
  const p = await getProgram(shop);
  return new Response(JSON.stringify({ name: p.name, pointsName: p.pointsName, pointsPerDollar: Number(p.pointsPerDollar), pointValueCents: Number(p.pointValueCents ?? 1), active: p.active }),
    { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
};
