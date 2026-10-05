import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProgram } from "../lib/rewards/program.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { str, num, bool } from "../lib/rewards/format";
import { Hero, UIStyles, Tabs, SETTINGS_TABS, Card, Field, Toggle, Chip, Ribbon } from "../lib/rewards/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const p = await getProgram(session.shop);
  // Decimal fields must be converted to plain numbers before they reach the form.
  return {
    program: {
      name: p.name, pointsName: p.pointsName, active: p.active,
      pointsPerDollar: Number(p.pointsPerDollar), pointValueCents: Number(p.pointValueCents ?? 1),
      holdDays: p.holdDays, expiryMonths: p.expiryMonths ?? 0, minRedeemPoints: p.minRedeemPoints,
      earnOnShipping: p.earnOnShipping, earnOnTax: p.earnOnTax, codePrefix: p.codePrefix,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const current = await getProgram(session.shop);
  const fd = await request.formData();
  const ppd = num(fd, "pointsPerDollar", Number(current.pointsPerDollar));
  const pv = num(fd, "pointValueCents", Number(current.pointValueCents ?? 1));
  if (ppd <= 0) return { error: "Points per $1 must be greater than 0." };
  if (pv <= 0) return { error: "Value of one point must be greater than 0." };

  await prisma.program.update({
    where: { shop: session.shop },
    data: {
      name: str(fd, "name") || current.name,
      pointsName: str(fd, "pointsName") || current.pointsName,
      pointsPerDollar: ppd,
      pointValueCents: pv,
      holdDays: Math.max(0, Math.floor(num(fd, "holdDays", current.holdDays))),
      expiryMonths: num(fd, "expiryMonths", current.expiryMonths ?? 0) > 0 ? Math.floor(num(fd, "expiryMonths", 0)) : null,
      minRedeemPoints: Math.max(0, Math.floor(num(fd, "minRedeemPoints", current.minRedeemPoints))),
      earnOnShipping: bool(fd, "earnOnShipping"),
      earnOnTax: bool(fd, "earnOnTax"),
      active: bool(fd, "active"),
      codePrefix: (str(fd, "codePrefix") || current.codePrefix).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
    },
  });
  return { ok: true, message: "Settings saved" };
};

export default function Settings() {
  const { program } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  useActionToast();
  const saving = nav.state !== "idle";
  const [rate, setRate] = useState(program.pointsPerDollar);
  const [cents, setCents] = useState(program.pointValueCents);
  const [active, setActive] = useState(program.active);
  const [pn, setPn] = useState(program.pointsName || "points");
  const earned = Math.floor(100 * (Number(rate) || 0));
  const back = (earned * (Number(cents) || 0)) / 100;
  const perDollar = Number(cents) > 0 ? Math.round(100 / Number(cents)) : 0;

  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title="Settings" sub={<>{program.name} · {active ? "live" : "paused"}</>} />
      <Tabs items={SETTINGS_TABS} active="program" />

      <Form method="post">
        <div className="st-wrap">
          <div>
            <Card icon="🧵" title="Program" sub="The name and currency word customers see everywhere.">
              <div className="st-grid two">
                <Field label="Program name"><input className="txt" name="name" defaultValue={program.name} /></Field>
                <Field label="What points are called" hint='e.g. "points" or "Stitches"'><input className="txt" name="pointsName" defaultValue={program.pointsName} onInput={(e) => setPn(e.currentTarget.value || "points")} /></Field>
              </div>
              <Toggle name="active" checked={active} onChange={setActive} title={active ? "Program is live" : "Program is paused"} desc={active ? "Paid orders are earning points." : "No points are awarded while paused. Balances and redemptions are unaffected."} />
            </Card>

            <Card icon="🪡" title="Earning" sub="How fast members earn, and whether points wait out your return window first.">
              <div className="st-grid">
                <Field label="Earn rate" unit={`${pn} / $1`}><input name="pointsPerDollar" type="number" step="0.25" min="0.25" required defaultValue={program.pointsPerDollar} onInput={(e) => setRate(Number(e.currentTarget.value))} /></Field>
                <Field label="Hold period" unit="days" hint="0 = available instantly"><input name="holdDays" type="number" min="0" defaultValue={program.holdDays} /></Field>
                <Field label="Expire after" unit="months" hint="0 = never expire"><input name="expiryMonths" type="number" min="0" defaultValue={program.expiryMonths} /></Field>
              </div>
              <div className="st-chips">
                <Chip name="earnOnShipping" label="Earn on shipping" defaultChecked={program.earnOnShipping} />
                <Chip name="earnOnTax" label="Earn on tax" defaultChecked={program.earnOnTax} />
              </div>
            </Card>

            <Card icon="🏷️" title="Redeeming" sub="What a point is worth when spent, and how reward codes look.">
              <div className="st-grid">
                <Field label="Point value" unit="¢" hint={perDollar ? `${perDollar.toLocaleString()} ${pn} = $1` : ""}><input name="pointValueCents" type="number" step="0.25" min="0.01" required defaultValue={program.pointValueCents} onInput={(e) => setCents(Number(e.currentTarget.value))} /></Field>
                <Field label="Minimum to redeem" unit={pn}><input name="minRedeemPoints" type="number" min="0" defaultValue={program.minRedeemPoints} /></Field>
                <Field label="Code prefix" hint="Codes look like RW-7K2M9QX"><input className="txt" name="codePrefix" defaultValue={program.codePrefix} maxLength={6} style={{ textTransform: "uppercase" }} /></Field>
              </div>
            </Card>
          </div>

          <aside className="st-side">
            <div className="st-tagcard">
              <Ribbon>At a glance</Ribbon>
              <div className="st-big">{earned.toLocaleString()}<small>{pn}</small></div>
              <div className="st-cap">earned on a $100 order</div>
              <div className="st-worth">Worth <b>${back.toFixed(2)}</b> back</div>
              <div className="st-facts">
                <div><span>Return to customer</span><b>{earned > 0 ? back.toFixed(1) : "0"}%</b></div>
                <div><span>Status</span><b style={{ color: active ? "#c60d11" : "#666" }}>{active ? "Live" : "Paused"}</b></div>
                <div><span>Hold / expiry</span><b>{program.holdDays}d / {program.expiryMonths ? `${program.expiryMonths}mo` : "never"}</b></div>
              </div>
              <button className="st-save" type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
              <div className="st-note">Applies to new orders and redemptions from the moment you save.</div>
            </div>
          </aside>
        </div>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
