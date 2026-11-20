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
.scene{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px}
@media (max-width:640px){.scene{grid-template-columns:1fr}}
.pane{position:relative;overflow:hidden;min-height:176px;padding:12px;border:1px solid var(--line);border-radius:3px;background:var(--panel);opacity:.5;transition:opacity .3s}
.scene[data-on=both] .pane,.scene[data-on=components] .pane.comp,.scene[data-on=patterns] .pane.pat{opacity:1;border-color:var(--muted)}
.pane .cap{display:flex;justify-content:space-between;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.sweep{position:absolute;top:0;bottom:0;left:0;width:2px;background:var(--accent2);animation:sweep 4.8s linear infinite}
@keyframes sweep{0%{left:0;opacity:1}69%{left:100%;opacity:1}70%,100%{left:100%;opacity:0}}
.cells{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:12px}
.cell{position:relative;aspect-ratio:1;border:1px solid var(--line);border-radius:3px;animation:found 4.8s infinite}
.cell:after{content:"";position:absolute;left:20%;right:36%;top:46%;height:2px;background:var(--line);border-radius:1px}
@keyframes found{0%{border-color:var(--line);background:transparent}4%,70%{border-color:var(--accent2);background:color-mix(in srgb,var(--accent2) 16%,transparent)}90%,100%{border-color:var(--line);background:transparent}}
.pcards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.pcard{display:flex;flex-direction:column;gap:5px;padding:6px;border:1px solid var(--line);border-radius:3px;animation:match 4.8s infinite}
.pcard:nth-child(2){animation-delay:.7s}
.pcard:nth-child(3){animation-delay:1.4s}
.pcard i{display:block;background:var(--line);border-radius:2px;height:5px}
.pcard i.im{height:22px}
.pcard i.s{width:60%}
.pcard i.bt{width:40%;height:7px}
@keyframes match{0%{border-color:var(--line);background:transparent}6%,72%{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}92%,100%{border-color:var(--line);background:transparent}}
.plist{display:flex;gap:8px;align-items:center;margin-top:10px;padding:6px;border:1px solid var(--line);border-radius:3px;opacity:.6}
.plist i{display:block;background:var(--line);border-radius:2px;height:5px}
.plist .av{width:16px;height:16px;border-radius:50%}
.plist span{display:flex;flex-direction:column;gap:4px;flex:1}
.plist span i.s{width:50%}
.pmatch{position:absolute;right:12px;bottom:10px;animation:tag 4.8s infinite}
@keyframes tag{0%,50%{opacity:0}62%,88%{opacity:1}100%{opacity:0}}
.scenetext{margin:10px 0 0;font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
.scenetext b{color:var(--accent2);font-weight:400}
@media (prefers-reduced-motion:reduce){.cell,.pcard,.sweep,.pmatch{animation:none}.cell{border-color:var(--accent2)}.pcard{border-color:var(--accent)}.sweep{display:none}}
.fin{position:relative;overflow:hidden;padding:12px;border:1px solid var(--muted);border-radius:3px;background:var(--panel);margin-top:6px}
.fin .cap{display:flex;justify-content:space-between;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.frow{display:grid;grid-template-columns:96px 1fr 16px;gap:12px;align-items:center;margin-top:14px;font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--text)}
.fbar{position:relative;height:8px;border:1px solid var(--line);border-radius:3px;overflow:hidden;background:var(--sunk)}
.fbar i{display:block;height:100%;background:var(--accent2);transform:scaleX(0);transform-origin:left;animation:fill 4.8s infinite}
.fbar:after{content:"";position:absolute;top:0;bottom:0;width:2px;background:var(--text);opacity:.5;left:0;animation:head 4.8s infinite;animation-delay:inherit}
.fok{color:var(--ok);opacity:0;animation:fok 4.8s infinite}
.frow:nth-child(3) .fbar i,.frow:nth-child(3) .fbar:after,.frow:nth-child(3) .fok{animation-delay:.9s}
.frow:nth-child(4) .fbar i,.frow:nth-child(4) .fbar:after,.frow:nth-child(4) .fok{animation-delay:1.8s}
.frow:nth-child(2) .fbar i,.frow:nth-child(2) .fbar:after,.frow:nth-child(2) .fok{animation-delay:0s}
@keyframes fill{0%{transform:scaleX(0);opacity:1}30%,86%{transform:scaleX(1);opacity:1}94%,100%{transform:scaleX(1);opacity:0}}
@keyframes head{0%{left:0;opacity:.6}30%{left:calc(100% - 2px);opacity:.6}31%,100%{left:calc(100% - 2px);opacity:0}}
@keyframes fok{0%,30%{opacity:0}36%,86%{opacity:1}94%,100%{opacity:0}}
.fnote{margin:14px 0 0;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
@media (prefers-reduced-motion:reduce){.fbar i,.fok{animation:none}.fbar i{transform:none}.fok{opacity:1}.fbar:after{display:none}}
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
<div class="scene" id="sceneGrid" data-on="both">
<div class="pane comp"><div class="cap"><span>Components</span><span>looking for UI parts</span></div><div class="cells" id="cells"></div><div class="sweep"></div></div>
<div class="pane pat"><div class="cap"><span>Patterns</span><span>looking for repeats</span></div>
<div class="pcards"><div class="pcard"><i class="im"></i><i></i><i class="s"></i><i class="bt"></i></div><div class="pcard"><i class="im"></i><i></i><i class="s"></i><i class="bt"></i></div><div class="pcard"><i class="im"></i><i></i><i class="s"></i><i class="bt"></i></div></div>
<div class="plist"><i class="av"></i><span><i></i><i class="s"></i></span></div>
<span class="tag pmatch">&times;3 recurring</span><div class="sweep"></div></div>
</div>
<p class="scenetext" id="sceneText"></p>
</div>
<div id="finScene" hidden aria-hidden="true">
<div class="fin"><div class="cap"><span>Finalizing</span><span>writing what you approved</span></div>
<div class="frow"><span>Contract</span><span class="fbar"><i></i></span><span class="fok">&#10003;</span></div>
<div class="frow"><span>Patterns</span><span class="fbar"><i></i></span><span class="fok">&#10003;</span></div>
<div class="frow"><span>Checks</span><span class="fbar"><i></i></span><span class="fok">&#10003;</span></div>
</div>
<p class="scenetext" id="finText"></p>
</div>
<div id="ask"></div>
<div id="summary" hidden></div>
<p class="kicker" id="nextHead" hidden>What to do next</p>
<ol class="next" id="next" hidden></ol>
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
  var STEPS = [["scan", "Scan"], ["components", "Components"], ["patterns", "Patterns"], ["plan", "Plan"], ["done", "Done"]];
  var COPY = {
    scan: ["Scanning your project", "Setup reads every folder. Dependencies, build output and .gitignore entries are skipped."],
    components: ["Choose the design system's components", "Every component setup found is listed, grouped by directory. Tick the ones that belong to your design system."],
    patterns: ["Choose the patterns", "Patterns are structures that recur where your components are used. They stay proposals until you approve them."],
    plan: ["Apply the setup", "One plan. Yes confirms the contract and does everything in it."],
    done: ["Setup finished", "Here is what setup did, and what to do next."]
  };
  function fresh() { return { phase: "scan", counts: {}, live: null, logs: {}, busy: null, ask: null, next: [], summary: [], ended: false, error: null, stopped: false, lost: false, widget: null, restarting: false, applying: false }; }
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
  function paintTheme() { $("theme").textContent = theme() === "light" ? "\\u263E Dark" : "\\u2600 Light"; }
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

  function current() { return state.ended ? "done" : state.phase; }

  function renderSteps() {
    var cur = STEPS.map(function (s) { return s[0]; }).indexOf(current());
    var list = $("steps"); clear(list);
    STEPS.forEach(function (s, i) {
      var status = state.ended || i < cur ? "done" : i === cur ? "current" : "next";
      var count = status === "current" ? (state.stopped ? "stopped" : state.live) : status === "done" ? state.counts[s[0]] : null;
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
    if (ask.kind === "select" || ask.kind === "prompt") return { text: "" };
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
    for (var i = 0; i < 18; i++) {
      var e = h("i", { class: "cell" });
      e.style.animationDelay = ((i % 6) * 0.55 + Math.floor(i / 6) * 0.12) + "s";
      cells.appendChild(e);
    }
  })();
  function renderFinalizing() {
    // After the plan is confirmed, setup writes files, compiles and connects tools, which can take a while.
    var show = state.applying && !state.ask && !state.ended && !state.stopped && !state.restarting && state.phase === "plan";
    $("finScene").hidden = !show;
    if (!show) return;
    var t = $("finText"); clear(t);
    t.appendChild(h("b", { text: "\u25CF " }));
    t.appendChild(document.createTextNode(state.busy || "Working"));
  }
  function renderScene() {
    renderFinalizing();
    var show = !state.ask && !state.ended && !state.stopped && (state.phase === "scan" || state.phase === "components" || state.phase === "patterns");
    $("scene").hidden = !show;
    if (!show) return;
    $("sceneGrid").setAttribute("data-on", state.phase === "scan" ? "both" : state.phase);
    var t = $("sceneText"); clear(t);
    t.appendChild(h("b", { text: "\u25CF " }));
    t.appendChild(document.createTextNode(state.busy || "Working"));
  }

  function renderAsk() {
    var box = $("ask"); clear(box);
    clear($("footin")); $("foot").hidden = true;
    var ask = state.ask;
    if (!ask) return;
    if (!state.widget) state.widget = newWidget(ask);
    var lines = ask.question.split("\\n");
    var panel = h("section", { class: "ask", "aria-label": "Question" }, [h("h3", { text: lines[0] })]);
    if (lines.length > 1) panel.appendChild(h("p", { class: "q", text: lines.slice(1).join("\\n") }));
    box.appendChild(panel);
    if (ask.kind === "select") renderSelect(panel, ask);
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
    $("restart").hidden = state.ended || state.stopped;
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
    if (showNext) state.next.forEach(function (n) {
      var note = n.title === "About these commands";
      var body = h("div", {}, [h("h3", { text: n.title })].concat(n.lines.map(line)));
      next.appendChild(note ? h("li", { class: "note" }, [body]) : h("li", {}, [h("span", { class: "no", "aria-hidden": "true" }), body]));
    });
    renderScene();
    renderAsk();
  }

  function on(e) {
    if (e.type === "project") $("proj").textContent = " / " + e.name;
    else if (e.type === "reset") state = fresh();
    else if (e.type === "phase") { state.phase = e.id; state.live = null; }
    else if (e.type === "log") { (state.logs[state.phase] = state.logs[state.phase] || []).push({ kind: e.kind, text: e.text }); state.busy = null; }
    else if (e.type === "busy") state.busy = e.text;
    else if (e.type === "next") state.next.push({ title: e.title, lines: e.lines });
    else if (e.type === "summary") state.summary = e.rows;
    else if (e.type === "ask") { state.ask = e; state.widget = null; state.busy = null; }
    else if (e.type === "answered") { if (state.ask && state.ask.id === e.id) { state.ask = null; state.widget = null; } }
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
