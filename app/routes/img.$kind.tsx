import type { LoaderFunctionArgs } from "react-router";

/**
 * Public SVG artwork for the customer-account Rewards page.
 *   /img/banner                   gingham fabric with pins
 *   /img/tag?n=1500&u=points      swing tag with the balance
 *   /img/worth?t=$15.00           blush pill
 *   /img/ribbon?t=Stitch%20Up     red ribbon title
 *   /img/button                   four-hole button icon
 * Purely decorative; no customer data beyond what the caller passes in.
 */
const RED = "#c60d11", INK = "#1f1f1f", BLUSH = "#f4d3d5", CREAM = "#f4eee4";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const clean = (s: string | null, max = 40) => esc(String(s ?? "").slice(0, max));

const pin = (x: number, y: number, rot: number, len = 70) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})"><circle cx="0" cy="0" r="9" fill="${RED}"/><circle cx="-3" cy="-3" r="3" fill="rgba(255,255,255,.55)"/><rect x="-1.5" y="8" width="3" height="${len - 18}" rx="1.5" fill="#9a9a9a"/><path d="M-1.5 ${len - 12} L0 ${len - 8} L1.5 ${len - 12}Z" fill="#666"/></g>`;

function banner(t: string, sub: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="220" viewBox="0 0 1200 220">
  <defs>
    <pattern id="g" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="${CREAM}"/><rect width="14" height="28" fill="rgba(198,13,17,.13)"/><rect width="28" height="14" fill="rgba(198,13,17,.13)"/></pattern>
    <pattern id="w" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="1" height="3" fill="rgba(255,255,255,.5)"/><rect width="3" height="1" fill="rgba(255,255,255,.5)"/></pattern>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1" dy="3" stdDeviation="2" flood-opacity=".3"/></filter>
  </defs>
  <rect width="1200" height="220" rx="20" fill="url(#g)"/><rect width="1200" height="220" rx="20" fill="url(#w)"/>
  <rect x="14" y="14" width="1172" height="192" rx="12" fill="none" stroke="rgba(31,31,31,.3)" stroke-width="3" stroke-dasharray="10 8"/>
  <text x="600" y="${sub ? 112 : 128}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="46" fill="${INK}">${t}</text>
  ${sub ? `<text x="600" y="152" text-anchor="middle" font-family="${FONT}" font-weight="500" font-size="20" fill="#444">${sub}</text>` : ""}
  <g filter="url(#sh)">${pin(60, 30, -28)}${pin(1140, 190, 152)}</g>
</svg>`;
}

function tag(n: string, unit: string) {
  const w = 300, h = 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <path d="M42 10 H${w - 10} a9 9 0 0 1 9 9 V${h - 19} a9 9 0 0 1 -9 9 H42 L10 ${h / 2} Z" fill="#fff" stroke="${RED}" stroke-width="3" stroke-dasharray="7 5" stroke-linejoin="round"/>
  <circle cx="36" cy="${h / 2}" r="6" fill="#fff" stroke="${RED}" stroke-width="3"/>
  <text x="${(w + 42) / 2}" y="${h / 2 + 14}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="42" letter-spacing="-1" fill="${INK}">${n}<tspan font-size="17" font-weight="600" fill="#444" dx="10">${unit}</tspan></text>
</svg>`;
}

function worth(t: string) {
  const w = 280, h = 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="20" fill="${BLUSH}"/>
  <rect x="6" y="6" width="${w - 12}" height="${h - 12}" rx="16" fill="none" stroke="${RED}" stroke-width="2.5" stroke-dasharray="6 6"/>
  <text x="${w / 2}" y="${h / 2 + 8}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="600" fill="${INK}">Worth <tspan font-size="19" font-weight="800" fill="${RED}">${t}</tspan> In Rewards</text>
</svg>`;
}

function ribbon(t: string) {
  const w = Math.max(180, Math.min(480, t.length * 12 + 80)), h = 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <path d="M0 5 H${w} L${w - 11} ${h / 2} L${w} ${h - 5} H0 L11 ${h / 2} Z" fill="${RED}"/>
  <rect x="18" y="11" width="${w - 36}" height="${h - 22}" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text x="${w / 2}" y="${h / 2 + 6}" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="700" fill="#fff">${t}</text>
</svg>`;
}

