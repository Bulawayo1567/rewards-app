import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";

/** Shared look for the admin: gingham hero, stitched panels, tables, pills, chips. */
export const ICON = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221200%22%20height%3D%221200%22%20viewBox%3D%220%200%201200%201200%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22cush%22%20cx%3D%2240%25%22%20cy%3D%2235%25%22%20r%3D%2270%25%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23e8393c%22%2F%3E%3Cstop%20offset%3D%22.7%22%20stop-color%3D%22%23c60d11%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238f0a0d%22%2F%3E%3C%2FradialGradient%3E%0A%20%20%20%20%3Cpattern%20id%3D%22g%22%20width%3D%2270%22%20height%3D%2270%22%20patternUnits%3D%22userSpaceOnUse%22%3E%3Crect%20width%3D%2270%22%20height%3D%2270%22%20fill%3D%22%23f4eee4%22%2F%3E%3Crect%20width%3D%2235%22%20height%3D%2270%22%20fill%3D%22rgba%28198%2C13%2C17%2C.13%29%22%2F%3E%3Crect%20width%3D%2270%22%20height%3D%2235%22%20fill%3D%22rgba%28198%2C13%2C17%2C.13%29%22%2F%3E%3C%2Fpattern%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Crect%20width%3D%221200%22%20height%3D%221200%22%20rx%3D%22220%22%20fill%3D%22url%28%23g%29%22%2F%3E%0A%20%20%3Crect%20x%3D%2260%22%20y%3D%2260%22%20width%3D%221080%22%20height%3D%221080%22%20rx%3D%22180%22%20fill%3D%22none%22%20stroke%3D%22rgba%2831%2C31%2C31%2C.3%29%22%20stroke-width%3D%2212%22%20stroke-dasharray%3D%2236%2028%22%2F%3E%0A%20%20%3Cg%20transform%3D%22translate%28120%20160%29%20scale%284%29%22%3E%0A%20%20%20%20%3Cellipse%20cx%3D%22120%22%20cy%3D%22200%22%20rx%3D%2286%22%20ry%3D%2212%22%20fill%3D%22rgba%280%2C0%2C0%2C.14%29%22%2F%3E%0A%20%20%20%20%3Cellipse%20cx%3D%22120%22%20cy%3D%22130%22%20rx%3D%2295%22%20ry%3D%2274%22%20fill%3D%22url%28%23cush%29%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M120%2060%20C%2070%2070%2C%2045%20110%2C%2040%20150%20M120%2060%20C%20170%2070%2C%20195%20110%2C%20200%20150%20M120%2060%20C%20100%20100%2C%20100%20150%2C%20110%20200%20M120%2060%20C%20140%20100%2C%20140%20150%2C%20130%20200%22%20fill%3D%22none%22%20stroke%3D%22rgba%28255%2C255%2C255%2C.55%29%22%20stroke-width%3D%222.5%22%20stroke-dasharray%3D%227%206%22%20stroke-linecap%3D%22round%22%2F%3E%0A%20%20%20%20%3Cpath%20d%3D%22M120%2058%20c-6-14%206-22%2010-8%20c8-14%2020-6%208%206%20c14-2%2016%2012%200%2012%20c10%2012-6%2020-12%206%20c-8%2014-22%206-10-8%20c-14%202-16-12%200-12z%22%20fill%3D%22%233f8f4a%22%2F%3E%0A%20%20%20%20%3Cellipse%20cx%3D%22120%22%20cy%3D%2264%22%20rx%3D%227%22%20ry%3D%224%22%20fill%3D%22%232f6e38%22%2F%3E%0A%20%20%20%20%3Cg%20stroke-linecap%3D%22round%22%3E%0A%20%20%20%20%20%20%3Cline%20x1%3D%2280%22%20y1%3D%22120%22%20x2%3D%2260%22%20y2%3D%2252%22%20stroke%3D%22%239a9a9a%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%2260%22%20cy%3D%2248%22%20r%3D%228%22%20fill%3D%22%231f1f1f%22%2F%3E%0A%20%20%20%20%20%20%3Cline%20x1%3D%22150%22%20y1%3D%22112%22%20x2%3D%22178%22%20y2%3D%2248%22%20stroke%3D%22%239a9a9a%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%22180%22%20cy%3D%2244%22%20r%3D%228%22%20fill%3D%22%23efe8dd%22%20stroke%3D%22%231f1f1f%22%20stroke-width%3D%221.5%22%2F%3E%0A%20%20%20%20%20%20%3Cline%20x1%3D%22105%22%20y1%3D%22108%22%20x2%3D%2298%22%20y2%3D%2240%22%20stroke%3D%22%239a9a9a%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%2297%22%20cy%3D%2236%22%20r%3D%228%22%20fill%3D%22%23c60d11%22%20stroke%3D%22%23fff%22%20stroke-width%3D%221.5%22%2F%3E%0A%20%20%20%20%20%20%3Cline%20x1%3D%22160%22%20y1%3D%22140%22%20x2%3D%22205%22%20y2%3D%22105%22%20stroke%3D%22%239a9a9a%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%22210%22%20cy%3D%22102%22%20r%3D%228%22%20fill%3D%22%231f1f1f%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E%0A";

