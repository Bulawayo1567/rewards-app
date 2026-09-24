(function () {
  const cfg = (window.AASRewards && window.AASRewards.config) || {};
  const root = (cfg.root || "/").replace(/\/?$/, "/");
  const api = (p) => root + "apps/rewards/" + p;
  const fmt = (n) => Number(n || 0).toLocaleString();
  const money = (n) => "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const titleCase = (t) => String(t ?? "").replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const EARN_LABEL = { SIGNUP: "Create an account", NEWSLETTER: "Join our newsletter", BIRTHDAY: "Celebrate your birthday", REVIEW: "Write a product review", REFERRAL_REFERRER: "Refer a friend", REFERRAL_FRIEND: "Get referred by a friend" };
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const SPOOL = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="3" rx="1.2" fill="#fff"/><rect x="4" y="18" width="16" height="3" rx="1.2" fill="#fff"/><rect x="7" y="6" width="10" height="12" fill="rgba(255,255,255,.35)"/><path d="M7 8h10M7 10.5h10M7 13h10M7 15.5h10" stroke="#fff" stroke-width="1.2"/></svg>`;
  const PIN = `<svg class="aas-rw-pin" viewBox="0 0 26 70" aria-hidden="true"><circle cx="13" cy="10" r="9" fill="#c60d11"/><circle cx="10" cy="7" r="3" fill="rgba(255,255,255,.55)"/><rect x="11.5" y="18" width="3" height="52" rx="1.5" fill="#9a9a9a"/><path d="M11.5 66 L13 70 L14.5 66Z" fill="#666"/></svg>`;
  const PINS = PIN + PIN.replace('class="aas-rw-pin"', 'class="aas-rw-pin two"');
  const ribbon = (t) => `<h4><span>${esc(t)}<i></i></span></h4>`;

  let state = null;
  async function load() {
    if (state) return state;
    const r = await fetch(api("me"), { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("rewards api " + r.status);
    state = await r.json();
    return state;
  }

  function render(el, opts = {}) {
    el.style.setProperty("--acc", cfg.color || "#c60d11");
    el.innerHTML = '<div class="aas-rw-loading">Loading your rewards…</div>';
    load().then((d) => {
      const pn = d.program.pointsName;
      const closeBtn = opts.closable ? '<button class="aas-rw-close" aria-label="Close">×</button>' : "";
      const earnList = (rows) => `<ul class="aas-rw-earn">${rows.map((r) => `<li><span>${esc(r[0])}</span><b>${esc(r[1])}</b></li>`).join("")}</ul>`;

      if (!d.loggedIn) {
        el.innerHTML = `<div class="aas-rw-head">${closeBtn}${PINS}
            <p class="aas-rw-hi">Welcome To The Sewing Circle</p>
            <div class="aas-rw-lead">Earn <b>${d.program.pointsPerDollar} ${esc(pn)}</b> for every $1 you spend, plus bonuses. Redeem for discounts on future orders.</div></div>
          <div class="aas-rw-body">
            ${d.waysToEarn.length ? `<div class="aas-rw-section">${ribbon("Thread Your Way To Points")}${earnList(d.waysToEarn.map((w) => [EARN_LABEL[w.event] || w.event, `${fmt(w.points)} ${pn}`]))}</div>` : ""}
            <div class="aas-rw-section"><div class="aas-rw-row"><a class="aas-rw-btn auto" href="${cfg.registerUrl}">Join Free</a><a class="aas-rw-btn ghost auto" href="${cfg.loginUrl}">Sign In</a></div></div>
          </div>`;
        bindClose(el, opts);
        return;
      }

      const m = d.me, tier = m.tier, next = m.nextTier;
      const worth = (m.balance * Number(d.program.pointValueCents || 0)) / 100;
      const progress = next ? (typeof next.progress === "number" ? next.progress : 0) : 100;

      el.innerHTML = `<div class="aas-rw-head">${closeBtn}${PINS}
          <p class="aas-rw-hi">${esc(m.firstName ? `Hi, ${m.firstName}!` : "Your Rewards")}</p>
          <div class="aas-rw-tagwrap"><div class="aas-rw-tag"><span class="n">${fmt(m.balance)}</span><span class="u">${esc(pn)}</span></div></div>
          ${worth > 0 ? `<div class="aas-rw-worth">Worth <b>${money(worth)}</b> in rewards${m.pending ? ` · ${fmt(m.pending)} pending` : ""}</div>` : m.pending ? `<div class="aas-rw-worth">${fmt(m.pending)} pending</div>` : ""}
          ${tier ? `<div><span class="aas-rw-tier">${esc(tier.name)}${tier.multiplier > 1 ? ` · ${tier.multiplier}× ${esc(pn)}` : ""}</span></div>` : ""}
          ${next ? `<div class="aas-rw-tape"><div class="fill" style="width:${progress}%"></div><div class="ticks"></div></div>
                   <div class="aas-rw-sub">${next.basis === "LIFETIME_POINTS" ? `${fmt(next.needed)} more ${esc(pn)}` : `$${fmt(Math.ceil(next.needed))} more`} to reach <b>${esc(next.name)}</b>${tier && tier.perks ? ` · ${esc(tier.perks)}` : ""}</div>`
                 : tier ? `<div class="aas-rw-sub">You're at our top tier${tier.perks ? ` — ${esc(tier.perks)}` : ""}</div>` : ""}
        </div>
        <div class="aas-rw-body">
          <div class="aas-rw-section">${ribbon("Stitch Up Some Savings")}
            <div class="aas-rw-grid">${d.rewards.map((r) => {
              const locked = r.minTierRank != null && (tier ? tier.rank : -1) < r.minTierRank;
              const can = !locked && m.balance >= r.pointsCost && m.balance >= d.program.minRedeemPoints;
              const label = can ? "Redeem" : locked ? "Higher Tier" : `Need ${fmt(r.pointsCost - m.balance)} More`;
              return `<div class="aas-rw-card ${can ? "can" : ""}"><b>${esc(titleCase(r.name))}</b><small>${fmt(r.pointsCost)} ${esc(pn)}${r.minOrderSubtotal ? ` · min order $${r.minOrderSubtotal}` : ""}</small>
                <button class="aas-rw-btn" data-redeem="${r.id}" ${can ? "" : "disabled"}>${label}</button></div>`;
            }).join("") || '<div class="aas-rw-small">No rewards available right now.</div>'}</div>
            <div class="aas-rw-out"></div>
          </div>
          ${m.codes.length ? `<div class="aas-rw-section">${ribbon("In Your Sewing Basket")}${m.codes.map((c) => `<div class="aas-rw-row" style="margin-bottom:8px"><span class="aas-rw-code">${esc(c.code)}</span><small class="aas-rw-small">${esc(titleCase(c.name))} · ${c.status === "USED" ? "used" : "expires " + new Date(c.expiresAt).toLocaleDateString()}</small></div>`).join("")}</div>` : ""}
          <div class="aas-rw-section">${ribbon("Thread Your Way To More")}${earnList([["Shop — every $1 spent", `${(d.program.pointsPerDollar * (tier ? tier.multiplier : 1)).toFixed(2).replace(/\.?0+$/, "")} ${pn}`], ...d.waysToEarn.filter((w) => w.event !== "SIGNUP").map((w) => [EARN_LABEL[w.event] || w.event, `${fmt(w.points)} ${pn}`])])}</div>
          ${d.waysToEarn.some((w) => w.event === "BIRTHDAY") ? `<div class="aas-rw-section">${ribbon("Your Special Day")}
            ${m.birthday ? `<div class="aas-rw-small">${MONTHS[m.birthday.month - 1]} ${m.birthday.day} — we'll add ${esc(pn)} on the day.</div>`
            : `<div class="aas-rw-row"><select data-bmonth>${MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join("")}</select><select data-bday>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select><button class="aas-rw-btn ghost auto" data-bsave>Save Birthday</button></div><div class="aas-rw-bout"></div>`}
          </div>` : ""}
        </div>`;
      bindClose(el, opts);

      el.querySelectorAll("[data-redeem]").forEach((btn) => btn.addEventListener("click", async () => {
        const out = el.querySelector(".aas-rw-out");
        btn.disabled = true; out.innerHTML = '<div class="aas-rw-msg">Creating your code…</div>';
        try {
          const r = await fetch(api("redeem"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ rewardId: btn.dataset.redeem }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Couldn't redeem");
          out.innerHTML = `<div class="aas-rw-msg">Your code: <span class="aas-rw-code">${esc(j.code)}</span> — apply it at checkout. Valid until ${new Date(j.expiresAt).toLocaleDateString()}.</div>`;
          state = null; setTimeout(() => render(el, opts), 2500);
        } catch (e) { out.innerHTML = `<div class="aas-rw-msg err">${esc(e.message)}</div>`; btn.disabled = false; }
      }));
      const bsave = el.querySelector("[data-bsave]");
      if (bsave) bsave.addEventListener("click", async () => {
        const out = el.querySelector(".aas-rw-bout");
        try {
          const r = await fetch(api("birthday"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ month: el.querySelector("[data-bmonth]").value, day: el.querySelector("[data-bday]").value }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Couldn't save");
          out.innerHTML = `<div class="aas-rw-msg">${j.awarded ? "Happy birthday — points added!" : "Saved. We'll add points on your birthday."}</div>`;
          state = null; setTimeout(() => render(el, opts), 1500);
        } catch (e) { out.innerHTML = `<div class="aas-rw-msg err">${esc(e.message)}</div>`; }
      });
    }).catch(() => { el.innerHTML = '<div class="aas-rw-loading">Rewards are unavailable right now.</div>'; });
  }
  function bindClose(el, opts) { const c = el.querySelector(".aas-rw-close"); if (c && opts.onClose) c.addEventListener("click", opts.onClose); }

  function mountPanels() { document.querySelectorAll("[data-aas-rewards-panel]").forEach((el) => render(el)); }

  function mountAccount() {
    if (!cfg.accountPanel || !/^customers/.test(cfg.template || "") || cfg.template === "customers/login" || cfg.template === "customers/register") return;
    if (document.querySelector("[data-aas-rewards-panel]")) return;
    const target = (cfg.accountSelector || "main").split(",").map((s) => document.querySelector(s.trim())).find(Boolean);
    if (!target) return;
    const el = document.createElement("div"); el.className = "aas-rewards-panel"; el.setAttribute("data-aas-rewards-panel", "");
    target.insertAdjacentElement("afterbegin", el); render(el);
  }

  function mountLauncher() {
    if (!cfg.launcher) return;
    const pos = cfg.launcherPosition === "left" ? "left" : "right";
    const btn = document.createElement("button"); btn.className = "aas-rw-launcher " + pos; btn.type = "button";
    btn.style.setProperty("--acc", cfg.color || "#c60d11");
    const label = cfg.launcherLabel || "Rewards";
    btn.innerHTML = `${SPOOL}<span>${esc(label)}${cfg.loggedIn && cfg.metaBalance ? ` <b>· ${fmt(cfg.metaBalance)}</b>` : ""}</span>`;
    const drawer = document.createElement("div"); drawer.className = "aas-rw-drawer " + pos;
    drawer.innerHTML = '<div class="aas-rewards-panel" data-aas-rewards-panel data-aas-no-auto></div>';
    document.body.append(btn, drawer);
    let rendered = false;
    const close = () => drawer.classList.remove("open");
    btn.addEventListener("click", () => {
      drawer.classList.toggle("open");
      if (!rendered) { rendered = true; render(drawer.querySelector("[data-aas-rewards-panel]"), { closable: true, onClose: close }); }
    });
  }

  function mountProduct() {
    if (!cfg.productPoints || cfg.template !== "product" || !cfg.product) return;
    const target = (cfg.productSelector || ".price").split(",").map((s) => document.querySelector(s.trim())).find(Boolean);
    if (!target) return;
    const line = document.createElement("div"); line.className = "aas-rw-product"; line.style.setProperty("--acc", cfg.color || "#c60d11");
    target.insertAdjacentElement("afterend", line);
    const currentVariant = () => { const u = new URLSearchParams(location.search).get("variant"); return u ? Number(u) : cfg.product.selected; };
    const update = async () => {
      const vid = currentVariant(); const i = cfg.product.variants.indexOf(vid);
      const price = (i >= 0 ? cfg.product.prices[i] : cfg.product.prices[0]) / 100;
      try {
        const r = await fetch(api(`estimate?product=${cfg.product.id}&variant=${vid}&vendor=${encodeURIComponent(cfg.product.vendor || "")}&price=${price}`), { credentials: "same-origin", headers: { Accept: "application/json" } });
        const j = await r.json();
        line.innerHTML = j.points > 0 ? `Earn <b>${fmt(j.points)} ${esc(j.pointsName || "points")}</b> with this purchase${cfg.loggedIn ? "" : ` · <a href="${cfg.registerUrl}">join free</a>`}` : "";
      } catch (_) { line.innerHTML = ""; }
    };
    update();
    window.addEventListener("popstate", update);
    document.addEventListener("change", (e) => { if (e.target && /variant|option/i.test(e.target.name || "")) setTimeout(update, 50); });
  }

  const boot = () => { document.querySelectorAll("[data-aas-rewards-panel]:not([data-aas-no-auto])").forEach((el) => render(el)); mountAccount(); mountLauncher(); mountProduct(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
