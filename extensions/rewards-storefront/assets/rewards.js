(function () {
  const cfg = (window.AASRewards && window.AASRewards.config) || {};
  const root = (cfg.root || "/").replace(/\/?$/, "/");
  const api = (p) => root + "apps/rewards/" + p;
  const fmt = (n) => Number(n || 0).toLocaleString();
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const EARN_LABEL = { SIGNUP: "Create an account", NEWSLETTER: "Join our newsletter", BIRTHDAY: "Celebrate your birthday", REVIEW: "Write a review", REFERRAL_REFERRER: "Refer a friend", REFERRAL_FRIEND: "Get referred by a friend" };
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  let state = null;
  async function load() {
    if (state) return state;
    const r = await fetch(api("me"), { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("rewards api " + r.status);
    state = await r.json();
    return state;
  }

  function render(el) {
    el.style.setProperty("--aas-accent", cfg.color || "#c60d11");
    el.innerHTML = '<div class="aas-rw-loading">Loading your rewards…</div>';
    load().then((d) => {
      const pn = d.program.pointsName;
      if (!d.loggedIn) {
        el.innerHTML = `
          <div class="aas-rw-head"><h3 class="aas-rw-title">${esc(d.program.name)}</h3></div>
          <p class="aas-rw-sub">Earn <b>${d.program.pointsPerDollar} ${esc(pn)}</b> for every $1 you spend, plus bonuses. Redeem for discounts on future orders.</p>
          ${d.waysToEarn.length ? `<div class="aas-rw-section"><h4>Ways to earn</h4><ul class="aas-rw-earn">${d.waysToEarn.map((w) => `<li>${esc(EARN_LABEL[w.event] || w.event)} — <b>${fmt(w.points)} ${esc(pn)}</b></li>`).join("")}</ul></div>` : ""}
          <div class="aas-rw-row" style="margin-top:14px">
            <a class="aas-rw-btn" href="${cfg.registerUrl}">Join free</a>
            <a class="aas-rw-btn ghost" href="${cfg.loginUrl}">Sign in</a>
          </div>`;
        return;
      }
      const m = d.me;
      const tier = m.tier;
      const next = m.nextTier;
      const progress = next && tier && next.basis === "LIFETIME_POINTS"
        ? Math.min(100, Math.round(((m.lifetimePoints - Math.max(0, findThreshold(d, tier.rank))) / Math.max(1, (m.lifetimePoints + next.needed) - findThreshold(d, tier.rank))) * 100))
        : next ? Math.min(100, Math.round(100 * (1 - next.needed / Math.max(1, findNextThreshold(d, next.name))))) : 100;

      el.innerHTML = `
        <div class="aas-rw-head">
          <h3 class="aas-rw-title">${esc(m.firstName ? `Hi ${m.firstName}!` : d.program.name)}</h3>
          ${tier ? `<span class="aas-rw-tier" style="${tier.color ? `background:${esc(tier.color)}` : ""}">${esc(tier.name)}${tier.multiplier > 1 ? ` · ${tier.multiplier}× ${esc(pn)}` : ""}</span>` : ""}
        </div>
        <div class="aas-rw-balance">${fmt(m.balance)} <span class="aas-rw-sub" style="font-size:1rem;font-weight:600">${esc(pn)}</span></div>
        ${m.pending ? `<div class="aas-rw-sub">${fmt(m.pending)} pending</div>` : ""}
        ${next ? `<div class="aas-rw-progress"><span style="width:${progress}%"></span></div>
                 <div class="aas-rw-sub">${next.basis === "LIFETIME_POINTS" ? `${fmt(next.needed)} more ${esc(pn)}` : `$${fmt(Math.ceil(next.needed))} more`} to reach <b>${esc(next.name)}</b></div>`
               : tier ? `<div class="aas-rw-sub">You're at our top tier${tier.perks ? ` — ${esc(tier.perks)}` : ""}</div>` : ""}
        ${tier && tier.perks && next ? `<div class="aas-rw-sub" style="margin-top:4px">${esc(tier.perks)}</div>` : ""}

        <div class="aas-rw-section"><h4>Redeem ${esc(pn)}</h4>
          <div class="aas-rw-grid">${d.rewards.map((r) => {
            const locked = r.minTierRank != null && (tier ? tier.rank : -1) < r.minTierRank;
            const can = !locked && m.balance >= r.pointsCost && m.balance >= d.program.minRedeemPoints;
            return `<div class="aas-rw-card"><b>${esc(r.name)}</b><small>${fmt(r.pointsCost)} ${esc(pn)}${r.minOrderSubtotal ? ` · min order $${r.minOrderSubtotal}` : ""}${locked ? " · higher tier" : ""}</small>
              <button class="aas-rw-btn" data-redeem="${r.id}" ${can ? "" : "disabled"}>Redeem</button></div>`;
          }).join("") || '<div class="aas-rw-sub">No rewards available right now.</div>'}</div>
          <div class="aas-rw-out"></div>
        </div>

        ${m.codes.length ? `<div class="aas-rw-section"><h4>Your codes</h4>${m.codes.map((c) => `<div><span class="aas-rw-code">${esc(c.code)}</span> <small class="aas-rw-sub">${esc(c.name)} · ${c.status === "USED" ? "used" : "expires " + new Date(c.expiresAt).toLocaleDateString()}</small></div>`).join("")}</div>` : ""}

        ${d.waysToEarn.length ? `<div class="aas-rw-section"><h4>Ways to earn</h4><ul class="aas-rw-earn">${d.waysToEarn.map((w) => `<li>${esc(EARN_LABEL[w.event] || w.event)} — <b>${fmt(w.points)} ${esc(pn)}</b></li>`).join("")}</ul></div>` : ""}

        ${d.waysToEarn.some((w) => w.event === "BIRTHDAY") ? `<div class="aas-rw-section"><h4>Birthday</h4>
          ${m.birthday ? `<div class="aas-rw-sub">${MONTHS[m.birthday.month - 1]} ${m.birthday.day} — we'll send ${esc(pn)} on the day.</div>`
          : `<div class="aas-rw-row"><select data-bmonth>${MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join("")}</select>
             <select data-bday>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select>
             <button class="aas-rw-btn ghost" data-bsave>Save birthday</button></div><div class="aas-rw-bout"></div>`}
        </div>` : ""}`;

      el.querySelectorAll("[data-redeem]").forEach((btn) => btn.addEventListener("click", async () => {
        const out = el.querySelector(".aas-rw-out");
        btn.disabled = true; out.innerHTML = '<div class="aas-rw-msg">Creating your code…</div>';
        try {
          const r = await fetch(api("redeem"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ rewardId: btn.dataset.redeem }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Couldn't redeem");
          out.innerHTML = `<div class="aas-rw-msg">Your code: <span class="aas-rw-code">${esc(j.code)}</span> — apply it at checkout. Valid until ${new Date(j.expiresAt).toLocaleDateString()}.</div>`;
          state = null; setTimeout(() => render(el), 2500);
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
          state = null; setTimeout(() => render(el), 1500);
        } catch (e) { out.innerHTML = `<div class="aas-rw-msg err">${esc(e.message)}</div>`; }
      });
    }).catch(() => { el.innerHTML = '<div class="aas-rw-sub">Rewards are unavailable right now.</div>'; });
  }
  function findThreshold(d, rank) { const t = d.tiers.find((x) => x.rank === rank); return t ? t.threshold : 0; }
  function findNextThreshold(d, name) { const t = d.tiers.find((x) => x.name === name); return t ? t.threshold : 1; }

  function mountPanels() { document.querySelectorAll("[data-aas-rewards-panel]").forEach(render); }

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
    btn.style.setProperty("--aas-accent", cfg.color || "#c60d11");
    btn.textContent = cfg.loggedIn && cfg.metaBalance ? `${cfg.launcherLabel || "Rewards"} · ${fmt(cfg.metaBalance)}` : (cfg.launcherLabel || "Rewards");
    const drawer = document.createElement("div"); drawer.className = "aas-rw-drawer " + pos;
    drawer.innerHTML = '<button class="aas-rw-close" aria-label="Close">×</button><div class="aas-rewards-panel" data-aas-rewards-panel></div>';
    document.body.append(btn, drawer);
    let rendered = false;
    btn.addEventListener("click", () => { drawer.classList.toggle("open"); if (!rendered) { rendered = true; render(drawer.querySelector("[data-aas-rewards-panel]")); } });
    drawer.querySelector(".aas-rw-close").addEventListener("click", () => drawer.classList.remove("open"));
  }

  function mountProduct() {
    if (!cfg.productPoints || cfg.template !== "product" || !cfg.product) return;
    const target = (cfg.productSelector || ".price").split(",").map((s) => document.querySelector(s.trim())).find(Boolean);
    if (!target) return;
    const line = document.createElement("div"); line.className = "aas-rw-product"; line.style.setProperty("--aas-accent", cfg.color || "#c60d11");
    target.insertAdjacentElement("afterend", line);
    const update = async () => {
      const vid = currentVariant(); const i = cfg.product.variants.indexOf(vid);
      const price = (i >= 0 ? cfg.product.prices[i] : cfg.product.prices[0]) / 100;
      try {
        const r = await fetch(api(`estimate?product=${cfg.product.id}&variant=${vid}&vendor=${encodeURIComponent(cfg.product.vendor || "")}&price=${price}`), { credentials: "same-origin", headers: { Accept: "application/json" } });
        const j = await r.json();
        line.innerHTML = j.points > 0 ? `Earn <b>${fmt(j.points)} ${esc(j.pointsName || "points")}</b> with this purchase${cfg.loggedIn ? "" : ` · <a href="${cfg.registerUrl}">join free</a>`}` : "";
      } catch (_) { line.innerHTML = ""; }
    };
    const currentVariant = () => { const u = new URLSearchParams(location.search).get("variant"); return u ? Number(u) : cfg.product.selected; };
    update();
    window.addEventListener("popstate", update);
    document.addEventListener("change", (e) => { if (e.target && /variant|option/i.test(e.target.name || "")) setTimeout(update, 50); });
  }

  const boot = () => { mountPanels(); mountAccount(); mountLauncher(); mountProduct(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
