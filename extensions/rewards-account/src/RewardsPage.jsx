import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { APP_URL } from "./config.js";

export default async () => { render(<RewardsPage />, document.body); };

const EARN_LABEL = { SIGNUP: "Create an account", NEWSLETTER: "Join our newsletter", BIRTHDAY: "Celebrate your birthday", REVIEW: "Write a product review", REFERRAL_REFERRER: "Refer a friend", REFERRAL_FRIEND: "Get referred by a friend" };
const TYPE_LABEL = { ORDER: "Order", ORDER_REVERSAL: "Refund", REDEEM: "Redeemed", REDEEM_REVERSAL: "Redemption reversed", BIRTHDAY: "Birthday", NEWSLETTER: "Newsletter", SIGNUP: "Welcome bonus", REVIEW: "Review", REFERRAL: "Referral", CAMPAIGN: "Prize", ADJUSTMENT: "Adjustment", EXPIRY: "Expired", MIGRATION: "Transferred balance" };
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmt = (n) => Number(n || 0).toLocaleString();
const money = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const date = (s) => new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

async function api(path, body) {
  const token = await shopify.sessionToken.get();
  const r = await fetch(`${APP_URL}/proxy/account/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

function RewardsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("rewards");
  const load = () => api("me").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <s-page heading="Rewards"><s-banner tone="critical" heading="Rewards unavailable">{error}</s-banner></s-page>;
  if (!data) return <s-page heading="Rewards"><s-section><s-spinner accessibilityLabel="Loading rewards" /></s-section></s-page>;

  const { program, me, rewards, waysToEarn, offers } = data;
  const pn = program.pointsName;
  const tabs = [["rewards", "Redeem"], ["offers", "Bonus offers"], ["earn", "Ways to earn"], ["codes", "My codes"], ["history", "History"]];

  return (
    <s-page heading={program.name}>
      <s-section>
        <s-stack direction="inline" gap="base" justifyContent="space-between" alignItems="center">
          <s-stack gap="none">
            <s-text>{me.firstName ? `Hi ${me.firstName}, you have` : "You have"}</s-text>
            <s-heading>{fmt(me.balance)} {pn}</s-heading>
            {me.pending > 0 && <s-text tone="subdued">{fmt(me.pending)} pending</s-text>}
          </s-stack>
          {me.tier && <s-badge tone="info">{me.tier.name}{me.tier.multiplier > 1 ? ` · ${me.tier.multiplier}× ${pn}` : ""}</s-badge>}
        </s-stack>
        {me.nextTier ? (
          <s-stack gap="small">
            <s-progress value={me.nextTier.progress} max={100} accessibilityLabel="Progress to next tier" />
            <s-text tone="subdued">{me.nextTier.basis === "LIFETIME_POINTS" ? `${fmt(me.nextTier.needed)} more ${pn}` : `${money(me.nextTier.needed)} more in purchases`} to reach <s-text emphasis="bold">{me.nextTier.name}</s-text></s-text>
          </s-stack>
        ) : me.tier ? <s-text tone="subdued">You're at our top tier.</s-text> : null}
        {me.tier?.perks && <s-text>{me.tier.perks}</s-text>}
      </s-section>

      <s-section>
        <s-button-group>
          {tabs.map(([k, label]) => <s-button key={k} variant={tab === k ? "primary" : "secondary"} onClick={() => setTab(k)}>{label}</s-button>)}
        </s-button-group>
      </s-section>

      {tab === "rewards" && <RedeemTab data={data} onDone={load} />}
      {tab === "offers" && (
        <s-section heading="Bonus point offers">
          {offers.length === 0 ? <s-text tone="subdued">No bonus offers right now — check back soon.</s-text> :
            <s-stack gap="base">{offers.map((o, i) => (
              <s-box key={i} padding="base" border="base" borderRadius="base">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
                  <s-stack gap="none"><s-text emphasis="bold">{o.label}</s-text><s-text tone="subdued">{o.target === "VENDOR" ? "Brand" : o.target === "COLLECTION" ? "Collection" : o.target === "TAG" ? "Tagged products" : o.target === "PRODUCT_TYPE" ? "Product type" : "Product"}{o.endsAt ? ` · until ${date(o.endsAt)}` : ""}</s-text></s-stack>
                  <s-badge tone="success">{o.mode === "MULTIPLIER" ? `${o.value}× ${pn}` : `+${fmt(o.value)} ${pn} each`}</s-badge>
                </s-stack>
              </s-box>))}</s-stack>}
          <s-text tone="subdued">Base rate: {program.pointsPerDollar} {pn} per $1{me.tier && me.tier.multiplier > 1 ? `, ×${me.tier.multiplier} for ${me.tier.name}` : ""}.</s-text>
        </s-section>
      )}
      {tab === "earn" && (
        <s-section heading="Ways to earn">
          <s-stack gap="base">
            <Row left={`Shop — every $1 spent`} right={`${program.pointsPerDollar} ${pn}`} />
            {waysToEarn.map((w) => <Row key={w.event} left={EARN_LABEL[w.event] || w.event} right={`${fmt(w.points)} ${pn}`} />)}
          </s-stack>
          {waysToEarn.some((w) => w.event === "BIRTHDAY") && <BirthdayBox me={me} pn={pn} onDone={load} />}
        </s-section>
      )}
      {tab === "codes" && (
        <s-section heading="My codes">
          {me.codes.length === 0 ? <s-text tone="subdued">Redeem a reward to get a discount code.</s-text> :
            <s-stack gap="base">{me.codes.map((c) => (
              <s-box key={c.code} padding="base" border="base" borderRadius="base">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
                  <s-stack gap="none"><s-text emphasis="bold">{c.code}</s-text><s-text tone="subdued">{c.name} · {c.status === "USED" ? "used" : `expires ${date(c.expiresAt)}`}</s-text></s-stack>
                  {c.status !== "USED" && <s-clipboard-item text={c.code}><s-button variant="secondary">Copy</s-button></s-clipboard-item>}
                </s-stack>
              </s-box>))}</s-stack>}
        </s-section>
      )}
      {tab === "history" && (
        <s-section heading="History">
          {me.history.length === 0 ? <s-text tone="subdued">No activity yet.</s-text> :
            <s-stack gap="small">{me.history.map((h) => (
              <s-box key={h.id} padding="small" border="base" borderRadius="base">
                <s-stack direction="inline" justifyContent="space-between" gap="base">
                  <s-stack gap="none"><s-text emphasis="bold">{TYPE_LABEL[h.type] || h.type}{h.orderName ? ` ${h.orderName}` : ""}</s-text><s-text tone="subdued">{date(h.createdAt)}{h.status === "PENDING" ? " · pending" : ""}{h.note && h.type !== "ORDER" ? ` · ${h.note}` : ""}</s-text></s-stack>
                  <s-text emphasis="bold" tone={h.points < 0 ? "critical" : "success"}>{h.points > 0 ? "+" : ""}{fmt(h.points)}</s-text>
                </s-stack>
              </s-box>))}</s-stack>}
          <s-text tone="subdued">Lifetime: {fmt(me.lifetimePoints)} {pn} earned · {money(me.lifetimeSpend)} spent</s-text>
        </s-section>
      )}
    </s-page>
  );
}

function Row({ left, right }) {
  return <s-stack direction="inline" justifyContent="space-between" gap="base"><s-text>{left}</s-text><s-text emphasis="bold">{right}</s-text></s-stack>;
}

function RedeemTab({ data, onDone }) {
  const { program, me, rewards } = data;
  const pn = program.pointsName;
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const redeem = async (r) => {
    setBusy(r.id); setMsg(null);
    try { const j = await api("redeem", { rewardId: r.id }); setMsg({ ok: true, code: j.code, expiresAt: j.expiresAt, name: r.name }); onDone(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };
  return (
    <s-section heading={`Redeem ${pn}`}>
      {msg && (msg.ok
        ? <s-banner tone="success" heading={`${msg.name} — your code is ready`}>
            <s-stack direction="inline" gap="base" alignItems="center"><s-text emphasis="bold">{msg.code}</s-text><s-clipboard-item text={msg.code}><s-button variant="secondary">Copy</s-button></s-clipboard-item></s-stack>
            <s-text tone="subdued">Enter it at checkout. Valid until {date(msg.expiresAt)}.</s-text>
          </s-banner>
        : <s-banner tone="critical" heading="Couldn't redeem">{msg.text}</s-banner>)}
      {rewards.length === 0 ? <s-text tone="subdued">No rewards available right now.</s-text> :
        <s-grid gridTemplateColumns="repeat(auto-fill, minmax(220px, 1fr))" gap="base">
          {rewards.map((r) => {
            const locked = r.minTierRank != null && (me.tier ? me.tier.rank : -1) < r.minTierRank;
            const can = !locked && me.balance >= r.pointsCost && me.balance >= program.minRedeemPoints;
            return (
              <s-box key={r.id} padding="base" border="base" borderRadius="base">
                <s-stack gap="small">
                  <s-text emphasis="bold">{r.name}</s-text>
                  <s-text tone="subdued">{fmt(r.pointsCost)} {pn}{r.minOrderSubtotal ? ` · min order ${money(r.minOrderSubtotal)}` : ""}{locked ? " · higher tier required" : ""}</s-text>
                  <s-button variant="primary" disabled={!can || busy === r.id} loading={busy === r.id} onClick={() => redeem(r)}>{can ? "Redeem" : locked ? "Locked" : `Need ${fmt(r.pointsCost - me.balance)} more`}</s-button>
                </s-stack>
              </s-box>);
          })}
        </s-grid>}
    </s-section>
  );
}

function BirthdayBox({ me, pn, onDone }) {
  const [month, setMonth] = useState("1");
  const [day, setDay] = useState("1");
  const [msg, setMsg] = useState(null);
  if (me.birthday) return <s-box padding="base" border="base" borderRadius="base"><s-text>Birthday on file: <s-text emphasis="bold">{MONTHS[me.birthday.month - 1]} {me.birthday.day}</s-text> — we'll add {pn} on the day.</s-text></s-box>;
  const save = async () => {
    try { const j = await api("birthday", { month, day }); setMsg({ ok: true, text: j.awarded ? "Happy birthday — points added!" : "Saved! We'll add points on your birthday." }); onDone(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack gap="base">
        <s-text emphasis="bold">Tell us your birthday</s-text>
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-select label="Month" value={month} onChange={(e) => setMonth(e.currentTarget.value)}>{MONTHS.map((m, i) => <s-option key={i} value={String(i + 1)}>{m}</s-option>)}</s-select>
          <s-select label="Day" value={day} onChange={(e) => setDay(e.currentTarget.value)}>{Array.from({ length: 31 }, (_, i) => <s-option key={i} value={String(i + 1)}>{i + 1}</s-option>)}</s-select>
          <s-button variant="secondary" onClick={save}>Save</s-button>
        </s-stack>
        {msg && <s-banner tone={msg.ok ? "success" : "critical"}>{msg.text}</s-banner>}
      </s-stack>
    </s-box>
  );
}
