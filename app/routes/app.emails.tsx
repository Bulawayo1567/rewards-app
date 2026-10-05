import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useActionToast } from "../lib/rewards/use-toast";
import { fmtDate, fmtInt, str, bool } from "../lib/rewards/format";
import { TEMPLATES, type TemplateKey, audienceFor, buildCtx, renderTemplate, fill, sendTemplateTo, sendEmail } from "../lib/rewards/email.server";
import { Hero, UIStyles, Tabs, EARN_TABS, Card, Field, Toggle, Empty, Pill } from "../lib/rewards/ui";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const sel = (url.searchParams.get("t") as TemplateKey | null) ?? null;
  const [autos, consented, recentLogs] = await Promise.all([
    prisma.emailAutomation.findMany({ where: { shop }, orderBy: { updatedAt: "desc" } }),
    prisma.customer.count({ where: { shop, marketingConsent: true, spam: { notIn: ["spam", "suspicious"] } } }),
    prisma.emailLog.findMany({ where: { shop }, orderBy: { sentAt: "desc" }, take: 15, include: { customer: { select: { email: true, id: true } } } }),
  ]);
  const configured = !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  let preview: { html: string; subject: string; count: number } | null = null;
  if (sel && TEMPLATES[sel]) {
    const a = autos.find((x) => x.template === sel);
    const sample = await prisma.customer.findFirst({ where: { shop, spam: { notIn: ["spam"] } }, orderBy: { balance: "desc" } });
    const aud = TEMPLATES[sel].cadence === "event" ? { count: 0 } : await audienceFor(shop, sel, 1);
    if (sample) {
      const ctx = await buildCtx(shop, sample.id, { expiring: "250", expiresOn: "November 30", perks: "free shipping over $99", multiplier: "1.25" });
      preview = { html: renderTemplate(sel, ctx, a?.intro ?? null), subject: fill(a?.subject ?? TEMPLATES[sel].defaultSubject, ctx), count: aud.count };
    }
  }
  return {
    sel, configured, consented,
    templates: Object.entries(TEMPLATES).map(([k, v]) => ({ key: k, ...v })),
    autos: autos.map((a) => ({ ...a, lastRunAt: a.lastRunAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })),
    preview,
    recent: recentLogs.map((l) => ({ id: l.id, email: l.customer.email, customerId: l.customer.id, template: l.template, subject: l.subject, sentAt: l.sentAt.toISOString() })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = str(fd, "intent");
  const key = str(fd, "template") as TemplateKey;
  if (!TEMPLATES[key]) return { error: "Unknown template" };

  if (intent === "save") {
    const data = { subject: str(fd, "subject") || TEMPLATES[key].defaultSubject, intro: str(fd, "intro") || null, enabled: bool(fd, "enabled"), cadence: TEMPLATES[key].cadence };
    await prisma.emailAutomation.upsert({ where: { shop_template: { shop, template: key } }, update: data, create: { shop, template: key, ...data } });
    return { ok: true, message: data.enabled ? `${TEMPLATES[key].name} is on` : "Saved (off)" };
  }
  if (intent === "test") {
    const to = str(fd, "to") || session.email || "";
    if (!to) return { error: "Enter an address for the test" };
    const a = await prisma.emailAutomation.findUnique({ where: { shop_template: { shop, template: key } } });
    const sample = await prisma.customer.findFirst({ where: { shop, spam: { notIn: ["spam"] } }, orderBy: { balance: "desc" } });
    if (!sample) return { error: "No members to build a sample from yet" };
    try {
      const ctx = await buildCtx(shop, sample.id, { expiring: "250", expiresOn: "November 30", perks: "free shipping over $99", multiplier: "1.25" });
      await sendEmail(to, "[TEST] " + fill(a?.subject ?? TEMPLATES[key].defaultSubject, ctx), renderTemplate(key, ctx, a?.intro ?? null));
      return { ok: true, message: `Test sent to ${to}` };
    } catch (e) { return { error: (e as Error).message }; }
  }
  if (intent === "send-now") {
    const a = await prisma.emailAutomation.findUnique({ where: { shop_template: { shop, template: key } } });
    if (!a) return { error: "Save the automation first" };
    const { rows } = await audienceFor(shop, key, 1000);
    let n = 0, failed = 0;
    for (const r of rows) { try { await sendTemplateTo(shop, key, r.id, a.subject, a.intro); n++; } catch { failed++; } }
    await prisma.emailAutomation.update({ where: { id: a.id }, data: { lastRunAt: new Date() } });
    return { ok: true, message: `Sent to ${fmtInt(n)} members${failed ? ` · ${failed} failed` : ""}` };
  }
  if (intent === "delete") { await prisma.emailAutomation.deleteMany({ where: { shop, template: key } }); return { ok: true, message: "Automation removed" }; }
  return { error: "Unknown action" };
};

export default function Emails() {
  const { sel, configured, consented, templates, autos, preview, recent } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  useActionToast();
  const t = sel ? templates.find((x) => x.key === sel) : null;
  const a = sel ? autos.find((x) => x.template === sel) : null;
  const [enabled, setEnabled] = useState(a?.enabled ?? false);
  const [testTo, setTestTo] = useState("");

  return (
    <s-page inlineSize="large">
      <UIStyles />
      <Hero title="Earn & Redeem" sub={<>Rewards emails · {fmtInt(consented)} subscribed members · {autos.filter((x) => x.enabled).length} automations on</>} />
      <Tabs items={EARN_TABS} active="emails" />
      {!configured && <s-banner tone="warning" heading="Sending isn't set up yet">Add RESEND_API_KEY and EMAIL_FROM in Vercel (Settings → Environment Variables) and redeploy. You can still design and preview emails.</s-banner>}
      {result && "error" in result && result.error && <s-banner tone="critical" heading="Problem">{result.error}</s-banner>}

      <Card icon="✉️" title="Choose an email" sub="Pick a template to set it up. Only subscribed, non-suspicious members are ever emailed; every message carries an unsubscribe link.">
        <Form method="get" className="st-form">
          <div className="st-grid two">
            <Field label="Template"><select name="t" defaultValue={sel ?? ""} onChange={(e) => (e.target.form as HTMLFormElement).requestSubmit()}>
              <option value="">— choose —</option>
              {templates.map((x) => <option key={x.key} value={x.key}>{x.name}{autos.find((y) => y.template === x.key)?.enabled ? " · ON" : ""}</option>)}
            </select></Field>
            {t && <div className="fld"><label>Audience</label><div className="hint" style={{ fontSize: 13, color: "#333", marginTop: 10 }}>{t.audience}{t.cadence !== "event" ? ` · ${preview ? fmtInt(preview.count) : "…"} would receive it now` : ""} · {t.cadence === "event" ? "sent automatically on the event" : t.cadence === "once" ? "each member gets it once" : `repeats ${t.cadence}`}</div></div>}
          </div>
        </Form>
      </Card>

      {t && (
        <div className="st-wrap">
          <div>
            <Card icon="✏️" title={t.name} sub={t.desc}>
              {t.consentNote && <div className="st-empty" style={{ textAlign: "left", marginBottom: 14, background: "#fff4d6", borderColor: "#e8c76a", color: "#7a5600" }}>{t.consentNote}</div>}
              <Form method="post" className="st-form" key={t.key}>
                <input type="hidden" name="intent" value="save" /><input type="hidden" name="template" value={t.key} />
                <Field label="Subject" hint="Placeholders: {name} {program} {points} {balance} {worth} {tier} {next}"><input className="txt" name="subject" defaultValue={a?.subject ?? t.defaultSubject} /></Field>
                <div style={{ marginTop: 12 }}><Field label="Opening paragraph (optional)" hint="Shown before the standard copy. Same placeholders work."><textarea name="intro" defaultValue={a?.intro ?? ""} placeholder="A personal line from the shop…" /></Field></div>
                <Toggle name="enabled" checked={enabled} onChange={setEnabled} title={enabled ? "Automation is on" : "Automation is off"} desc={t.cadence === "event" ? "Sends automatically when the event happens." : t.cadence === "once" ? "Runs daily; each eligible member gets it once." : `Runs daily; each member gets it at most ${t.cadence}.`} />
                <div className="st-foot" style={{ marginTop: 14 }}>
                  <button className="st-btn primary" type="submit">Save</button>
                  {a && <Form method="post" onSubmit={(e) => { if (!confirm("Remove this automation?")) e.preventDefault(); }}><input type="hidden" name="intent" value="delete" /><input type="hidden" name="template" value={t.key} /><button className="st-btn ghost" type="submit">Remove</button></Form>}
                </div>
              </Form>
            </Card>

            <Card icon="🧪" title="Test & send" sub="Test uses your top member as the sample data.">
              <Form method="post" className="st-form">
                <input type="hidden" name="intent" value="test" /><input type="hidden" name="template" value={t.key} />
                <div className="st-grid two">
                  <Field label="Send a test to"><input className="txt" name="to" type="email" placeholder="you@allaboutsewing.ca" value={testTo} onInput={(e) => setTestTo(e.currentTarget.value)} /></Field>
                  <div className="fld"><label>&nbsp;</label><button className="st-btn secondary" type="submit" disabled={!configured} style={{ width: "100%" }}>Send test</button></div>
                </div>
              </Form>
              {t.cadence !== "event" && a && (
                <Form method="post" onSubmit={(e) => { if (!confirm(`Send "${t.name}" to ${preview ? fmtInt(preview.count) : "the eligible"} members now?\n\nThis is the same send the daily run would do, just immediately.`)) e.preventDefault(); }}>
                  <input type="hidden" name="intent" value="send-now" /><input type="hidden" name="template" value={t.key} />
                  <div className="st-foot" style={{ marginTop: 10 }}><button className="st-btn primary" type="submit" disabled={!configured || !preview || preview.count === 0}>Send now to {preview ? fmtInt(preview.count) : "…"} members</button><span className="aas-muted">Preview the count on the right before sending.</span></div>
                </Form>
              )}
            </Card>
          </div>
          <aside className="st-side">
            {preview ? (
              <div className="st-preview">
                <div style={{ padding: "10px 14px", fontSize: 12, color: "#666", background: "#fff", borderBottom: "2px dashed #e3d9cc" }}><b style={{ color: "#1f1f1f" }}>Subject:</b> {preview.subject}</div>
                <iframe title="Email preview" srcDoc={preview.html} />
              </div>
            ) : <Empty>Add a member first to preview.</Empty>}
          </aside>
        </div>
      )}

      <Card icon="🧵" title="Automations" sub={autos.length ? `${autos.filter((x) => x.enabled).length} on · ${autos.length} set up` : "none set up yet"}>
        {autos.length === 0 ? <Empty>Choose a template above to set up your first automation.</Empty> : (
          <div className="st-list">
            {autos.map((x) => { const tt = TEMPLATES[x.template as TemplateKey]; return (
              <div key={x.id} className={`st-auto${x.enabled ? " on" : ""}`}>
                <div className="ic" style={{ width: 40, height: 40, borderRadius: "50%", background: x.enabled ? "#c60d11" : "#eee", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16 }}>✉</div>
                <div>
                  <div className="ttl"><a href={`/app/emails?t=${x.template}`} style={{ color: "inherit", fontWeight: 800, textDecoration: "none" }}>{tt?.name ?? x.template}</a> {x.enabled ? <Pill>on</Pill> : <Pill tone="warn">off</Pill>}</div>
                  <div className="meta"><span>{tt?.audience}</span><span>·</span><span>{x.cadence}</span><span>·</span><b>{fmtInt(x.sentCount)} sent</b><span>·</span><span>last run {x.lastRunAt ? fmtDate(x.lastRunAt) : "never"}</span></div>
                </div>
                <div className="acts"><a className="st-btn secondary sm" href={`/app/emails?t=${x.template}`}>Edit</a></div>
              </div>
            ); })}
          </div>
        )}
      </Card>

      {recent.length > 0 && (
        <Card icon="📋" title="Recently sent" sub={`last ${recent.length}`}>
          <div className="aas-tblwrap"><table className="aas-tbl"><thead><tr><th>When</th><th>To</th><th>Email</th><th>Subject</th></tr></thead><tbody>
            {recent.map((l) => <tr key={l.id}><td className="dim" style={{ whiteSpace: "nowrap" }}>{fmtDate(l.sentAt)}</td><td><s-link href={`/app/customers/${l.customerId}`}>{l.email}</s-link></td><td>{TEMPLATES[l.template as TemplateKey]?.name ?? l.template}</td><td className="dim">{l.subject}</td></tr>)}
          </tbody></table></div>
        </Card>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