const GINGHAM = "repeating-linear-gradient(0deg, rgba(198,13,17,.13) 0 14px, transparent 14px 28px), repeating-linear-gradient(90deg, rgba(198,13,17,.13) 0 14px, transparent 14px 28px), repeating-linear-gradient(0deg, rgba(255,255,255,.5) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(255,255,255,.5) 0 1px, transparent 1px 3px)";

export function Hero({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ position: "relative", borderRadius: 16, padding: "18px 22px", marginBottom: 8, overflow: "hidden", backgroundColor: "#f4eee4", backgroundImage: GINGHAM }}>
      <div style={{ position: "absolute", inset: 10, border: "2px dashed rgba(31,31,31,.3)", borderRadius: 10, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <Link to="/app" title="Dashboard"><img src={ICON} alt="" width={52} height={52} style={{ display: "block", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,.15)" }} /></Link>
        <div style={{ flex: 1, minWidth: 220, background: "#fbe7e8", border: "1.5px dashed rgba(198,13,17,.45)", borderRadius: 12, padding: "8px 16px", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1f1f1f", letterSpacing: "-.01em" }}>{title}</div>
          {sub && <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>{sub}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

export const UI_CSS = `
.aas-panel{background:#fff;border:2px dashed #e3d9cc;border-radius:16px;padding:16px 18px;margin:8px 0}
.aas-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#8a8a8a;margin-bottom:10px}
.aas-muted{color:#8a8a8a}
.aas-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.aas-find{display:flex;align-items:center;gap:8px;flex:1 1 320px;max-width:560px}
.aas-find s-text-field{flex:1}
.aas-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.aas-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:2px dashed #eee5d9}
.aas-chip{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;border:1.5px dashed #e3d9cc;background:#fff;color:#1f1f1f;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap}
.aas-chip:hover{border-color:#c60d11}
.aas-chip.on{background:#c60d11;border-color:#c60d11;color:#fff}
.aas-chip .c{font-size:11px;font-weight:800;padding:1px 7px;border-radius:999px;background:#f4d3d5;color:#c60d11}
.aas-chip.on .c{background:rgba(255,255,255,.25);color:#fff}
.aas-tbl{width:100%;border-collapse:collapse;font-size:13px}
.aas-tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8a8a8a;font-weight:700;padding:8px 6px;border-bottom:2px dashed #eee5d9;white-space:nowrap}
.aas-tbl td{padding:10px 6px;border-bottom:1px dashed #eee5d9;vertical-align:middle}
.aas-tbl tr:last-child td{border-bottom:0}
.aas-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
.aas-tbl .dim{color:#666}
.aas-tblwrap{overflow-x:auto}
.aas-pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#e8f5ec;color:#1b5e20;white-space:nowrap}
.aas-pill.neg{background:#fdecec;color:#8a1c1c}
.aas-pill.warn{background:#fff4d6;color:#7a5600}
.aas-pill.tier{background:#fff;color:#c60d11;border:1.2px dashed #c60d11}
.aas-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:12px;border-top:2px dashed #eee5d9}
.aas-ladder{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.aas-tiercard{position:relative;border:2px dashed #e3d9cc;border-radius:14px;padding:14px 16px 12px;background:#fff}
.aas-tiercard .rk{position:absolute;top:10px;right:12px;font-size:11px;font-weight:800;color:#8a8a8a}
.aas-tiercard .nm{display:inline-block;padding:4px 14px;border:1.5px dashed currentColor;font-weight:800;font-size:14px;margin-bottom:10px}
.aas-kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:4px 0;border-bottom:1px dashed #f0e8dc}
.aas-kv:last-of-type{border-bottom:0}
.aas-kv span{color:#666}
.aas-tabbar{display:flex;gap:4px;flex-wrap:wrap;background:#fff;border:2px dashed #e3d9cc;border-radius:14px;padding:6px;margin:8px 0}
.aas-tablink{padding:9px 16px;border-radius:10px;font-weight:700;font-size:14px;color:#666;text-decoration:none}
.aas-tablink:hover{background:#fbe7e8;color:#1f1f1f}
.aas-tablink.on{background:#c60d11;color:#fff;box-shadow:inset 0 0 0 3px #c60d11,inset 0 0 0 4.5px rgba(255,255,255,.6)}
.aas-tiercard .ft{display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:2px dashed #eee5d9}
`;

export type TabItem = { href: string; label: string; key: string };

export const EARN_TABS: TabItem[] = [
  { key: "earn", href: "/app/earn-rules", label: "Ways to earn" },
  { key: "rewards", href: "/app/rewards", label: "Rewards" },
  { key: "rules", href: "/app/product-rules", label: "Product rules" },
  { key: "campaigns", href: "/app/campaigns", label: "Campaigns" },
  { key: "emails", href: "/app/emails", label: "Emails" },
];
export const MEMBERS_TABS: TabItem[] = [
  { key: "all", href: "/app/customers", label: "Members" },
  { key: "spam", href: "/app/spam", label: "Suspicious" },
];
export const SETTINGS_TABS: TabItem[] = [
  { key: "program", href: "/app/settings", label: "Program" },
  { key: "import", href: "/app/import", label: "Import" },
];

export function Tabs({ items, active }: { items: TabItem[]; active: string }) {
  return (
    <div className="aas-tabbar">
      {items.map((t) => <Link key={t.key} to={t.href} className={`aas-tablink${t.key === active ? " on" : ""}`}>{t.label}</Link>)}
    </div>
  );
}

export const EXTRA_CSS = `.st-wrap{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start;margin-top:8px}
.st-card{position:relative;background:#fff;border:2px dashed #e3d9cc;border-radius:18px;padding:0;margin-bottom:16px;overflow:hidden}
.st-head{display:flex;align-items:center;gap:14px;padding:16px 20px;background:#fbf7f1;border-bottom:2px dashed #eee5d9}
.st-badge{width:44px;height:44px;border-radius:50%;background:#fbe7e8;border:2px dashed #c60d11;display:flex;align-items:center;justify-content:center;font-size:20px;flex:none}
.st-head h3{margin:0;font-size:17px;font-weight:800;color:#1f1f1f;letter-spacing:-.01em}
.st-head p{margin:2px 0 0;font-size:13px;color:#777}
.st-body{padding:18px 20px 20px}
.st-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.st-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.fld label{display:block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#8a8a8a;margin-bottom:6px}
.fld .box{display:flex;align-items:center;background:#fff;border:1.5px solid #e3d9cc;border-radius:12px;transition:border-color .15s, box-shadow .15s;overflow:hidden}
.fld .box:focus-within{border-color:#c60d11;box-shadow:0 0 0 3px rgba(198,13,17,.12)}
.fld input{flex:1;min-width:0;border:0;outline:0;background:transparent;padding:12px 14px;font:inherit;font-size:18px;font-weight:700;color:#1f1f1f}
.fld input.txt{font-size:15px;font-weight:600}
.fld .unit{padding:0 12px;font-size:12px;font-weight:700;color:#c60d11;background:#fbe7e8;align-self:stretch;display:flex;align-items:center;border-left:1.5px dashed #f0c9cb;white-space:nowrap}
.fld .hint{font-size:12px;color:#8a8a8a;margin-top:6px}
.st-toggle{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:18px;padding:14px 16px;border-radius:14px;border:2px dashed #e3d9cc;cursor:pointer;user-select:none;transition:all .15s}
.st-toggle.on{border-color:#c60d11;background:#fbe7e8}
.st-toggle b{font-size:15px;color:#1f1f1f}.st-toggle small{display:block;color:#666;font-size:12px;margin-top:2px}
.st-sw{width:52px;height:30px;border-radius:999px;background:#d9d2c7;position:relative;flex:none;transition:background .15s}
.st-sw::after{content:"";position:absolute;top:4px;left:4px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s}
.st-toggle.on .st-sw{background:#c60d11}.st-toggle.on .st-sw::after{left:26px}
.st-chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.st-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;border:1.5px dashed #e3d9cc;font-size:13px;font-weight:700;color:#555;cursor:pointer;user-select:none;background:#fff}
.st-chip input{display:none}
.st-chip .dot{width:14px;height:14px;border-radius:50%;border:2px solid #ccc;background:#fff}
.st-chip.on{border-color:#c60d11;color:#c60d11;background:#fbe7e8}
.st-chip.on .dot{border-color:#c60d11;background:#c60d11;box-shadow:inset 0 0 0 2px #fff}
.st-side{position:sticky;top:12px}
.st-tagcard{position:relative;background:#fff;border:2px dashed #c60d11;border-radius:18px;padding:22px 20px 18px;text-align:center;overflow:hidden}
.st-tagcard::before{content:"";position:absolute;inset:0 0 auto 0;height:70px;background-color:#f4eee4;background-image:repeating-linear-gradient(0deg,rgba(198,13,17,.13) 0 14px,transparent 14px 28px),repeating-linear-gradient(90deg,rgba(198,13,17,.13) 0 14px,transparent 14px 28px)}
.st-tagcard>*{position:relative}
.st-ribbon{display:inline-block;position:relative;background:#c60d11;color:#fff;font-weight:800;font-size:13px;padding:7px 22px;margin-bottom:16px}
.st-ribbon::before,.st-ribbon::after{content:"";position:absolute;top:0;bottom:0;width:10px;background:#c60d11}
.st-ribbon::before{left:-8px;clip-path:polygon(0 0,100% 0,100% 100%,0 100%,60% 50%)}
.st-ribbon::after{right:-8px;clip-path:polygon(0 0,100% 0,40% 50%,100% 100%,0 100%)}
.st-big{font-size:40px;font-weight:900;color:#1f1f1f;line-height:1;letter-spacing:-.02em}
.st-big small{font-size:15px;font-weight:700;color:#666;margin-left:4px}
.st-cap{font-size:13px;color:#666;margin:6px 0 14px}
.st-worth{display:inline-block;padding:8px 18px;border-radius:999px;background:#f4d3d5;font-weight:700;font-size:14px;color:#1f1f1f;position:relative}
.st-worth::before{content:"";position:absolute;inset:3px;border:1.4px dashed #c60d11;border-radius:999px}
.st-worth b{color:#c60d11;font-size:18px}
.st-facts{text-align:left;margin:18px 0 6px;border-top:2px dashed #eee5d9;padding-top:12px}
.st-facts div{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;color:#666}
.st-facts b{color:#1f1f1f}
.st-save{position:relative;width:100%;margin-top:14px;padding:14px;border:0;border-radius:12px;background:#c60d11;color:#fff;font:inherit;font-weight:800;font-size:15px;cursor:pointer}
.st-save::after{content:"";position:absolute;inset:5px;border:1.5px dashed rgba(255,255,255,.7);border-radius:8px;pointer-events:none}
.st-save:disabled{opacity:.6;cursor:wait}
.st-note{font-size:11px;color:#8a8a8a;margin-top:8px}
@media (max-width:980px){.st-wrap{grid-template-columns:1fr}.st-side{position:static}}
@media (max-width:640px){.st-grid,.st-grid.two{grid-template-columns:1fr}}

.st-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 18px;border:0;border-radius:11px;font:inherit;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none;white-space:nowrap;line-height:1}
.st-btn.sm{padding:8px 13px;font-size:13px;border-radius:9px}
.st-btn.primary{background:#c60d11;color:#fff}
.st-btn.primary::after{content:"";position:absolute;inset:4px;border:1.5px dashed rgba(255,255,255,.65);border-radius:7px;pointer-events:none}
.st-btn.secondary{background:#fff;color:#1f1f1f;border:1.5px dashed #c9bfb2}
.st-btn.secondary:hover{border-color:#c60d11;color:#c60d11}
.st-btn.danger{background:#fff;color:#8a1c1c;border:1.5px dashed #e3b4b4}
.st-btn.danger:hover{background:#fdecec}
.st-btn.ghost{background:transparent;color:#666;padding:8px 10px}
.st-btn.ghost:hover{color:#c60d11}
.st-btn:disabled{opacity:.55;cursor:not-allowed}
.fld select{flex:1;min-width:0;border:0;outline:0;background:transparent;padding:12px 14px;font:inherit;font-size:15px;font-weight:600;color:#1f1f1f;appearance:none;cursor:pointer}
.fld .box.sel::after{content:"⌄";padding:0 14px;color:#8a8a8a;font-size:18px;line-height:1}
.fld textarea{flex:1;min-width:0;border:0;outline:0;background:transparent;padding:12px 14px;font:inherit;font-size:14px;color:#1f1f1f;resize:vertical;min-height:80px}
.fld input[type=date]{font-size:14px;font-weight:600}
.fld input::placeholder{color:#b9b0a3;font-weight:500}
.st-empty{padding:28px;text-align:center;color:#8a8a8a;font-size:14px;border:2px dashed #eee5d9;border-radius:14px;background:#fffdf9}
.st-rows{display:grid;gap:10px}
.st-row{display:grid;grid-template-columns:minmax(0,1.4fr) 180px 120px;gap:14px;align-items:end;padding:12px 14px;border:1.5px dashed #e3d9cc;border-radius:14px;background:#fffdf9}
.st-row .ttl{font-weight:800;font-size:14px;color:#1f1f1f}.st-row .dsc{font-size:12px;color:#777;margin-top:2px}
.st-list{display:grid;gap:10px}
.st-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 14px;border:1.5px dashed #e3d9cc;border-radius:14px;background:#fff}
.st-item.off{opacity:.6;background:#fafafa}
.st-item .ic{width:40px;height:40px;border-radius:50%;background:#fbe7e8;border:1.5px dashed #c60d11;display:flex;align-items:center;justify-content:center;font-size:18px}
.st-item .ttl{font-weight:800;font-size:14px;color:#1f1f1f}
.st-item .meta{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:#777;margin-top:3px}
.st-item .meta b{color:#1f1f1f}
.st-item .acts{display:flex;gap:6px;align-items:center}
.st-form{margin-top:4px}
.st-form .st-grid{margin-bottom:14px}
.st-foot{display:flex;gap:10px;align-items:center;margin-top:4px}
.st-pct{font-size:12px;color:#8a8a8a}
.st-table .aas-tbl td{padding:11px 8px}
.st-reason{display:inline-block;font-size:11px;color:#7a5600;background:#fff4d6;border-radius:6px;padding:2px 7px;margin:2px 4px 0 0}
.st-preview{border:2px dashed #e3d9cc;border-radius:14px;overflow:hidden;background:#f4eee4}
.st-preview iframe{display:block;width:100%;height:640px;border:0;background:#f4eee4}
.st-auto{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px;border:1.5px dashed #e3d9cc;border-radius:14px;background:#fff}
.st-auto.on{border-color:#c60d11;background:#fffafa}
@media (max-width:760px){.st-row{grid-template-columns:1fr}.st-item{grid-template-columns:auto minmax(0,1fr)}.st-item .acts{grid-column:1/-1}}
`;

export function UIStyles() {
  return <style>{UI_CSS + EXTRA_CSS}</style>;
}


// ───────────────────────── Component library ─────────────────────────
export function Card({ icon, title, sub, children, actions }: { icon?: string; title: string; sub?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="st-card">
      <div className="st-head">
        {icon && <div className="st-badge">{icon}</div>}
        <div style={{ flex: 1, minWidth: 0 }}><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
        {actions && <div className="aas-actions">{actions}</div>}
      </div>
      <div className="st-body">{children}</div>
    </div>
  );
}

export function Field({ label, hint, unit, children, style }: { label: string; hint?: ReactNode; unit?: string; children: ReactNode; style?: any }) {
  return (
    <div className="fld" style={style}>
      <label>{label}</label>
      <div className="box">{children}{unit && <span className="unit">{unit}</span>}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Toggle({ name, checked, onChange, title, desc }: { name?: string; checked: boolean; onChange: (v: boolean) => void; title: string; desc?: string }) {
  return (
    <>
      {name && <input type="hidden" name={name} value={checked ? "on" : "false"} />}
      <div className={`st-toggle${checked ? " on" : ""}`} role="switch" aria-checked={checked} tabIndex={0}
           onClick={() => onChange(!checked)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}>
        <div><b>{title}</b>{desc && <small>{desc}</small>}</div>
        <span className="st-sw" />
      </div>
    </>
  );
}

export function Chip({ name, label, defaultChecked, value = "on" }: { name: string; label: string; defaultChecked?: boolean; value?: string }) {
  const [on, setOn] = useState(!!defaultChecked);
  return (
    <label className={`st-chip${on ? " on" : ""}`}>
      <input type="checkbox" name={name} value={value} checked={on} onChange={(e) => setOn(e.target.checked)} />
      <span className="dot" />{label}
    </label>
  );
}

export function Ribbon({ children }: { children: ReactNode }) {
  return <span className="st-ribbon">{children}</span>;
}

export function Btn({ children, variant = "primary", type = "submit", to, onClick, disabled, loading, small, target }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; type?: "submit" | "button"; to?: string; onClick?: () => void; disabled?: boolean; loading?: boolean; small?: boolean; target?: string }) {
  const cls = `st-btn ${variant}${small ? " sm" : ""}`;
  if (to) return target ? <a className={cls} href={to} target={target}>{children}</a> : <Link className={cls} to={to}>{children}</Link>;
  return <button className={cls} type={type} onClick={onClick} disabled={disabled || loading}>{loading ? "…" : children}</button>;
}

export function Pill({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "neg" | "warn" | "tier" | "info" }) {
  return <span className={`aas-pill ${tone === "ok" ? "" : tone}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="st-empty">{children}</div>;
}
