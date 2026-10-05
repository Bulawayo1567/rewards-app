import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { appUrlFor } from "./config.js";

export default async () => { render(<RewardsPage />, document.body); };

const REFERRALS_ENABLED = false;
const SUBTITLE = "Earn points on every order. Spend them on discounts whenever you like.";
const SHOW_FIRST = 9;

const EARN = {
  SIGNUP: { label: "Create an account", icon: "pin" },
  NEWSLETTER: { label: "Join our newsletter", icon: "needle" },
  BIRTHDAY: { label: "Celebrate your birthday", icon: "button" },
  REVIEW: { label: "Write a product review", icon: "spool" },
  REFERRAL_REFERRER: { label: "Refer a friend", icon: "needle" },
  REFERRAL_FRIEND: { label: "Get referred by a friend", icon: "needle" },
};
const RICON = { FIXED_AMOUNT: "tag", PERCENTAGE: "tag", FREE_SHIPPING: "scissors", FREE_PRODUCT: "spool" };
const TYPE_LABEL = { ORDER: "Order", ORDER_REVERSAL: "Refund", REDEEM: "Redeemed", REDEEM_REVERSAL: "Redemption reversed", BIRTHDAY: "Birthday", NEWSLETTER: "Newsletter", SIGNUP: "Welcome bonus", REVIEW: "Review", REFERRAL: "Referral", CAMPAIGN: "Prize", ADJUSTMENT: "Adjustment", EXPIRY: "Expired", MIGRATION: "Transferred balance" };
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const fmt = (n) => Number(n || 0).toLocaleString();
const money = (n) => "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (s) => new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const titleCase = (t) => String(t ?? "").replace(/\b([a-z])/g, (m) => m.toUpperCase());