function label(t: string) {
  const w = Math.max(140, Math.min(360, t.length * 11 + 60)), h = 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <path d="M0 0 H${w} L${w - 8} ${h / 2} L${w} ${h} H0 L8 ${h / 2} Z" fill="#fff"/>
  <rect x="11" y="4" width="${w - 22}" height="${h - 8}" fill="none" stroke="${RED}" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" font-family="${FONT}" font-size="14" font-weight="800" letter-spacing=".3" fill="${RED}">${t}</text>
</svg>`;
}

function icon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 1200 1200">
  <defs>
    <radialGradient id="cush" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#e8393c"/><stop offset=".7" stop-color="#c60d11"/><stop offset="1" stop-color="#8f0a0d"/></radialGradient>
    <pattern id="g" width="70" height="70" patternUnits="userSpaceOnUse"><rect width="70" height="70" fill="#f4eee4"/><rect width="35" height="70" fill="rgba(198,13,17,.13)"/><rect width="70" height="35" fill="rgba(198,13,17,.13)"/></pattern>
  </defs>
  <rect width="1200" height="1200" rx="220" fill="url(#g)"/>
  <rect x="60" y="60" width="1080" height="1080" rx="180" fill="none" stroke="rgba(31,31,31,.3)" stroke-width="12" stroke-dasharray="36 28"/>
  <g transform="translate(120 160) scale(4)">
    <ellipse cx="120" cy="200" rx="86" ry="12" fill="rgba(0,0,0,.14)"/>
    <ellipse cx="120" cy="130" rx="95" ry="74" fill="url(#cush)"/>
    <path d="M120 60 C 70 70, 45 110, 40 150 M120 60 C 170 70, 195 110, 200 150 M120 60 C 100 100, 100 150, 110 200 M120 60 C 140 100, 140 150, 130 200" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5" stroke-dasharray="7 6" stroke-linecap="round"/>
    <path d="M120 58 c-6-14 6-22 10-8 c8-14 20-6 8 6 c14-2 16 12 0 12 c10 12-6 20-12 6 c-8 14-22 6-10-8 c-14 2-16-12 0-12z" fill="#3f8f4a"/>
    <ellipse cx="120" cy="64" rx="7" ry="4" fill="#2f6e38"/>
    <g stroke-linecap="round">
      <line x1="80" y1="120" x2="60" y2="52" stroke="#9a9a9a" stroke-width="3"/><circle cx="60" cy="48" r="8" fill="#1f1f1f"/>
      <line x1="150" y1="112" x2="178" y2="48" stroke="#9a9a9a" stroke-width="3"/><circle cx="180" cy="44" r="8" fill="#efe8dd" stroke="#1f1f1f" stroke-width="1.5"/>
      <line x1="105" y1="108" x2="98" y2="40" stroke="#9a9a9a" stroke-width="3"/><circle cx="97" cy="36" r="8" fill="#c60d11" stroke="#fff" stroke-width="1.5"/>
      <line x1="160" y1="140" x2="205" y2="105" stroke="#9a9a9a" stroke-width="3"/><circle cx="210" cy="102" r="8" fill="#1f1f1f"/>
    </g>
  </g>
</svg>
`;
}

