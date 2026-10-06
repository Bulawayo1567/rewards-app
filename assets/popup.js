(function () {
  if (window.__aasPopupBooted) return;
  window.__aasPopupBooted = true;
  const cfg = window.AASPopup || {};
  const root = (cfg.root || "/").replace(/\/?$/, "/");
  const api = (p) => root + "apps/rewards/" + p;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const titleCase = (t) => String(t ?? "").replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
  const FONT = () => (getComputedStyle(document.body).fontFamily || "system-ui, sans-serif");
  const PAT = ["#c60d11", "#f4d3d5"];

  const NEEDLE = `<svg class="aas-pu-needle" viewBox="0 0 22 64" aria-hidden="true"><path d="M11 0 C7 22 7 40 11 64 C15 40 15 22 11 0Z" fill="#1f1f1f"/><ellipse cx="11" cy="14" rx="2.2" ry="5" fill="#efe8dd"/></svg>`;
  const PIN = `<svg class="aas-pu-pin" viewBox="0 0 26 70" aria-hidden="true"><circle cx="13" cy="10" r="9" fill="#c60d11"/><circle cx="10" cy="7" r="3" fill="rgba(255,255,255,.55)"/><rect x="11.5" y="18" width="3" height="52" rx="1.5" fill="#9a9a9a"/><path d="M11.5 66 L13 70 L14.5 66Z" fill="#666"/></svg>`;
  const STRING = `<svg class="aas-pu-string" viewBox="0 0 70 34" aria-hidden="true"><path d="M2 2 C 20 0, 40 6, 54 30" fill="none" stroke="#1f1f1f" stroke-width="1.6" stroke-linecap="round"/><circle cx="2" cy="2" r="2" fill="#1f1f1f"/></svg>`;
  const CUSHION = `<svg viewBox="0 0 240 220" aria-hidden="true"><defs><radialGradient id="aasCush" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e8393c"/><stop offset=".7" stop-color="#c60d11"/><stop offset="1" stop-color="#8f0a0d"/></radialGradient></defs><ellipse cx="120" cy="200" rx="86" ry="12" fill="rgba(0,0,0,.12)"/><ellipse cx="120" cy="130" rx="95" ry="74" fill="url(#aasCush)"/><path d="M120 60 C 70 70, 45 110, 40 150 M120 60 C 170 70, 195 110, 200 150 M120 60 C 100 100, 100 150, 110 200 M120 60 C 140 100, 140 150, 130 200" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5" stroke-dasharray="7 6" stroke-linecap="round"/><path d="M120 58 c-6-14 6-22 10-8 c8-14 20-6 8 6 c14-2 16 12 0 12 c10 12-6 20-12 6 c-8 14-22 6-10-8 c-14 2-16-12 0-12z" fill="#3f8f4a"/><ellipse cx="120" cy="64" rx="7" ry="4" fill="#2f6e38"/><g stroke-linecap="round"><line x1="80" y1="120" x2="60" y2="52" stroke="#9a9a9a" stroke-width="3"/><circle cx="60" cy="48" r="8" fill="#1f1f1f"/><line x1="150" y1="112" x2="178" y2="48" stroke="#9a9a9a" stroke-width="3"/><circle cx="180" cy="44" r="8" fill="#efe8dd" stroke="#1f1f1f" stroke-width="1.5"/><line x1="105" y1="108" x2="98" y2="40" stroke="#9a9a9a" stroke-width="3"/><circle cx="97" cy="36" r="8" fill="#c60d11" stroke="#fff" stroke-width="1.5"/><line x1="160" y1="140" x2="205" y2="105" stroke="#9a9a9a" stroke-width="3"/><circle cx="210" cy="102" r="8" fill="#1f1f1f"/></g></svg>`;

  if (cfg.hideOnMobile && window.innerWidth < 640) return;
  if (window.Shopify && window.Shopify.designMode) return;

  fetch(api("campaign?page=" + encodeURIComponent(cfg.page || "other")), { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then((r) => r.json()).then((j) => { if (j && j.campaign) schedule(j.campaign); }).catch(() => {});

  function schedule(c) {
    if (store.get("aas_pu_played_" + c.id)) return;
    const closed = Number(store.get("aas_pu_closed_" + c.id) || 0);
    if (closed && Date.now() - closed < (cfg.hideDays || 0) * 86_400_000) return;
    setTimeout(() => open(c), (c.showDelaySeconds || 0) * 1000);
  }

  function open(c) {
    const acc = c.primaryColor || "#c60d11";
    const bd = document.createElement("div"); bd.className = "aas-pu-backdrop";
    bd.innerHTML = `<div class="aas-pu" style="--acc:${esc(acc)}" role="dialog" aria-modal="true" aria-label="${esc(c.headline)}">
      <button class="aas-pu-close" aria-label="Close">×</button>
      ${PIN}${PIN.replace('class="aas-pu-pin"', 'class="aas-pu-pin two"')}
      <div class="aas-pu-visual"></div>
      <div class="aas-pu-copy">
        <h2>${esc(titleCase(c.headline))}</h2>${c.subheadline ? `<p>${esc(c.subheadline)}</p>` : ""}
        ${c.requireEmail ? `<input type="email" placeholder="Your email address" value="${esc(cfg.email || "")}" autocomplete="email">` : ""}
        <button class="aas-pu-btn">${esc(titleCase(c.buttonLabel))}</button>
        <div class="aas-pu-err" hidden></div>
        <div class="aas-pu-small">${c.requireEmail ? "By playing you agree to receive our emails. Unsubscribe any time. " : ""}One play per person.</div>
      </div></div>`;
    document.body.appendChild(bd); requestAnimationFrame(() => bd.classList.add("show"));
    const visual = bd.querySelector(".aas-pu-visual"), btn = bd.querySelector(".aas-pu-btn"), err = bd.querySelector(".aas-pu-err"), email = bd.querySelector("input[type=email]");
    const close = () => { bd.classList.remove("show"); setTimeout(() => bd.remove(), 250); };
    bd.querySelector(".aas-pu-close").addEventListener("click", () => { store.set("aas_pu_closed_" + c.id, String(Date.now())); close(); });

    let wheel = null;
    if (c.kind === "WHEEL") wheel = drawWheel(visual, c.prizes, acc);
    else if (c.kind === "SCRATCH") makeScratch(visual, "?", acc, () => {});
    else visual.innerHTML = `<div class="aas-pu-gift">${CUSHION}</div>`;

    btn.addEventListener("click", async () => {
      err.hidden = true; btn.disabled = true;
      try {
        const r = await fetch(api("play"), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ campaignId: c.id, email: email ? email.value : "" }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Please try again.");
        store.set("aas_pu_played_" + c.id, "1");
        if (j.already) return showResult(bd, j, true);
        if (wheel) wheel.spinTo(j.prize.id, () => showResult(bd, j));
        else if (c.kind === "SCRATCH") { makeScratch(visual, j.prize.label, acc, () => showResult(bd, j)); btn.textContent = "Scratch The Card!"; }
        else showResult(bd, j);
      } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
    });
  }

  function showResult(bd, j, already) {
    const copy = bd.querySelector(".aas-pu-copy");
    const won = j.prize.type !== "NOTHING";
    copy.innerHTML = `<div class="aas-pu-result">
      <h2>${already ? "You've Already Played" : won ? "You Won!" : "Not This Time"}</h2>
      <div class="aas-pu-prize">${esc(titleCase(j.prize.label))}</div>
      ${j.code ? `<div class="aas-pu-tagwrap">${STRING}<div class="aas-pu-tag"><span class="aas-pu-code">${esc(j.code)}</span><button class="aas-pu-copybtn" type="button">Copy</button></div></div><div class="aas-pu-small">Enter this code at checkout. It's saved to your account too.</div>` : ""}
      ${j.prize.type === "POINTS" ? `<div class="aas-pu-small">Points added to your rewards balance.</div>` : ""}
      ${!won && !j.code ? `<div class="aas-pu-small">Thanks for playing — you'll be first to hear about our next offer.</div>` : ""}
      <button class="aas-pu-btn quiet" style="margin-top:6px">Continue Shopping</button></div>`;
    copy.querySelector(".aas-pu-btn").addEventListener("click", () => { bd.classList.remove("show"); setTimeout(() => bd.remove(), 250); });
    const cb = copy.querySelector(".aas-pu-copybtn"); if (cb) cb.addEventListener("click", () => { if (navigator.clipboard) navigator.clipboard.writeText(j.code); cb.textContent = "Copied"; });
  }

  // Puff embroidery: rounded raised letters with an extruded base, shaded top and a thread edge
  function shade(hex, amt) { const h = hex.replace("#", ""); const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); const o = c.map((v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))))); return "#" + o.map((v) => v.toString(16).padStart(2, "0")).join(""); }
  function puff(ctx, text, x, y, color, edge) {
    ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
    const m = ctx.measureText(text); const asc = m.actualBoundingBoxAscent || 20, desc = m.actualBoundingBoxDescent || 6;
    for (let d = 7; d >= 1; d--) { ctx.lineWidth = 9; ctx.strokeStyle = shade(color, -0.45 + d * 0.02); ctx.strokeText(text, x, y + d); ctx.fillStyle = shade(color, -0.35); ctx.fillText(text, x, y + d); }
    ctx.lineWidth = 9; ctx.strokeStyle = shade(color, -0.12); ctx.strokeText(text, x, y);
    const g = ctx.createLinearGradient(0, y - asc, 0, y + desc); g.addColorStop(0, shade(color, 0.32)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.18));
    ctx.fillStyle = g; ctx.fillText(text, x, y);
    ctx.globalAlpha = 0.35; ctx.fillStyle = "#fff"; ctx.fillText(text, x - 0.6, y - 1.4); ctx.globalAlpha = 1;
    ctx.setLineDash([2.6, 2.6]); ctx.lineWidth = 1.4; ctx.strokeStyle = edge; ctx.strokeText(text, x, y);
    ctx.restore();
  }
  // Satin-stitch lettering
  function embroider(ctx, text, x, y, thread, stitch) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 1.5; ctx.shadowOffsetX = 1.2; ctx.shadowOffsetY = 1.6;
    ctx.fillStyle = thread; ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent";
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash([3.2, 3.2]); ctx.lineWidth = 2.4; ctx.strokeStyle = stitch; ctx.strokeText(text, x, y);
    ctx.restore();
  }
  function wrap(ctx, text, x, y, maxW, lh, thread, stitch) {
    const words = text.split(" "), lines = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    lines.forEach((l, i) => embroider(ctx, l, x, y + (i - (lines.length - 1) / 2) * lh, thread, stitch));
  }
  function isLight(hex) { const h = (hex || "").replace("#", ""); if (h.length < 6) return false; const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return (r * 299 + g * 587 + b * 114) / 1000 > 160; }

  function drawWheel(container, prizes, acc) {
    const n = prizes.length;
    container.innerHTML = `<div class="aas-pu-wheel">${NEEDLE}<canvas width="680" height="680"></canvas></div>`;
    const cv = container.querySelector("canvas"), ctx = cv.getContext("2d");
    const cx = 340, cy = 340, R = 300, slice = (2 * Math.PI) / n;
    // patterned slices (staff colour honoured when set), wrap-safe
    const colors = prizes.map((p, i) => p.color || PAT[i % 2]);
    if (n > 1 && colors[n - 1] === colors[0]) colors[n - 1] = "#7a1a26"; // odd count: deep berry last slice so neighbours never match
    // tape-measure rim
    ctx.beginPath(); ctx.arc(cx, cy, R + 18, 0, 2 * Math.PI); ctx.fillStyle = "#f7f3ea"; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#1f1f1f"; ctx.stroke();
    ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = "#1f1f1f"; ctx.fillStyle = "#1f1f1f"; ctx.font = "600 11px " + FONT(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let k = 0; k < 120; k++) { const a = (k * Math.PI) / 60; const long = k % 10 === 0, mid = k % 5 === 0; const len = long ? 12 : mid ? 8 : 5;
      ctx.beginPath(); ctx.lineWidth = long ? 2 : 1; ctx.moveTo(Math.cos(a) * (R + 18 - len), Math.sin(a) * (R + 18 - len)); ctx.lineTo(Math.cos(a) * (R + 17), Math.sin(a) * (R + 17)); ctx.stroke();
      if (long) { ctx.save(); ctx.rotate(a); ctx.translate(R + 6, 0); ctx.rotate(Math.PI / 2); ctx.fillText(String((k / 10) * 5), 0, 0); ctx.restore(); } }
    ctx.restore();
    prizes.forEach((p, i) => { const a0 = -Math.PI / 2 + i * slice; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + slice); ctx.closePath(); ctx.fillStyle = colors[i]; ctx.fill(); });
    ctx.save(); ctx.setLineDash([9, 8]); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineCap = "round"; ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 1;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * slice; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 54, cy + Math.sin(a) * 54); ctx.lineTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10)); ctx.stroke(); }
    ctx.restore();
    prizes.forEach((p, i) => {
      const a0 = -Math.PI / 2 + i * slice;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + slice / 2); ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.font = "800 32px " + FONT();
      const light = isLight(colors[i]);
      wrap(ctx, titleCase(p.label), R - 34, 0, 175, 34, light ? acc : "#fff", light ? "rgba(31,31,31,.7)" : "rgba(31,31,31,.8)");
      ctx.restore();
    });
    [[46, "#fff"], [38, "#efe8dd"], [28, "#fff"], [18, "#efe8dd"], [9, "#1f1f1f"]].forEach(([r, f]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fillStyle = f; ctx.fill(); });
    let rotated = 0;
    return {
      spinTo(prizeId, done) {
        const idx = Math.max(0, prizes.findIndex((p) => p.id === prizeId));
        const target = 360 * 6 + (360 - (idx * (360 / n) + (360 / n) / 2)) + (Math.random() * 20 - 10) * 0.6;
        rotated += target; cv.style.transform = `rotate(${rotated}deg)`;
        setTimeout(done, matchMedia("(prefers-reduced-motion: reduce)").matches ? 900 : 5700);
      },
    };
  }

  function makeScratch(container, label, acc, done) {
    container.innerHTML = `<div class="aas-pu-scratch"><canvas class="under-cv" aria-label="${esc(label)}"></canvas><canvas></canvas></div>`;
    const box = container.querySelector(".aas-pu-scratch"), cv = container.querySelector("canvas:not(.under-cv)"), ctx = cv.getContext("2d");
    const w = box.clientWidth, h = box.clientHeight; cv.width = w; cv.height = h;
    const ucv = container.querySelector(".under-cv"); ucv.width = w * 2; ucv.height = h * 2; ucv.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    const uctx = ucv.getContext("2d"); uctx.scale(2, 2); uctx.fillStyle = "#fff"; uctx.fillRect(0, 0, w, h);
    uctx.font = "900 " + (label.length > 12 ? 30 : 40) + "px " + FONT(); uctx.textAlign = "center"; uctx.textBaseline = "middle";
    puff(uctx, titleCase(label), w / 2, h / 2 - 3, acc, "rgba(255,255,255,.9)");
    ctx.fillStyle = "#e6ddcf"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 0; x < w; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.setLineDash([6, 5]); ctx.strokeStyle = "rgba(31,31,31,.35)"; ctx.lineWidth = 1.5; ctx.strokeRect(12, 12, w - 24, h - 24); ctx.setLineDash([]);
    ctx.font = "900 30px " + FONT(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; puff(ctx, "Scratch Here", w / 2, h / 2 - 3, acc, "rgba(255,255,255,.9)");
    ctx.globalCompositeOperation = "destination-out";
    let down = false, finished = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    const scrape = (e) => { if (!down || finished) return; const p = pos(e); ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, 2 * Math.PI); ctx.fill(); e.preventDefault(); check(); };
    const check = () => { const d = ctx.getImageData(0, 0, w, h).data; let clear = 0; for (let i = 3; i < d.length; i += 32) if (d[i] === 0) clear++; if (clear / (d.length / 32) > 0.5) { finished = true; cv.style.transition = "opacity .4s"; cv.style.opacity = "0"; setTimeout(done, 500); } };
    cv.addEventListener("mousedown", () => (down = true)); cv.addEventListener("touchstart", () => (down = true), { passive: true });
    window.addEventListener("mouseup", () => (down = false)); window.addEventListener("touchend", () => (down = false));
    cv.addEventListener("mousemove", scrape); cv.addEventListener("touchmove", scrape, { passive: false });
  }
})();
