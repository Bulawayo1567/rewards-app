(function () {
  const cfg = window.AASPopup || {};
  const root = (cfg.root || "/").replace(/\/?$/, "/");
  const api = (p) => root + "apps/rewards/" + p;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };

  if (cfg.hideOnMobile && window.innerWidth < 640) return;
  if (window.Shopify && window.Shopify.designMode) return;

  fetch(api("campaign?page=" + encodeURIComponent(cfg.page || "other")), { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then((r) => r.json()).then((j) => { if (j && j.campaign) schedule(j.campaign); }).catch(() => {});

  function schedule(c) {
    const played = store.get("aas_pu_played_" + c.id);
    if (played) return;
    const closed = Number(store.get("aas_pu_closed_" + c.id) || 0);
    if (closed && Date.now() - closed < (cfg.hideDays || 0) * 86_400_000) return;
    setTimeout(() => open(c), (c.showDelaySeconds || 0) * 1000);
  }

  function open(c) {
    const acc = c.primaryColor || "#c60d11";
    const bd = document.createElement("div"); bd.className = "aas-pu-backdrop";
    bd.innerHTML = `<div class="aas-pu" style="--acc:${esc(acc)}" role="dialog" aria-modal="true">
      <button class="aas-pu-close" aria-label="Close">×</button>
      <div class="aas-pu-visual"></div>
      <div class="aas-pu-copy">
        <h2>${esc(c.headline)}</h2>${c.subheadline ? `<p>${esc(c.subheadline)}</p>` : ""}
        ${c.requireEmail ? `<input type="email" placeholder="Your email address" value="${esc(cfg.email || "")}" autocomplete="email">` : ""}
        <button class="aas-pu-btn">${esc(c.buttonLabel)}</button>
        <div class="aas-pu-err" hidden></div>
        <div class="aas-pu-small">${c.requireEmail ? "By playing you agree to receive our emails. Unsubscribe any time. " : ""}One play per person.</div>
      </div></div>`;
    document.body.appendChild(bd); requestAnimationFrame(() => bd.classList.add("show"));
    const visual = bd.querySelector(".aas-pu-visual"), btn = bd.querySelector(".aas-pu-btn"), err = bd.querySelector(".aas-pu-err"), email = bd.querySelector("input[type=email]");
    const close = () => { bd.classList.remove("show"); setTimeout(() => bd.remove(), 250); };
    bd.querySelector(".aas-pu-close").addEventListener("click", () => { store.set("aas_pu_closed_" + c.id, String(Date.now())); close(); });

    let wheel = null, scratch = null;
    if (c.kind === "WHEEL") wheel = drawWheel(visual, c.prizes, acc);
    else if (c.kind === "SCRATCH") visual.innerHTML = `<div class="aas-pu-scratch"><div class="under">?</div></div>`;
    else visual.innerHTML = `<div class="aas-pu-gift">🎁</div>`;

    btn.addEventListener("click", async () => {
      err.hidden = true; btn.disabled = true;
      try {
        const r = await fetch(api("play"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ campaignId: c.id, email: email ? email.value : "" }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Please try again.");
        store.set("aas_pu_played_" + c.id, "1");
        if (j.already) return showResult(bd, j, acc, true);
        if (wheel) { wheel.spinTo(j.prize.id, () => showResult(bd, j, acc)); }
        else if (c.kind === "SCRATCH") { scratch = makeScratch(visual, j.prize.label, acc, () => showResult(bd, j, acc)); btn.textContent = "Scratch the card!"; }
        else showResult(bd, j, acc);
      } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
    });
  }

  function showResult(bd, j, acc, already) {
    const copy = bd.querySelector(".aas-pu-copy");
    const won = j.prize.type !== "NOTHING";
    copy.innerHTML = `<div class="aas-pu-result">
      <h2>${already ? "You've already played" : won ? "You won!" : "Not this time"}</h2>
      <p style="font-size:1.2rem;font-weight:700;margin:8px 0">${esc(j.prize.label)}</p>
      ${j.code ? `<div class="aas-pu-code">${esc(j.code)}</div><p class="aas-pu-small">Enter this code at checkout. We've also noted it on your account.</p>` : ""}
      ${j.prize.type === "POINTS" ? `<p class="aas-pu-small">Points added to your rewards balance.</p>` : ""}
      ${!won && !j.code ? `<p class="aas-pu-small">Thanks for playing — you're subscribed for future offers.</p>` : ""}
      <button class="aas-pu-btn" style="margin-top:12px">Continue shopping</button></div>`;
    copy.querySelector(".aas-pu-btn").addEventListener("click", () => { bd.classList.remove("show"); setTimeout(() => bd.remove(), 250); });
  }

  // ── Wheel ──
  function drawWheel(container, prizes, acc) {
    const n = prizes.length;
    container.innerHTML = `<div class="aas-pu-wheel"><div class="aas-pu-pointer"></div><canvas width="600" height="600"></canvas></div>`;
    const cv = container.querySelector("canvas"), ctx = cv.getContext("2d");
    const R = 290, cx = 300, cy = 300, slice = (2 * Math.PI) / n;
    const palette = [acc, "#222222", "#e8e8e8", "#f0b429", "#2e7d32", "#5c6bc0"];
    prizes.forEach((p, i) => {
      const a0 = -Math.PI / 2 + i * slice, a1 = a0 + slice;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
      ctx.fillStyle = p.color || palette[i % palette.length]; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + slice / 2); ctx.textAlign = "right"; ctx.textBaseline = "middle";
      const light = isLight(p.color || palette[i % palette.length]); ctx.fillStyle = light ? "#222" : "#fff";
      ctx.font = "bold 22px system-ui, sans-serif";
      wrap(ctx, p.label, R - 24, 0, 150, 24); ctx.restore();
    });
    ctx.beginPath(); ctx.arc(cx, cy, 34, 0, 2 * Math.PI); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = 6; ctx.stroke();
    let rotated = 0;
    return {
      spinTo(prizeId, done) {
        const idx = Math.max(0, prizes.findIndex((p) => p.id === prizeId));
        const target = 360 * 6 + (360 - (idx * (360 / n) + (360 / n) / 2)) + (Math.random() * 20 - 10) * 0.6;
        rotated += target; cv.style.transform = `rotate(${rotated}deg)`;
        setTimeout(done, 5700);
      },
    };
  }
  function isLight(hex) { const h = hex.replace("#", ""); if (h.length < 6) return false; const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return (r * 299 + g * 587 + b * 114) / 1000 > 160; }
  function wrap(ctx, text, x, y, maxW, lh) {
    const words = text.split(" "), lines = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh));
  }

  // ── Scratch card ──
  function makeScratch(container, label, acc, done) {
    container.innerHTML = `<div class="aas-pu-scratch"><div class="under">${esc(label)}</div><canvas></canvas></div>`;
    const box = container.querySelector(".aas-pu-scratch"), cv = container.querySelector("canvas"), ctx = cv.getContext("2d");
    const w = box.clientWidth, h = box.clientHeight; cv.width = w; cv.height = h;
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#bbb"); g.addColorStop(1, "#888"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#555"; ctx.font = "bold 20px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("Scratch here", w / 2, h / 2 + 7);
    ctx.globalCompositeOperation = "destination-out";
    let down = false, finished = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    const scrape = (e) => { if (!down || finished) return; const p = pos(e); ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, 2 * Math.PI); ctx.fill(); e.preventDefault(); check(); };
    const check = () => { const d = ctx.getImageData(0, 0, w, h).data; let clear = 0; for (let i = 3; i < d.length; i += 4 * 8) if (d[i] === 0) clear++; if (clear / (d.length / 32) > 0.5) { finished = true; cv.style.transition = "opacity .4s"; cv.style.opacity = "0"; setTimeout(done, 500); } };
    cv.addEventListener("mousedown", () => (down = true)); cv.addEventListener("touchstart", () => (down = true), { passive: true });
    window.addEventListener("mouseup", () => (down = false)); window.addEventListener("touchend", () => (down = false));
    cv.addEventListener("mousemove", scrape); cv.addEventListener("touchmove", scrape, { passive: false });
    return { cv };
  }
})();