/** Tape-measure progress bar, p = percent filled */
function tape(p: number) {
  const w = 300, h = 24;
  let ticks = "";
  for (let x = 0; x <= w; x += 6) { const long = x % 30 === 0, mid = x % 15 === 0; ticks += `<line x1="${x}" y1="${h}" x2="${x}" y2="${h - (long ? 10 : mid ? 7 : 4)}" stroke="${INK}" stroke-width="${long ? 1.4 : 1}"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" rx="4" fill="#f7f3ea" stroke="${INK}" stroke-width="1.5"/>
  <rect x="1.5" y="1.5" width="${Math.max(0, (w - 3) * p / 100)}" height="${h - 3}" rx="3" fill="${RED}" opacity=".85"/>
  <g opacity=".7">${ticks}</g>
</svg>`;
}

/** Small sewing icons for reward / earn cards */
function sicon(k: string) {
  const inner: Record<string, string> = {
    tag: `<path d="M8 4h22l10 10-16 16L8 14z" fill="#fff" stroke="${RED}" stroke-width="2.4" stroke-dasharray="4 3" stroke-linejoin="round"/><circle cx="16" cy="12" r="3" fill="${RED}"/>`,
    spool: `<rect x="10" y="7" width="20" height="5" rx="2" fill="#8c7b74"/><rect x="10" y="28" width="20" height="5" rx="2" fill="#8c7b74"/><rect x="14" y="12" width="12" height="16" fill="${RED}"/><path d="M14 15h12M14 19h12M14 23h12" stroke="rgba(255,255,255,.5)" stroke-width="1.4"/>`,
    scissors: `<circle cx="13" cy="29" r="5" fill="none" stroke="${INK}" stroke-width="2.2"/><circle cx="13" cy="11" r="5" fill="none" stroke="${INK}" stroke-width="2.2"/><path d="M17 14l16 14M17 26l16-14" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
    pin: `<circle cx="14" cy="12" r="6" fill="${RED}"/><circle cx="12" cy="10" r="2" fill="rgba(255,255,255,.55)"/><path d="M18 16l12 12" stroke="#9a9a9a" stroke-width="3" stroke-linecap="round"/><path d="M29 27l3 3-1 1-3-3z" fill="#666"/>`,
    button: `<circle cx="20" cy="20" r="14" fill="${BLUSH}" stroke="${RED}" stroke-width="2"/><circle cx="15" cy="15" r="2.2" fill="${RED}"/><circle cx="25" cy="15" r="2.2" fill="${RED}"/><circle cx="15" cy="25" r="2.2" fill="${RED}"/><circle cx="25" cy="25" r="2.2" fill="${RED}"/>`,
    needle: `<path d="M8 32 C 14 18, 22 12, 32 8" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><ellipse cx="29" cy="11" rx="2.2" ry="4" transform="rotate(35 29 11)" fill="${CREAM}"/><path d="M8 32c-4 2-3 6 1 5" stroke="${RED}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    thimble: `<path d="M12 18a8 8 0 0 1 16 0v14H12z" fill="#b9b2a8" stroke="#8c7b74" stroke-width="2"/><g fill="#8c7b74"><circle cx="16" cy="14" r="1.2"/><circle cx="20" cy="12" r="1.2"/><circle cx="24" cy="14" r="1.2"/><circle cx="18" cy="18" r="1.2"/><circle cx="22" cy="18" r="1.2"/></g><rect x="12" y="30" width="16" height="3" fill="#8c7b74"/>`,
    cushion: `<ellipse cx="20" cy="22" rx="14" ry="11" fill="${RED}"/><path d="M20 11c-8 3-12 10-12 18M20 11c8 3 12 10 12 18" stroke="rgba(255,255,255,.5)" stroke-width="1.6" stroke-dasharray="3 3" fill="none"/><path d="M20 11c-2-3 1-5 2-2c2-3 5-1 2 2c3 0 3 3 0 3c2 3-1 5-2 2c-2 3-5 1-2-2c-3 0-3-3 0-3z" fill="#3f8f4a"/><path d="M14 18l-3-7" stroke="#9a9a9a" stroke-width="1.8"/><circle cx="11" cy="10" r="2" fill="${INK}"/>`,
  };
  const body = inner[k] ?? inner.button;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${body}</svg>`;
}

function button() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="${BLUSH}" stroke="${RED}" stroke-width="1.5"/><circle cx="7" cy="7" r="1.4" fill="${RED}"/><circle cx="13" cy="7" r="1.4" fill="${RED}"/><circle cx="7" cy="13" r="1.4" fill="${RED}"/><circle cx="13" cy="13" r="1.4" fill="${RED}"/></svg>`;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const q = new URL(request.url).searchParams;
  let svg = "";
  switch (params.kind) {
    case "banner": svg = banner(clean(q.get("t"), 40) || "Rewards", clean(q.get("s"), 90)); break;
    case "tape": svg = tape(Math.max(0, Math.min(100, Number(q.get("p") ?? 0)))); break;
    case "sicon": svg = sicon(clean(q.get("k"), 12)); break;
    case "tag": svg = tag(clean(q.get("n"), 12) || "0", clean(q.get("u"), 16) || "points"); break;
    case "worth": svg = worth(clean(q.get("t"), 14) || "$0.00"); break;
    case "ribbon": svg = ribbon(clean(q.get("t"), 40) || "Rewards"); break;
    case "label": svg = label(clean(q.get("t"), 40) || "Member"); break;
    case "icon": svg = icon(); break;
    case "button": svg = button(); break;
    default: return new Response("Not found", { status: 404 });
  }
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
};