let BASE = "", SHOP = "";
function shopFromToken(token) {
  const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  return String(payload.dest || "").replace(/^https?:\/\//, "");
}
async function api(path, body) {
  const token = await shopify.sessionToken.get();
  SHOP = shopFromToken(token); BASE = appUrlFor(SHOP);
  const r = await fetch(`${BASE}/proxy/account/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
const img = (kind, params = {}) => `${BASE}/img/${kind}?${new URLSearchParams(params)}`;
const Ribbon = ({ t }) => <s-image src={img("ribbon", { t })} alt={t} inlineSize="auto" />;
const Icon = ({ k }) => <s-image src={img("sicon", { k })} alt="" inlineSize="auto" accessibilityRole="presentation" />;
const Tape = ({ p }) => <s-image src={img("tape", { p: Math.round(p) })} alt={`${Math.round(p)}% progress`} inlineSize="fill" aspectRatio="12.5" />;

function RewardsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showActivity, setShowActivity] = useState(false);
  const load = () => api("me").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <s-page heading="Rewards"><s-banner tone="critical" heading="Rewards unavailable">{error}</s-banner></s-page>;
  if (!data) return <s-page heading="Rewards"><s-section><s-spinner accessibilityLabel="Loading rewards" /></s-section></s-page>;

  const { program, me, rewards, waysToEarn, offers } = data;
  const pn = program.pointsName;
  const worth = (me.balance * Number(program.pointValueCents || 0)) / 100;
  const storeUrl = `https://${SHOP}`;

  return (
    <s-stack gap="base">
      {/* 1. Header card */}
      <s-image src={img("banner", { t: program.name, s: SUBTITLE })} alt={program.name} inlineSize="fill" aspectRatio="5.45" borderRadius="large" />

      {/* 2. Balance card */}
      <s-section>
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-text emphasis="bold">Your balance</s-text>
          <s-button variant="tertiary" onClick={() => setShowActivity(!showActivity)}>{showActivity ? "Hide activity" : "View activity"}</s-button>
        </s-stack>
        <s-divider />
        <s-stack gap="small" alignItems="center">
          <s-image src={img("tag", { n: fmt(me.balance), u: pn })} alt={`${fmt(me.balance)} ${pn}`} inlineSize="auto" />
          {worth > 0 && <s-image src={img("worth", { t: money(worth) })} alt={`Worth ${money(worth)} in rewards`} inlineSize="auto" />}
          {me.pending > 0 && <s-text tone="subdued">{fmt(me.pending)} {pn} pending</s-text>}
          {me.tier && <s-image src={img("label", { t: `${me.tier.name}${me.tier.multiplier > 1 ? ` · ${me.tier.multiplier}× ${titleCase(pn)}` : ""}` })} alt={me.tier.name} inlineSize="auto" />}
          {me.nextTier ? (
            <s-stack gap="small" alignItems="center" inlineSize="fill">
              <Tape p={me.nextTier.progress} />
              <s-text tone="subdued">{me.nextTier.basis === "LIFETIME_POINTS" ? `${fmt(me.nextTier.needed)} more ${pn}` : `${money(me.nextTier.needed)} more in purchases`} to reach <s-text emphasis="bold">{me.nextTier.name}</s-text></s-text>
            </s-stack>
          ) : me.tier ? <s-text tone="subdued">You're at our top tier{me.tier.perks ? ` — ${me.tier.perks}` : ""}.</s-text> : null}
        </s-stack>
        {showActivity && <Activity me={me} pn={pn} />}
      </s-section>

      {/* 3. Spend points */}
      <s-section>
        <s-stack alignItems="center"><Ribbon t="Spend Points" /></s-stack>
        <Spend data={data} onDone={load} />
      </s-section>

      {/* 4. Earn points */}
      <s-section>
        <s-stack alignItems="center"><Ribbon t="Earn Points" /></s-stack>
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <EarnCard icon="thimble" title="Place an order" line={`${(program.pointsPerDollar * (me.tier ? me.tier.multiplier : 1)).toFixed(2).replace(/\.?0+$/, "")} ${pn} for every $1 spent`}
            action={<s-button variant="secondary" href={storeUrl}>Shop now</s-button>} />
          {waysToEarn.map((w) => {
            const meta = EARN[w.event] || { label: w.event, icon: "button" };
            const line = `${fmt(w.points)} ${pn}`;
            if (w.event === "BIRTHDAY") return <EarnCard key={w.event} icon={meta.icon} title={meta.label} line={line} action={<BirthdayAction me={me} onDone={load} />} />;
            if (w.event === "SIGNUP") return <EarnCard key={w.event} icon={meta.icon} title={meta.label} line={line} action={<s-badge tone={me.signupAwarded ? "success" : "neutral"}>{me.signupAwarded ? "Done" : "Earned on signup"}</s-badge>} />;
            if (w.event === "NEWSLETTER") return <EarnCard key={w.event} icon={meta.icon} title={meta.label} line={line} action={<s-badge tone={me.newsletterAwarded ? "success" : "neutral"}>{me.newsletterAwarded ? "Done" : "Subscribe at checkout"}</s-badge>} />;
            return <EarnCard key={w.event} icon={meta.icon} title={meta.label} line={line} />;
          })}
        </s-grid>
        {offers.length > 0 && (
          <s-box padding="base" borderRadius="base" background="subdued">
            <s-stack gap="small">
              <s-text emphasis="bold">Bonus offers right now</s-text>
              {offers.map((o, i) => <s-text key={i}>{titleCase(o.label)} — <s-text emphasis="bold">{o.mode === "MULTIPLIER" ? `${o.value}× ${pn}` : `+${fmt(o.value)} ${pn} each`}</s-text>{o.endsAt ? ` until ${date(o.endsAt)}` : ""}</s-text>)}
            </s-stack>
          </s-box>
        )}
      </s-section>

      {/* 5. Referrals (hidden until built) */}
      {REFERRALS_ENABLED && (
        <s-section><s-stack alignItems="center"><Ribbon t="Refer A Friend" /></s-stack><s-text tone="subdued">Coming soon.</s-text></s-section>
      )}
    </s-stack>
  );
}

function EarnCard({ icon, title, line, action }) {
  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
        <s-stack direction="inline" gap="small" alignItems="center">
          <Icon k={icon} />
          <s-stack gap="none"><s-text emphasis="bold">{title}</s-text><s-text tone="subdued">{line}</s-text></s-stack>
        </s-stack>
        {action}
      </s-stack>
    </s-box>
  );
}

function Spend({ data, onDone }) {
  const { program, me, rewards } = data;
  const pn = program.pointsName;
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const list = all ? rewards : rewards.slice(0, SHOW_FIRST);
  const redeem = async (r) => {
    setBusy(r.id); setMsg(null);
    try { const j = await api("redeem", { rewardId: r.id }); setMsg({ ok: true, code: j.code, expiresAt: j.expiresAt, name: r.name }); onDone(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };
  if (rewards.length === 0) return <s-text tone="subdued">No rewards available right now.</s-text>;
  return (
    <s-stack gap="base">
      {msg && (msg.ok
        ? <s-banner tone="success" heading={`${titleCase(msg.name)} — Your Code Is Ready`}>
            <s-stack direction="inline" gap="base" alignItems="center"><s-text emphasis="bold">{msg.code}</s-text><s-clipboard-item text={msg.code}><s-button variant="secondary">Copy</s-button></s-clipboard-item></s-stack>
            <s-text tone="subdued">Enter it at checkout. Valid until {date(msg.expiresAt)}.</s-text>
          </s-banner>
        : <s-banner tone="critical" heading="Couldn't redeem">{msg.text}</s-banner>)}
      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
        {list.map((r) => {
          const locked = r.minTierRank != null && (me.tier ? me.tier.rank : -1) < r.minTierRank;
          const can = !locked && me.balance >= r.pointsCost && me.balance >= program.minRedeemPoints;
          const pct = Math.min(100, (me.balance / Math.max(1, r.pointsCost)) * 100);
          return (
            <s-box key={r.id} padding="base" border="base" borderRadius="base">
              <s-stack gap="small">
                <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <Icon k={RICON[r.type] || "tag"} />
                    <s-stack gap="none"><s-text emphasis="bold">{titleCase(r.name)}</s-text><s-text tone="subdued">{fmt(r.pointsCost)} {pn}{r.minOrderSubtotal ? ` · min order ${money(r.minOrderSubtotal)}` : ""}</s-text></s-stack>
                  </s-stack>
                  {can && <s-button variant="primary" loading={busy === r.id} disabled={busy === r.id} onClick={() => redeem(r)}>Redeem</s-button>}
                </s-stack>
                {!can && (
                  <s-stack gap="none">
                    <Tape p={locked ? 0 : pct} />
                    <s-text tone="subdued">{locked ? "Higher tier required" : `${fmt(me.balance)} of ${fmt(r.pointsCost)} ${pn}`}</s-text>
                  </s-stack>
                )}
              </s-stack>
            </s-box>
          );
        })}
      </s-grid>
      {rewards.length > SHOW_FIRST && !all && <s-stack alignItems="center"><s-button variant="secondary" onClick={() => setAll(true)}>Show more</s-button></s-stack>}
      {me.codes.length > 0 && (
        <s-box padding="base" borderRadius="base" background="subdued">
          <s-stack gap="small">
            <s-text emphasis="bold">In Your Sewing Basket</s-text>
            {me.codes.map((c) => (
              <s-stack key={c.code} direction="inline" justifyContent="space-between" alignItems="center" gap="base">
                <s-stack gap="none"><s-text emphasis="bold">{c.code}</s-text><s-text tone="subdued">{titleCase(c.name)} · {c.status === "USED" ? "used" : `expires ${date(c.expiresAt)}`}</s-text></s-stack>
                {c.status !== "USED" && <s-clipboard-item text={c.code}><s-button variant="secondary">Copy</s-button></s-clipboard-item>}
              </s-stack>
            ))}
          </s-stack>
        </s-box>
      )}
    </s-stack>
  );
}

function BirthdayAction({ me, onDone }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState("1");
  const [day, setDay] = useState("1");
  const [msg, setMsg] = useState(null);
  if (me.birthday) return <s-badge tone="success">{MONTHS[me.birthday.month - 1].slice(0, 3)} {me.birthday.day}</s-badge>;
  if (!open) return <s-button variant="secondary" onClick={() => setOpen(true)}>Add birthday</s-button>;
  const save = async () => {
    try { const j = await api("birthday", { month, day }); setMsg(j.awarded ? "Happy birthday — points added!" : "Saved!"); onDone(); }
    catch (e) { setMsg(e.message); }
  };
  return (
    <s-stack gap="small">
      <s-stack direction="inline" gap="small" alignItems="end">
        <s-select label="Month" value={month} onChange={(e) => setMonth(e.currentTarget.value)}>{MONTHS.map((m, i) => <s-option key={i} value={String(i + 1)}>{m.slice(0, 3)}</s-option>)}</s-select>
        <s-select label="Day" value={day} onChange={(e) => setDay(e.currentTarget.value)}>{Array.from({ length: 31 }, (_, i) => <s-option key={i} value={String(i + 1)}>{i + 1}</s-option>)}</s-select>
        <s-button variant="primary" onClick={save}>Save</s-button>
      </s-stack>
      {msg && <s-text tone="subdued">{msg}</s-text>}
    </s-stack>
  );
}

function Activity({ me, pn }) {
  if (!me.history || me.history.length === 0) return <s-text tone="subdued">No activity yet.</s-text>;
  return (
    <s-stack gap="small">
      <s-divider />
      {me.history.map((h) => (
        <s-stack key={h.id} direction="inline" justifyContent="space-between" gap="base">
          <s-stack gap="none"><s-text emphasis="bold">{TYPE_LABEL[h.type] || h.type}{h.orderName ? ` ${h.orderName}` : ""}</s-text><s-text tone="subdued">{date(h.createdAt)}{h.status === "PENDING" ? " · pending" : ""}{h.note && h.type !== "ORDER" ? ` · ${h.note}` : ""}</s-text></s-stack>
          <s-text emphasis="bold" tone={h.points < 0 ? "critical" : "success"}>{h.points > 0 ? "+" : ""}{fmt(h.points)}</s-text>
        </s-stack>
      ))}
      <s-text tone="subdued">Lifetime: {fmt(me.lifetimePoints)} {pn} earned</s-text>
    </s-stack>
  );
}
