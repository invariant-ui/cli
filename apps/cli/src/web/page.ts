/**
 * The page `invariant setup` serves on the loopback address. One file, no external request: the styles and script are
 * inline, there is no font and no image. It follows site/design.md (tokens, type, square corners, flat panels, theme
 * toggle stored in localStorage `theme`). Text that comes from the setup process is put in the page with `textContent`
 * only, never as markup.
 */
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>invariant setup</title>
<style>
:root{--bg:#0e0e0d;--panel:#151514;--sunk:#121211;--line:#2a2a27;--text:#ece9e2;--muted:#9a968c;--accent:#7c8cff;--accent2:#5eead4;--ok:#4ade80;--warn:#fbbf24;--bad:#f87171;--on-accent:#0e0e0d;color-scheme:dark}
@media (prefers-color-scheme:light){:root:not([data-theme=dark]){--bg:#faf9f6;--panel:#f1efe9;--sunk:#e9e6de;--line:#dcd8cd;--text:#1c1b18;--muted:#66625a;--accent:#4553d6;--accent2:#0f766e;--ok:#15803d;--warn:#a16207;--bad:#b91c1c;--on-accent:#faf9f6;color-scheme:light}}
:root[data-theme=light]{--bg:#faf9f6;--panel:#f1efe9;--sunk:#e9e6de;--line:#dcd8cd;--text:#1c1b18;--muted:#66625a;--accent:#4553d6;--accent2:#0f766e;--ok:#15803d;--warn:#a16207;--bad:#b91c1c;--on-accent:#faf9f6;color-scheme:light}
:root[data-theme=dark]{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1280px;margin:0 auto;padding:0 24px}
@media (max-width:720px){.wrap{padding:0 20px}}
header{border-bottom:1px solid var(--line)}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:60px;gap:12px}
.logo{display:flex;align-items:center;gap:9px;font-weight:600;letter-spacing:-.035em;font-size:22px}
.logo svg{width:22px;height:22px;display:block}
.tools{display:flex;gap:8px;align-items:center}
.mono,code,.kicker,.badge{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
h1,h2{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:500;letter-spacing:-.015em;margin:0}
h1{font-size:34px;line-height:1.15}
h2{font-size:26px;line-height:1.2}
h3{font-size:15px;font-weight:600;margin:0}
.lead{color:var(--muted);font-size:12.5px;margin:0 0 14px;max-width:70ch}
.btn{font:inherit;font-size:14px;color:var(--text);background:transparent;border:1px solid var(--line);border-radius:3px;padding:8px 14px;cursor:pointer}
.btn:hover{border-color:var(--muted)}
.btn.primary{background:var(--text);color:var(--bg);border-color:var(--text)}
.btn.primary:hover{border-color:var(--text);opacity:.92}
.btn.small{padding:4px 10px;font-size:12.5px}
.btn:disabled{opacity:.45;cursor:default}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.shell{display:grid;grid-template-columns:170px minmax(0,1fr) 260px;gap:28px;align-items:start}
@media (max-width:960px){.shell{grid-template-columns:minmax(0,1fr);gap:0}}
.steps{list-style:none;margin:0;padding:32px 0 0;position:sticky;top:0;display:flex;flex-direction:column;gap:2px}
@media (max-width:960px){.steps{position:static;flex-direction:row;flex-wrap:wrap;padding:18px 0 0}.steps li{flex:1 1 130px}}
.steps li{display:flex;justify-content:space-between;gap:8px;padding:5px 8px;border:1px solid transparent;border-radius:3px;font-size:13px;color:var(--muted)}
.steps li.st-done{color:var(--text)}
.steps li.st-current{background:var(--panel);border-color:var(--line);color:var(--text)}
.steps .state{font:11.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
.steps li.st-done .state.ok{color:var(--ok)}
main{padding:32px 0 110px;min-width:0}
main h1{font-size:19px;line-height:1.3;margin:0 0 4px}
.proj{color:var(--muted);font-weight:400}
.kicker{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.log{background:var(--sunk);border:1px solid var(--line);border-radius:3px;padding:8px 10px;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}
.log .ln{display:flex;gap:8px;color:var(--muted)}
.log .ln .g{flex:none;width:1.2em;color:var(--muted)}
.log .ln.step{color:var(--text)}
.log .ln.step .g{color:var(--ok)}
.log .ln.flag{color:var(--warn)}
.log .ln.flag .g{color:var(--warn)}
.log .empty{color:var(--muted)}
.busy{margin:10px 0 0;color:var(--muted);font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.busy b{color:var(--accent2);font-weight:400}
.ask{margin-top:14px}
.ask h3{font-size:14px;margin-bottom:8px}
.ask .q{white-space:pre-wrap;margin:0 0 14px;color:var(--text)}
.choices{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.choices .btn{text-align:left}
.choices .key{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);margin-right:8px;font-size:12px}
.choices .btn.primary .key{color:inherit;opacity:.7}
.field{width:100%;font:inherit;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:3px;padding:8px 10px}
.count{color:var(--muted);font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.tag{font:10.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;border:1px solid var(--line);border-radius:3px;padding:0 5px;color:var(--muted);white-space:nowrap}
.tree{border:1px solid var(--line);border-radius:3px;background:var(--panel);max-height:calc(100vh - 330px);min-height:260px;overflow:auto}
.bar{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 10px;background:var(--panel)}
.bar .field{flex:1;min-width:140px;padding:4px 8px;font-size:12.5px;background:var(--bg)}
.bar .btn{color:var(--muted);padding:3px 8px;font-size:12px}
.group{border-top:1px solid var(--line)}
.grow{display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:13px}
.grow .fold{all:unset;cursor:pointer;width:14px;color:var(--muted);font-size:11px;text-align:center}
.grow label{flex:1;display:flex;gap:8px;align-items:center;cursor:pointer;font-weight:500;overflow-wrap:anywhere}
.item{display:flex;gap:8px;align-items:flex-start;padding:5px 10px 5px 36px;border-top:1px solid var(--line);font-size:13px;line-height:1.45;overflow-wrap:anywhere;cursor:pointer;color:var(--muted)}
.item span{white-space:pre-wrap}
.item.on{color:var(--text)}
.item:hover{color:var(--text)}
.bare .item{padding-left:10px}
input[type=checkbox]{accent-color:var(--accent);margin-top:3px;flex:none}
.actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.banner{margin-top:22px;border:1px solid var(--bad);border-radius:3px;padding:10px 14px;color:var(--bad)}
.notice{margin-top:22px;border:1px solid var(--line);border-radius:3px;padding:10px 14px;color:var(--muted)}
.sum{margin:0 0 6px;border:1px solid var(--line);border-radius:3px;background:var(--panel)}
.sum .r{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;padding:8px 12px;border-top:1px solid var(--line);font-size:13px}
.sum .r:first-child{border-top:0}
.sum .k{font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);padding-top:1px}
.sum p{margin:0;overflow-wrap:anywhere}
#summary{margin-top:22px}
#summary .kicker,#nextHead{margin:0 0 8px}
#nextHead{margin-top:26px}
.next{margin:0;padding:0;list-style:none;counter-reset:n}
.next li{display:grid;grid-template-columns:36px minmax(0,1fr);border-top:1px solid var(--line);padding:14px 0 8px;counter-increment:n}
.next .no::before{content:counter(n);font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);border:1px solid var(--line);border-radius:3px;padding:1px 7px}
.next h3{font-size:15px;margin:0 0 4px}
.next p{margin:6px 0;color:var(--text);max-width:72ch}
.next p.m{color:var(--muted)}
.next li.note{display:block;counter-increment:none;color:var(--muted)}
.next li.note h3{font-size:13px;color:var(--muted)}
.next li.note p{color:var(--muted);font-size:13px}
.cmdblock{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;padding:7px 8px 7px 12px;background:var(--panel);border:1px solid var(--line);border-radius:3px;max-width:72ch}
.cmdblock code{font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere;white-space:pre-wrap}
.cmdblock .pr{color:var(--accent2);margin-right:8px;user-select:none}
.ph{color:var(--accent)}
code.il{background:var(--panel);border:1px solid var(--line);border-radius:3px;padding:0 5px;font-size:12.5px}
code.cmd{background:var(--panel);border:1px solid var(--line);border-radius:3px;padding:1px 6px;font-size:12.5px;overflow-wrap:anywhere}
.copy{margin-left:6px}
.act{position:sticky;top:0;padding:32px 0 0}
.act .hd{display:flex;justify-content:space-between;margin-bottom:8px}
.act .hd .kicker{margin:0}
.act .log{height:calc(100vh - 215px);min-height:240px;overflow:auto}
@media (max-width:960px){.act{position:static;padding:0 0 110px}.act .log{height:260px}}
.foot{position:fixed;left:0;right:0;bottom:0;border-top:1px solid var(--line);background:var(--panel)}
.foot .wrap{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding-top:9px;padding-bottom:9px}
.foot .count{text-align:center;font-family:inherit;font-size:12.5px}
.foot .btn{justify-self:end}
.scene{margin-top:6px}
.pane{display:none;position:relative;overflow:hidden;min-height:200px;padding:12px;border:1px solid var(--muted);border-radius:3px;background:var(--panel)}
.scene[data-on=scan] .pane.scn,.scene[data-on=components] .pane.comp,.scene[data-on=patterns] .pane.pat,.scene[data-on=setup] .pane.set{display:block}
.pane .cap{display:flex;justify-content:space-between;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.sweep{position:absolute;top:0;bottom:0;left:0;width:2px;background:var(--accent2);animation:sweep 4.8s linear infinite}
@keyframes sweep{0%{left:0;opacity:1}69%{left:100%;opacity:1}70%,100%{left:100%;opacity:0}}
.scan-line{position:absolute;left:0;right:0;top:0;height:2px;background:var(--accent2);animation:down 4.8s linear infinite}
@keyframes down{0%{top:36px;opacity:1}88%{top:calc(100% - 4px);opacity:1}90%,100%{top:calc(100% - 4px);opacity:0}}
.trows{margin-top:12px;display:flex;flex-direction:column;gap:7px}
.tr{display:flex;align-items:center;gap:8px;height:12px;animation:read 4.8s infinite}
.tr i{display:block;height:6px;border-radius:2px;background:var(--line)}
.tr i.f{width:9px;height:9px;border:1px solid var(--muted);background:transparent;border-radius:2px}
.tr.d1{padding-left:16px}
.tr.d2{padding-left:32px}
.tr i.n{width:var(--w,40%)}
.tr em{margin-left:auto;font:10.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);font-style:normal;opacity:0;animation:count 4.8s infinite;animation-delay:inherit}
@keyframes read{0%{opacity:.35}6%,80%{opacity:1}96%,100%{opacity:.35}}
@keyframes count{0%,6%{opacity:0}14%,80%{opacity:1}96%,100%{opacity:0}}
.tr:nth-child(1){animation-delay:0s}.tr:nth-child(2){animation-delay:.3s}.tr:nth-child(3){animation-delay:.6s}.tr:nth-child(4){animation-delay:.9s}.tr:nth-child(5){animation-delay:1.2s}.tr:nth-child(6){animation-delay:1.5s}.tr:nth-child(7){animation-delay:1.8s}.tr:nth-child(8){animation-delay:2.1s}
.tr:nth-child(2) em{animation-delay:.3s}.tr:nth-child(4) em{animation-delay:.9s}.tr:nth-child(7) em{animation-delay:1.8s}
.cells{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;margin-top:12px}
.cell{position:relative;aspect-ratio:1.3;border:1px solid var(--line);border-radius:3px;animation:found 4.8s infinite}
.cell b{position:absolute;background:var(--line);border-radius:2px;animation:ink 4.8s infinite;animation-delay:inherit}
.cell.k0 b:nth-child(1){left:20%;right:20%;top:38%;bottom:38%}
.cell.k1 b:nth-child(1){left:18%;right:18%;top:32%;bottom:32%;background:transparent;border:1px solid var(--line)}
.cell.k2 b:nth-child(1){left:22%;width:18%;top:34%;height:32%;background:transparent;border:1px solid var(--line)}
.cell.k2 b:nth-child(2){left:48%;right:18%;top:46%;height:8%}
.cell.k3 b:nth-child(1){left:22%;right:22%;top:38%;bottom:38%}
.cell.k3 b:nth-child(2){left:24%;width:14%;top:30%;bottom:30%;background:var(--muted)}
.cell.k4 b:nth-child(1){left:14%;width:20%;top:46%;height:8%}
.cell.k4 b:nth-child(2){left:40%;width:20%;top:46%;height:8%}
.cell.k4 b:nth-child(3){left:66%;width:20%;top:46%;height:8%}
.cell.k5 b:nth-child(1){left:18%;width:32%;top:28%;height:16%}
.cell.k5 b:nth-child(2){left:18%;right:30%;top:56%;height:8%}
@keyframes found{0%{border-color:var(--line);background:transparent}4%,70%{border-color:var(--accent2);background:color-mix(in srgb,var(--accent2) 14%,transparent)}90%,100%{border-color:var(--line);background:transparent}}
@keyframes ink{0%{opacity:.5}4%,70%{opacity:1}90%,100%{opacity:.5}}
.cmeta{display:flex;justify-content:space-between;margin-top:12px;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
.cmeta .tag{animation:tag 4.8s infinite}
.pgroups{display:flex;flex-direction:column;gap:14px;margin-top:12px}
.pgroup{display:grid;grid-template-columns:repeat(3,1fr) 150px;gap:8px;align-items:center}
.pcard{display:flex;flex-direction:column;gap:5px;padding:6px;border:1px solid var(--line);border-radius:3px;animation:match 4.8s infinite}
.pgroup .pcard:nth-child(2){animation-delay:.6s}
.pgroup .pcard:nth-child(3){animation-delay:1.2s}
.pgroup.g2 .pcard{animation-delay:2.2s}
.pgroup.g2 .pcard:nth-child(2){animation-delay:2.8s}
.pgroup.g2 .pcard:nth-child(3){border-style:dashed;animation:none;opacity:.5}
.pcard i{display:block;background:var(--line);border-radius:2px;height:5px}
.pcard i.im{height:16px}
.pcard i.s{width:60%}
.pcard i.bt{width:40%;height:7px}
@keyframes match{0%{border-color:var(--line);background:transparent}6%,60%{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}80%,100%{border-color:var(--line);background:transparent}}
.pmatch{justify-self:end;opacity:0;animation:tag 4.8s infinite}
.pgroup.g2 .pmatch{animation-delay:2.4s}
@keyframes tag{0%,40%{opacity:0}52%,80%{opacity:1}92%,100%{opacity:0}}
.scenetext{margin:10px 0 0;font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
.scenetext b{color:var(--accent2);font-weight:400}
.sk{display:block;height:9px;border-radius:2px;background:var(--line);animation:pulse 1.6s ease-in-out infinite;animation-delay:var(--d,0s)}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.95}}
#sumSkel{margin-top:22px}
#sumSkel .kicker,#nextSkel .kicker{margin:0 0 8px}
#nextSkel .kicker{margin-top:26px}
.sum .r .sk{align-self:center}
.skstep{display:grid;grid-template-columns:36px minmax(0,1fr);border-top:1px solid var(--line);padding:14px 0 12px}
.skstep .no{width:22px;height:18px;border:1px solid var(--line);border-radius:3px}
.skstep .sk.t{height:12px;width:34%;margin:3px 0 12px}
.skstep .sk.l{width:78%;margin-bottom:12px}
.skstep .skcmd{height:34px;max-width:72ch;border:1px solid var(--line);border-radius:3px;background:var(--panel);display:flex;align-items:center;padding:0 12px;gap:10px}
.skstep .skcmd .sk{height:7px;width:62%}
.shell.wide{grid-template-columns:170px minmax(0,1fr)}
.shell.wide .act{display:none}
@media (max-width:960px){.shell.wide{grid-template-columns:minmax(0,1fr)}}
.rframe{display:block;width:100%;height:calc(100vh - 235px);min-height:480px;border:1px solid var(--line);border-radius:3px;background:var(--bg)}
.sheets{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
.sheet{padding:8px 10px 10px;border:1px solid var(--line);border-radius:3px;background:var(--bg)}
.sheet .th{display:flex;justify-content:space-between;font:10.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
.sheet .th b{font-weight:400;color:var(--accent2);opacity:0;animation:okmark 4.8s infinite;animation-delay:var(--d,0s)}
.sheet .ln{height:5px;margin-top:8px;border-radius:2px;background:var(--line);width:var(--w,80%);transform:scaleX(0);transform-origin:left;animation:typed 4.8s infinite;animation-delay:calc(var(--d,0s) + var(--k,0) * .32s)}
.sheet .ln.hl{background:var(--muted)}
@keyframes typed{0%{transform:scaleX(0);opacity:1}14%,84%{transform:scaleX(1);opacity:1}94%,100%{transform:scaleX(1);opacity:0}}
@keyframes okmark{0%,40%{opacity:0}48%,84%{opacity:1}94%,100%{opacity:0}}
.rail{position:relative;height:9px;margin-top:14px;border-top:1px dashed var(--muted)}
.rail i{position:absolute;top:-5px;left:0;width:9px;height:9px;border-radius:2px;background:var(--accent);animation:flow 4.8s ease-in-out infinite}
@keyframes flow{0%{left:0;opacity:1}85%{left:calc(100% - 9px);opacity:1}95%,100%{left:calc(100% - 9px);opacity:0}}
.railcap{display:flex;justify-content:space-between;margin-top:6px;font:10.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
@media (prefers-reduced-motion:reduce){.sk{animation:none;opacity:.7}.sheet .ln,.sheet .th b,.rail i{animation:none}.sheet .ln{transform:none}.sheet .th b{opacity:1}.rail i{display:none}.cell,.cell:before,.pcard,.sweep,.scan-line,.tr,.tr em,.pmatch,.cmeta .tag{animation:none}.tr em,.pmatch{opacity:1}.cell{border-color:var(--accent2)}.pcard{border-color:var(--accent)}.sweep,.scan-line{display:none}}
.fin{padding:12px;border:1px solid var(--muted);border-radius:3px;background:var(--panel);margin-top:6px}
.fin .cap{display:flex;justify-content:space-between;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.pg{height:8px;margin-top:12px;border:1px solid var(--line);border-radius:3px;overflow:hidden;background:var(--sunk)}
.pg i{display:block;height:100%;width:0;background:var(--accent2);transition:width .35s ease}
.fl{list-style:none;margin:12px 0 0;padding:0;font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.fl li{display:flex;gap:8px;padding:3px 0;color:var(--muted)}
.fl li.now{color:var(--text)}
.fl li .g{flex:none;width:1.2em}
.fl li.ok .g{color:var(--ok)}
.fl li.now .g{color:var(--accent2)}
@media (prefers-reduced-motion:reduce){.pg i{transition:none}}
.sr{position:absolute;left:-9999px}
</style>
</head>
<body>
<header><div class="wrap">
<div class="logo"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="26" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="6.5" y="16.5" width="9" height="9" fill="#7c8cff"/></svg><span>invariant</span><span class="proj" id="proj"></span></div>
<div class="tools"><button class="btn small" id="theme" type="button" aria-label="Switch between light and dark"></button><button class="btn small" id="restart" type="button">Start over</button><button class="btn small" id="stop" type="button">Stop setup</button></div>
</div></header>
<div class="wrap shell">
<ol class="steps" id="steps" aria-label="Setup steps"></ol>
<main>
<h1 id="title"></h1>
<p class="lead" id="lead"></p>
<div id="banner"></div>
<div id="scene" hidden aria-hidden="true">
<div class="scene" id="sceneGrid" data-on="scan">
<div class="pane scn"><div class="cap"><span>Scan</span><span>reading every folder</span></div><div class="trows"><div class="tr"><i class="f"></i><i class="n" style="--w:30%"></i></div><div class="tr"><i class="f"></i><i class="n" style="--w:46%"></i><em>12 files</em></div><div class="tr d1"><i class="f"></i><i class="n" style="--w:38%"></i></div><div class="tr d1"><i class="f"></i><i class="n" style="--w:52%"></i><em>31 files</em></div><div class="tr d2"><i class="f"></i><i class="n" style="--w:34%"></i></div><div class="tr d2"><i class="f"></i><i class="n" style="--w:44%"></i></div><div class="tr"><i class="f"></i><i class="n" style="--w:40%"></i><em>96 files</em></div><div class="tr d1"><i class="f"></i><i class="n" style="--w:28%"></i></div></div><div class="scan-line"></div></div>
<div class="pane comp"><div class="cap"><span>Components</span><span>finding the UI parts</span></div><div class="cells" id="cells"></div><div class="cmeta"><span>buttons, inputs, toggles, tabs, badges</span><span class="tag">matches your exports</span></div><div class="sweep"></div></div>
<div class="pane pat"><div class="cap"><span>Patterns</span><span>finding what repeats</span></div><div class="pgroups"><div class="pgroup"><div class="pcard"><i class="im"></i><i></i><i class="s"></i><i class="bt"></i></div><div class="pcard"><i class="im"></i><i></i><i class="s"></i><i class="bt"></i></div><div class="pcard"><i class="im"></i><i></i><i class="s"></i><i class="bt"></i></div><span class="tag pmatch">&times;3 same structure</span></div><div class="pgroup g2"><div class="pcard"><i class="im"></i><i></i><i class="s"></i><i class="bt"></i></div><div class="pcard"><i class="im"></i><i></i><i class="s"></i><i class="bt"></i></div><div class="pcard"><i class="im"></i><i></i><i class="s"></i><i class="bt"></i></div><span class="tag pmatch">&times;2 same structure</span></div></div></div>
<div class="pane set"><div class="cap"><span>Setting things up</span><span>drafting your plan</span></div><div class="sheets"><div class="sheet" style="--d:0s"><div class="th"><span>config</span><b>&#10003;</b></div><div class="ln hl" style="--w:48%;--k:0"></div><div class="ln" style="--w:86%;--k:1"></div><div class="ln" style="--w:70%;--k:2"></div><div class="ln" style="--w:78%;--k:3"></div><div class="ln" style="--w:56%;--k:4"></div></div><div class="sheet" style="--d:0.9s"><div class="th"><span>patterns</span><b>&#10003;</b></div><div class="ln hl" style="--w:40%;--k:0"></div><div class="ln" style="--w:82%;--k:1"></div><div class="ln" style="--w:64%;--k:2"></div><div class="ln" style="--w:88%;--k:3"></div><div class="ln" style="--w:52%;--k:4"></div></div><div class="sheet" style="--d:1.8s"><div class="th"><span>checks</span><b>&#10003;</b></div><div class="ln hl" style="--w:52%;--k:0"></div><div class="ln" style="--w:74%;--k:1"></div><div class="ln" style="--w:90%;--k:2"></div><div class="ln" style="--w:60%;--k:3"></div><div class="ln" style="--w:68%;--k:4"></div></div></div><div class="rail"><i></i></div><div class="railcap"><span>what you confirmed</span><span>the plan</span></div></div>
</div>
<p class="scenetext" id="sceneText"></p>
</div>
<div id="finScene" hidden>
<div class="fin"><div class="cap"><span>Finalizing</span><span id="finCount"></span></div>
<div class="pg" id="finBar" role="progressbar" aria-label="Finalizing setup" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="finFill"></i></div>
<ul class="fl" id="finList"></ul>
</div>
<p class="scenetext" id="finText"></p>
</div>
<div id="ask"></div>
<div id="summary" hidden></div>
<div id="sumSkel" hidden role="status" aria-live="polite"><span class="sr">Preparing your summary</span><p class="kicker">What setup did</p><div class="sum"><div class="r"><span class="sk" style="width:70px;--d:0.0s"></span><span class="sk" style="width:46%;--d:0.0s"></span></div><div class="r"><span class="sk" style="width:62px;--d:0.1s"></span><span class="sk" style="width:70%;--d:0.1s"></span></div><div class="r"><span class="sk" style="width:40px;--d:0.3s"></span><span class="sk" style="width:34%;--d:0.3s"></span></div><div class="r"><span class="sk" style="width:66px;--d:0.4s"></span><span class="sk" style="width:58%;--d:0.4s"></span></div><div class="r"><span class="sk" style="width:52px;--d:0.6s"></span><span class="sk" style="width:82%;--d:0.6s"></span></div></div></div>
<p class="kicker" id="nextHead" hidden>What to do next</p>
<ol class="next" id="next" hidden></ol>
<div id="nextSkel" hidden aria-hidden="true"><p class="kicker">What to do next</p><ul style="list-style:none;margin:0;padding:0"><li class="skstep"><span class="no sk" style="--d:0.0s"></span><div><span class="sk t" style="--d:0.0s"></span><span class="sk l" style="--d:0.0s"></span><span class="skcmd"><span class="sk" style="--d:0.0s"></span></span></div></li><li class="skstep"><span class="no sk" style="--d:0.2s"></span><div><span class="sk t" style="--d:0.2s"></span><span class="sk l" style="--d:0.2s"></span><span class="skcmd"><span class="sk" style="--d:0.2s"></span></span></div></li><li class="skstep"><span class="no sk" style="--d:0.4s"></span><div><span class="sk t" style="--d:0.4s"></span><span class="sk l" style="--d:0.4s"></span><span class="skcmd"><span class="sk" style="--d:0.4s"></span></span></div></li></ul></div>
<div id="notice"></div>
</main>
<aside class="act" aria-label="Activity">
<div class="hd"><span class="kicker">Activity</span><span class="kicker" id="live"></span></div>
<div class="log" id="log" aria-live="polite"></div>
<p class="busy" id="busy" hidden></p>
</aside>
</div>
<div class="foot" id="foot" hidden><div class="wrap" id="footin"></div></div>
<script>
(function () {
  var token = new URLSearchParams(location.search).get("t") || "";
  var STEPS = [["scan", "Scan"], ["components", "Components"], ["patterns", "Patterns"], ["plan", "Plan"], ["review", "Review"], ["done", "Done"]];
  var COPY = {
    scan: ["Scanning your project", "Setup reads every folder. Dependencies, build output and .gitignore entries are skipped."],
    components: ["Choose the design system's components", "Every component setup found is listed, grouped by directory. Tick the ones that belong to your design system."],
    patterns: ["Choose the patterns", "Patterns are structures that recur where your components are used. They stay proposals until you approve them."],
    plan: ["Apply the setup", "One plan. Yes confirms the contract and does everything in it."],
    review: ["Review what needs a decision", "Conflicts between sources and facts nobody has confirmed. Nothing inferred or conflicting becomes authoritative until you decide it. Skip any of them: they stay in the queue."],
    done: ["Setup finished", "Here is what setup did, and what to do next."]
  };
  function fresh() { return { phase: "scan", counts: {}, live: null, logs: {}, busy: null, ask: null, next: [], summary: [], ended: false, error: null, stopped: false, lost: false, widget: null, restarting: false, applying: false, componentsDone: false, patternsDone: false, sawReview: false, reviewPending: 0, progress: { done: 0, total: 0 }, stages: [] }; }
  var state = fresh();

  function h(tag, props, kids) {
    var e = document.createElement(tag);
    for (var k in props || {}) {
      var v = props[k];
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, "");
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    (kids || []).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function post(path, body) {
    return fetch(path + "?t=" + encodeURIComponent(token), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  }

  // Theme: follows the system, and the button overrides it (stored as localStorage "theme").
  var root = document.documentElement;
  function theme() { return root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"); }
  try { var saved = localStorage.getItem("theme"); if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved); } catch (e) {}
  function paintTheme() { $("theme").textContent = theme() === "light" ? "\\u263E" : "\\u2600"; }
  $("theme").addEventListener("click", function () {
    var next = theme() === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
    paintTheme();
  });
  paintTheme();
  $("stop").addEventListener("click", function () {
    if (state.ended || state.stopped) return;
    state.stopped = true; state.ask = null; state.widget = null;
    post("/api/stop");
    render();
  });

  var armed = null;
  $("restart").addEventListener("click", function () {
    if (state.ended || state.stopped || state.restarting) return;
    var b = $("restart");
    if (!armed) {
      b.textContent = "Start over? Click again";
      armed = setTimeout(function () { armed = null; b.textContent = "Start over"; }, 4000);
      return;
    }
    clearTimeout(armed); armed = null; b.textContent = "Start over";
    state.restarting = true; state.ask = null; state.widget = null; state.live = null;
    post("/api/restart");
    render();
  });

  // The step shown: it moves on when the person confirms the last thing in a step, before setup reports the next one.
  function current() {
    if (state.ended) return "done";
    if (!state.ask) {
      if (state.phase === "components" && state.componentsDone) return "patterns";
      if (state.phase === "patterns" && state.patternsDone) return "plan";
    }
    return state.phase;
  }

  function renderSteps() {
    var cur = STEPS.map(function (s) { return s[0]; }).indexOf(current());
    var list = $("steps"); clear(list);
    STEPS.forEach(function (s, i) {
      var status = state.ended || i < cur ? "done" : i === cur ? "current" : "next";
      var count = status === "current" ? (state.stopped ? "stopped" : state.live) : status === "done" ? state.counts[s[0]] : null;
      if (s[0] === "review" && status === "done" && !state.sawReview) count = "none";
      var done = status === "done" && count == null;
      list.appendChild(h("li", { class: "st-" + status, "aria-current": status === "current" ? "step" : false }, [
        h("span", { text: (i + 1) + " " + s[1] }),
        count != null ? h("span", { class: "state", text: String(count) }) : done ? h("span", { class: "state ok", "aria-label": "done", text: "\\u2713" }) : null
      ]));
    });
  }

  function addLine(parent, kind, text) {
    var glyph = kind === "step" ? "\\u2713" : kind === "flag" ? "\\u25B2" : "\\u00B7";
    parent.appendChild(h("div", { class: "ln " + kind }, [h("span", { class: "g", text: glyph }), h("span", { text: text })]));
  }

  var COMMAND = /npx @invariant-ui\\/cli@[0-9.]+(?: [^\\s(][^\\s]*)*/;
  function copy(text, btn) {
    function ok() { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { btn.textContent = "Press Ctrl+C"; });
    else btn.textContent = "Press Ctrl+C";
  }
  var INSTALL = /npm install -g @[\\w.\\/-]+/;
  function find(text) {
    var a = COMMAND.exec(text), b = INSTALL.exec(text);
    return a && b ? (a.index <= b.index ? a : b) : a || b;
  }
  // Text with code spans (between backticks) put into a parent.
  function rich(parent, text) {
    text.split(/\\u0060([^\\u0060]+)\\u0060/).forEach(function (part, i) {
      if (i % 2 === 1) parent.appendChild(h("code", { class: "il", text: part }));
      else if (part) parent.appendChild(document.createTextNode(part));
    });
    return parent;
  }
  function holders(parent, cmd) {
    cmd.split(/(<[^>]+>)/).forEach(function (part, i) {
      if (!part) return;
      if (i % 2 === 1) parent.appendChild(h("span", { class: "ph", text: part }));
      else parent.appendChild(document.createTextNode(part));
    });
    return parent;
  }
  function trimCmd(m) { return m[0].replace(/[.,;]+$/, ""); }
  // A command inside a sentence, with a small Copy button after it.
  function inline(text) {
    var p = h("p", {});
    var m = find(text);
    if (!m) return rich(p, text);
    var cmd = trimCmd(m);
    rich(p, text.slice(0, m.index));
    p.appendChild(holders(h("code", { class: "cmd" }), cmd));
    var b = h("button", { class: "btn small copy", type: "button", text: "Copy", onclick: function () { copy(cmd, b); } });
    p.appendChild(b);
    rich(p, text.slice(m.index + cmd.length));
    return p;
  }
  // A command on its own: the sentence, then a code block with a prompt and a Copy button, then what follows.
  function line(text) {
    var m = find(text);
    if (!m) return rich(h("p", {}), text);
    var cmd = trimCmd(m);
    var before = text.slice(0, m.index).replace(/\\s+$/, "");
    var after = text.slice(m.index + cmd.length).replace(/^[\\s.,;]+|[\\s]+$/g, "");
    var box = h("div", {});
    if (before) box.appendChild(rich(h("p", {}), before));
    var b = h("button", { class: "btn small", type: "button", text: "Copy", onclick: function () { copy(cmd, b); } });
    box.appendChild(h("div", { class: "cmdblock" }, [h("span", {}, [h("span", { class: "pr", text: "$" }), holders(h("code", {}), cmd)]), b]));
    if (after) box.appendChild(rich(h("p", { class: "m" }), after));
    return box;
  }

  // ---- questions ----
  function groupsOf(ask) {
    if (ask.kind === "tree") return ask.groups;
    return [{ label: "", bare: true, collapsed: false, items: ask.options }];
  }
  function newWidget(ask) {
    if (ask.kind === "select" || ask.kind === "prompt" || ask.kind === "review") return { text: "" };
    var ticked = {}, folded = {}, total = 0;
    groupsOf(ask).forEach(function (g, gi) {
      folded[gi] = !!g.collapsed && !g.bare;
      g.items.forEach(function (it) { total++; if (it.ticked) ticked[it.value] = true; });
    });
    return { ticked: ticked, folded: folded, filter: "", total: total };
  }
  function tickedCount(w) { return Object.keys(w.ticked).length; }
  function answer(value) {
    var id = state.ask.id;
    if (state.ask.kind === "tree" || state.ask.kind === "multiselect") state.counts[state.phase] = value.length;
    if (state.phase === "plan") state.applying = true;
    // The components are settled once the last confirmation is given; the patterns once their list is confirmed.
    if (state.phase === "components" && state.ask.kind === "select" && value === "confirm") state.componentsDone = true;
    if (state.phase === "patterns" && state.ask.kind === "tree") state.patternsDone = true;
    state.ask = null; state.widget = null; state.live = null; state.busy = "Working";
    post("/api/answer", { id: id, value: value });
    render();
  }

  function renderSelect(box, ask) {
    var wrap = h("div", { class: "choices" });
    ask.choices.forEach(function (c, i) {
      var label = [c.key ? h("span", { class: "key", text: c.key }) : null, c.label];
      wrap.appendChild(h("button", { class: "btn" + (i === 0 ? " primary" : ""), type: "button", onclick: function () { answer(c.value); } }, label));
    });
    box.appendChild(wrap);
    var first = wrap.querySelector("button"); if (first) first.focus();
  }
  function renderPrompt(box, ask, w) {
    var input = h("input", { class: "field", type: "text", "aria-label": "Your answer", value: w.text });
    input.addEventListener("input", function () { w.text = input.value; });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") answer(input.value); });
    box.appendChild(input);
    box.appendChild(h("div", { class: "actions" }, [h("button", { class: "btn primary", type: "button", text: "Continue", onclick: function () { answer(input.value); } })]));
    input.focus();
  }
  var VERB = { components: " components will be compiled", patterns: " patterns will be approved" };
  function renderList(box, ask, w) {
    var groups = groupsOf(ask);
    var filter = h("input", { class: "field", type: "search", placeholder: "Filter by name or path", "aria-label": "Filter the list", value: w.filter });
    var tally = h("span", { class: "tag" });
    var sentence = h("span", { class: "count" });
    var foot = $("footin");
    var tree = h("div", { class: "tree" + (groups.length === 1 && groups[0].bare ? " bare" : "") });
    var body = h("div", {});
    function shown(it) { return !w.filter || it.label.toLowerCase().indexOf(w.filter.toLowerCase()) >= 0; }
    function setMany(on, onlyShown) {
      groups.forEach(function (g) { g.items.forEach(function (it) { if (!onlyShown || shown(it)) { if (on) w.ticked[it.value] = true; else delete w.ticked[it.value]; } }); });
      paint();
    }
    function paint() {
      clear(body);
      var any = false;
      groups.forEach(function (g, gi) {
        var items = g.items.filter(shown);
        if (!items.length) return;
        any = true;
        var open = g.bare || !w.folded[gi] || !!w.filter;
        var box2 = h("div", { class: "group" });
        if (!g.bare) {
          var on = g.items.filter(function (it) { return w.ticked[it.value]; }).length;
          var cb = h("input", { type: "checkbox", "aria-label": "Tick every item in " + g.label });
          cb.checked = on === g.items.length; cb.indeterminate = on > 0 && on < g.items.length;
          cb.addEventListener("change", function () { g.items.forEach(function (it) { if (cb.checked) w.ticked[it.value] = true; else delete w.ticked[it.value]; }); paint(); });
          box2.appendChild(h("div", { class: "grow" }, [
            h("button", { class: "fold", type: "button", "aria-expanded": open ? "true" : "false", "aria-label": open ? "Fold" : "Unfold", text: open ? "\\u25BE" : "\\u25B8", onclick: function () { w.folded[gi] = !w.folded[gi]; paint(); } }),
            h("label", {}, [cb, h("span", { text: g.label })]),
            h("span", { class: "tag", text: on + " of " + g.items.length })
          ]));
        }
        if (open) items.forEach(function (it) {
          var c = h("input", { type: "checkbox" }); c.checked = !!w.ticked[it.value];
          c.addEventListener("change", function () { if (c.checked) w.ticked[it.value] = true; else delete w.ticked[it.value]; paint(); });
          box2.appendChild(h("label", { class: "item" + (c.checked ? " on" : "") }, [c, h("span", { text: it.label })]));
        });
        body.appendChild(box2);
      });
      if (!any) body.appendChild(h("div", { class: "item", text: "Nothing matches the filter." }));
      var n = tickedCount(w);
      tally.textContent = n + " of " + w.total;
      sentence.textContent = n + (VERB[state.phase] || " selected");
      confirm.textContent = "Confirm " + n;
      state.live = n + " of " + w.total;
      renderSteps();
    }
    var confirm = h("button", { class: "btn primary", type: "button", onclick: function () { answer(Object.keys(w.ticked)); } });
    filter.addEventListener("input", function () { w.filter = filter.value; paint(); });
    tree.appendChild(h("div", { class: "bar" }, [
      filter,
      tally,
      h("button", { class: "btn small", type: "button", text: "Tick all", onclick: function () { setMany(true, !!w.filter); } }),
      h("button", { class: "btn small", type: "button", text: "Clear", onclick: function () { setMany(false, !!w.filter); } }),
      ask.kind === "tree" ? h("button", { class: "btn small", type: "button", text: "Fold all", onclick: function () { groups.forEach(function (g, gi) { w.folded[gi] = !g.bare; }); paint(); } }) : null,
      ask.kind === "tree" ? h("button", { class: "btn small", type: "button", text: "Unfold all", onclick: function () { for (var k in w.folded) w.folded[k] = false; paint(); } }) : null
    ]));
    tree.appendChild(body);
    box.appendChild(tree);
    foot.appendChild(h("span", {})); foot.appendChild(sentence); foot.appendChild(confirm);
    $("foot").hidden = false;
    paint();
  }

  (function () {
    var cells = $("cells");
    for (var i = 0; i < 24; i++) {
      var e = h("i", { class: "cell k" + (i * 5 % 6) });
      e.style.animationDelay = ((i % 8) * 0.4 + Math.floor(i / 8) * 0.1) + "s";
      for (var j = 0; j < [1, 1, 2, 2, 3, 2][(i * 5) % 6]; j++) e.appendChild(h("b", {}));
      cells.appendChild(e);
    }
  })();
  function renderFinalizing() {
    // After the plan is confirmed, setup writes files, compiles and connects tools, which can take a while.
    var show = state.applying && !state.ask && !state.ended && !state.stopped && !state.restarting && state.phase === "plan";
    $("finScene").hidden = !show;
    if (!show) return;
    var pr = state.progress;
    var pct = pr.total > 0 ? Math.min(100, Math.round(pr.done / pr.total * 100)) : 0;
    $("finFill").style.width = pct + "%";
    $("finBar").setAttribute("aria-valuenow", String(pct));
    $("finCount").textContent = pr.total > 0 ? pr.done + " of " + pr.total + " \u00B7 " + pct + "%" : "";
    var list = $("finList"); clear(list);
    var from = Math.max(0, state.stages.length - 5);
    state.stages.slice(from).forEach(function (label, k) {
      var i = from + k, ok = i < pr.done;
      list.appendChild(h("li", { class: ok ? "ok" : "now" }, [h("span", { class: "g", text: ok ? "\u2713" : "\u25CF" }), h("span", { text: label })]));
    });
    var t = $("finText"); clear(t);
    t.appendChild(h("b", { text: "\u25CF " }));
    t.appendChild(document.createTextNode(state.busy || "Working"));
  }
  function renderScene() {
    renderFinalizing();
    // One scene per piece of work: what is being read, found, found again, and then planned.
    var scene = null;
    if (state.phase === "scan") scene = "scan";
    else if (state.phase === "components") scene = state.componentsDone ? "patterns" : "components";
    else if (state.phase === "patterns") scene = state.patternsDone ? "setup" : "patterns";
    else if (state.phase === "plan" && !state.applying) scene = "setup";
    var show = !state.ask && !state.ended && !state.stopped && scene !== null;
    $("scene").hidden = !show;
    if (!show) return;
    $("sceneGrid").setAttribute("data-on", scene);
    var t = $("sceneText"); clear(t);
    t.appendChild(h("b", { text: "\u25CF " }));
    t.appendChild(document.createTextNode(state.busy || "Working"));
  }

  // The review of conflicts is the review page in a frame of this page (same origin). Drawing this page again must not
  // reload it, so while that question is open the frame is left alone.
  var reviewNote = null;
  function paintReviewNote() {
    if (!reviewNote) return;
    var n = state.reviewPending;
    reviewNote.textContent = n > 0 ? n + " decision" + (n === 1 ? "" : "s") + " recorded but not applied. Press Apply in the review first, or they apply at the next compile." : "Decide what you want now. Whatever you leave stays in the queue: run review list later.";
  }
  function renderReview(panel, ask) {
    var frame = h("iframe", { class: "rframe", title: "Review what needs a decision", src: "/review?embed=1&t=" + encodeURIComponent(token) });
    panel.appendChild(frame);
    window.addEventListener("message", function (e) {
      if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
      var d = e.data;
      if (d && d.invariantReview && typeof d.invariantReview.pending === "number") { state.reviewPending = d.invariantReview.pending; paintReviewNote(); }
    });
    reviewNote = h("span", { class: "count" });
    paintReviewNote();
    var foot = $("footin");
    foot.appendChild(h("span", {})); foot.appendChild(reviewNote);
    foot.appendChild(h("button", { class: "btn primary", type: "button", text: "Continue to the summary", onclick: function () { answer("continue"); } }));
    $("foot").hidden = false;
  }
  function renderAsk() {
    var keep = $("ask").firstChild;
    if (state.ask && state.ask.kind === "review" && keep && keep.getAttribute("data-ask") === state.ask.id) return;
    var box = $("ask"); clear(box);
    clear($("footin")); $("foot").hidden = true;
    var ask = state.ask;
    if (!ask) return;
    if (!state.widget) state.widget = newWidget(ask);
    var lines = ask.question.split("\\n");
    // The review says what it is in the step title; its frame needs no second heading.
    var panel = h("section", { class: "ask", "aria-label": "Question", "data-ask": ask.id }, [ask.kind === "review" ? null : h("h3", { text: lines[0] })]);
    if (lines.length > 1) panel.appendChild(h("p", { class: "q", text: lines.slice(1).join("\\n") }));
    box.appendChild(panel);
    if (ask.kind === "review") renderReview(panel, ask);
    else if (ask.kind === "select") renderSelect(panel, ask);
    else if (ask.kind === "prompt") renderPrompt(panel, ask, state.widget);
    else renderList(panel, ask, state.widget);
  }

  function render() {
    renderSteps();
    var v = current(), c = COPY[v] || COPY.scan;
    $("title").textContent = c[0]; $("lead").textContent = c[1];
    $("live").textContent = state.ended || state.stopped ? "" : "\\u25CF live";
    var log = $("log"); clear(log);
    var any = false;
    STEPS.forEach(function (s) {
      (state.logs[s[0]] || []).forEach(function (l) { any = true; addLine(log, l.kind, l.text); });
    });
    if (!any) log.appendChild(h("div", { class: "empty", text: "Nothing to show yet." }));
    if (state.ask) log.appendChild(h("div", { class: "empty", text: "waiting for your choice\u2026" }));
    log.scrollTop = log.scrollHeight;
    var busy = $("busy");
    if (state.busy && !state.stopped && !state.ended) { busy.hidden = false; clear(busy); busy.appendChild(h("b", { text: "\\u25CF " })); busy.appendChild(document.createTextNode(state.busy)); } else busy.hidden = true;
    var banner = $("banner"); clear(banner);
    if (state.error) banner.appendChild(h("div", { class: "banner", role: "alert", text: state.error }));
    $("stop").hidden = state.ended || state.stopped;
    $("restart").hidden = state.ended || state.stopped || state.phase === "review" || state.phase === "done";
    document.querySelector(".shell").classList.toggle("wide", !!(state.ask && state.ask.kind === "review"));
    $("restart").disabled = state.restarting;
    var notice = $("notice"); clear(notice);
    if (state.restarting && !state.ended) notice.appendChild(h("div", { class: "notice", text: "Starting over. Setup finishes what it is doing, removes what it wrote so far, then scans again." }));
    else if (state.stopped) notice.appendChild(h("div", { class: "notice", text: "Setup stopped. Nothing more will change. You can close this tab." }));
    else if (state.ended && !state.error) notice.appendChild(h("div", { class: "notice", text: "Setup is finished. You can close this tab." }));
    else if (state.lost) notice.appendChild(h("div", { class: "notice", text: "The setup process is no longer running. Return to your terminal." }));
    var summary = $("summary"); clear(summary);
    if (v === "done" && state.summary.length) {
      summary.hidden = false;
      summary.appendChild(h("p", { class: "kicker", text: "What setup did" }));
      var table = h("div", { class: "sum" });
      state.summary.forEach(function (r) { table.appendChild(h("div", { class: "r" }, [h("span", { class: "k", text: r.label }), inline(r.text)])); });
      summary.appendChild(table);
    } else summary.hidden = true;
    var next = $("next"); clear(next);
    var showNext = v === "done" && state.next.length > 0;
    next.hidden = !showNext; $("nextHead").hidden = !showNext;
    // On the last step the summary and the next steps arrive a little after the step starts: hold their places.
    var waiting = v === "done" && !state.ended && !state.stopped && !state.error;
    $("sumSkel").hidden = !(waiting && state.summary.length === 0);
    $("nextSkel").hidden = !(waiting && state.next.length === 0);
    if (showNext) state.next.forEach(function (n) {
      var note = n.title === "About these commands";
      var body = h("div", {}, [h("h3", { text: n.title })].concat(n.lines.map(line)));
      next.appendChild(note ? h("li", { class: "note" }, [body]) : h("li", {}, [h("span", { class: "no", "aria-hidden": "true" }), body]));
    });
    renderScene();
    renderAsk();
  }

  function on(e) {
    if (e.type === "phase" && e.id === "review") state.sawReview = true;
    if (e.type === "project") $("proj").textContent = " / " + e.name;
    else if (e.type === "reset") state = fresh();
    else if (e.type === "phase") { state.phase = e.id; state.live = null; }
    else if (e.type === "log") { (state.logs[state.phase] = state.logs[state.phase] || []).push({ kind: e.kind, text: e.text }); state.busy = null; }
    else if (e.type === "busy") state.busy = e.text;
    else if (e.type === "next") state.next.push({ title: e.title, lines: e.lines });
    else if (e.type === "summary") state.summary = e.rows;
    else if (e.type === "progress") {
      state.progress = { done: e.done, total: e.total };
      if (e.label !== "Starting") state.stages[e.done] = e.label;
    }
    else if (e.type === "ask") { state.ask = e; state.widget = null; state.busy = null; }
    else if (e.type === "answered") { if (state.ask && state.ask.id === e.id) { if (state.phase === "plan") state.applying = true; state.ask = null; state.widget = null; } }
    else if (e.type === "done") { state.ended = true; state.busy = null; state.ask = null; }
    else if (e.type === "error") state.error = e.message;
  }

  var source = new EventSource("/api/events?t=" + encodeURIComponent(token));
  var pending = null;
  source.onmessage = function (m) {
    try { on(JSON.parse(m.data)); } catch (err) { return; }
    // Several events often arrive together; draw once.
    if (!pending) pending = setTimeout(function () { pending = null; render(); }, 30);
  };
  source.onerror = function () { if (!state.ended && source.readyState === 2) { state.lost = true; render(); } };
  document.addEventListener("keydown", function (e) {
    if (!state.ask || state.ask.kind !== "select" || e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
    state.ask.choices.forEach(function (c) { if (c.key && c.key === e.key) answer(c.value); });
  });
  render();
})();
</script>
</body>
</html>
`
