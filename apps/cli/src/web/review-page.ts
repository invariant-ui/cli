/**
 * The page `invariant review list` serves on the loopback address: a report of what the contract holds and a place to decide
 * each open item. One file, no external request; it follows site/design.md like the setup page. Text from the contract is put
 * in the page with `textContent` only, never as markup.
 */
export const REVIEW_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>invariant review</title>
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
.proj{color:var(--muted);font-weight:400}
.tools{display:flex;gap:8px;align-items:center}
.mono,code,.kicker,.tag{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
h1,h2{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:500;letter-spacing:-.015em;margin:0}
h1{font-size:34px;line-height:1.15}
h2{font-size:22px;line-height:1.25}
h3{font-size:13px;font-weight:600;margin:0 0 6px}
.lead{color:var(--muted);margin:8px 0 0;max-width:70ch}
.kicker{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.btn{font:inherit;font-size:14px;color:var(--text);background:transparent;border:1px solid var(--line);border-radius:3px;padding:7px 13px;cursor:pointer}
.btn:hover{border-color:var(--muted)}
.btn.primary{background:var(--text);color:var(--bg);border-color:var(--text)}
.btn.small{padding:4px 10px;font-size:12.5px}
.btn:disabled{opacity:.45;cursor:default}
.btn.bad{color:var(--bad)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.field{font:inherit;font-size:13.5px;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:3px;padding:6px 10px}
textarea.field{width:100%;min-height:64px;resize:vertical}
.top{padding:32px 0 0}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin:22px 0 0}
@media (max-width:860px){.stats{grid-template-columns:repeat(2,1fr)}}
.stat{border-top:1px solid var(--line);padding-top:8px}
.stat b{display:block;font:500 30px/1.1 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
.stat span{font:11.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.stat.hot b{color:var(--warn)}
.stat.ok b{color:var(--ok)}
.about{margin:18px 0 0;font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
.bar{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;margin:26px 0 12px;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.bar .grp{display:flex;gap:6px;align-items:center}
.bar .grp>span{font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-right:2px}
.chip{font:inherit;font-size:12.5px;color:var(--muted);background:transparent;border:1px solid var(--line);border-radius:3px;padding:3px 9px;cursor:pointer}
.chip[aria-pressed=true]{color:var(--text);background:var(--panel);border-color:var(--muted)}
.bar .by{margin-left:auto;display:flex;gap:8px;align-items:center;font-size:13px;color:var(--muted)}
.grid{display:grid;grid-template-columns:minmax(0,430px) minmax(0,1fr);gap:28px;align-items:start;padding-bottom:110px}
@media (max-width:960px){.grid{grid-template-columns:minmax(0,1fr)}}
.list{border:1px solid var(--line);border-radius:3px;background:var(--panel)}
.row{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:transparent;border:0;border-top:1px solid var(--line);padding:9px 12px;cursor:pointer}
.row:first-child{border-top:0}
.row:hover{background:var(--sunk)}
.row[aria-selected=true]{background:var(--bg);outline:1px solid var(--muted);outline-offset:-1px}
.row .l1{display:flex;gap:8px;align-items:baseline;justify-content:space-between}
.row .sub{font-weight:600;font-size:13.5px;overflow-wrap:anywhere}
.row .pth{font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);overflow-wrap:anywhere}
.row .why{font-size:12.5px;color:var(--muted);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.row.done .sub{color:var(--muted)}
.tag{font-size:10.5px;border:1px solid var(--line);border-radius:3px;padding:0 5px;color:var(--muted);white-space:nowrap}
.tag.high{color:var(--bad);border-color:var(--bad)}
.tag.medium{color:var(--warn);border-color:var(--warn)}
.tag.rec{color:var(--ok);border-color:var(--ok)}
.empty{padding:26px 14px;color:var(--muted);text-align:center}
.detail{position:sticky;top:12px;border:1px solid var(--line);border-radius:3px;background:var(--panel);padding:18px}
@media (max-width:960px){.detail{position:static}}
.detail .tags{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 14px}
.detail p{margin:0 0 14px}
.detail .pth{font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);overflow-wrap:anywhere}
.ev{margin:0 0 14px;padding:8px 10px;background:var(--sunk);border:1px solid var(--line);border-radius:3px;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}
.claims{width:100%;border-collapse:collapse;margin:0 0 14px;font-size:13px}
.claims th{font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;font-weight:400;padding:4px 8px 4px 0;border-bottom:1px solid var(--line)}
.claims td{vertical-align:top;padding:8px 8px 8px 0;border-bottom:1px solid var(--line)}
.claims td pre{margin:0;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.claims td:last-child{text-align:right;white-space:nowrap;padding-right:0}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 6px}
.hint{font-size:12.5px;color:var(--muted);margin:0 0 14px}
.made{border:1px solid var(--ok);border-radius:3px;padding:8px 12px;color:var(--ok);margin:0 0 14px;font-size:13.5px}
.foot{position:fixed;left:0;right:0;bottom:0;border-top:1px solid var(--line);background:var(--panel)}
.foot .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:10px;padding-bottom:10px}
.foot .msg{font-size:13px;color:var(--muted)}
.foot .msg.bad{color:var(--bad)}
.foot .msg.ok{color:var(--ok)}
.gone{padding:60px 0;color:var(--muted)}
</style>
</head>
<body>
<header><div class="wrap">
<div class="logo"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="3" width="26" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="6.5" y="16.5" width="9" height="9" fill="#7c8cff"/></svg><span>invariant</span><span class="proj" id="proj"></span></div>
<div class="tools"><button class="btn small" id="theme" type="button" aria-label="Switch between light and dark"></button><button class="btn small" id="done" type="button">Done</button></div>
</div></header>
<div class="wrap" id="app">
<section class="top">
<h1>Contract review</h1>
<p class="lead" id="lead">Everything the contract holds that no person has confirmed yet. Nothing inferred or conflicting becomes authoritative until you decide it.</p>
<div class="stats" id="stats"></div>
<p class="about" id="about"></p>
</section>
<div class="bar" id="bar"></div>
<div class="grid">
<div class="list" id="list" role="listbox" aria-label="Open items"></div>
<aside class="detail" id="detail" aria-live="polite"></aside>
</div>
</div>
<div class="foot" id="foot"><div class="wrap"><span class="msg" id="msg"></span><button class="btn primary" id="apply" type="button" disabled>Apply decisions</button></div></div>
<script>
(function () {
  var token = new URLSearchParams(location.search).get("t") || "";
  var KINDS = [["all", "All"], ["conflict", "Conflicts"], ["inferred-fact", "Inferred facts"], ["pattern-fact", "Pattern facts"]];
  var PRIOS = [["all", "All"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]];
  var SHOWS = [["open", "Open"], ["recorded", "Recorded"], ["all", "All"]];
  var KIND_NAME = { "conflict": "conflict", "inferred-fact": "inferred fact", "pattern-fact": "pattern fact" };
  var ORDER = { high: 0, medium: 1, low: 2 };
  var KIND_ORDER = { "conflict": 0, "inferred-fact": 1, "pattern-fact": 2 };
  var state = { data: null, q: "", kind: "all", prio: "all", show: "open", selected: null, by: "", busy: false, msg: null, closed: false };

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
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function api(path, body) {
    var url = path + "?t=" + encodeURIComponent(token);
    var init = body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    return fetch(url, init).then(function (r) { if (r.status === 204) return {}; if (!r.ok) throw new Error("request failed"); return r.json(); });
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
  try { state.by = localStorage.getItem("reviewer") || ""; } catch (e) {}

  $("done").addEventListener("click", function () {
    api("/api/close", {}).then(function () { state.closed = true; render(); });
  });
  $("apply").addEventListener("click", function () {
    state.busy = true; state.msg = { text: "Compiling the contract with your decisions\\u2026", kind: "" }; render();
    api("/api/apply", {}).then(function (r) {
      state.busy = false;
      state.msg = { text: r.message || (r.ok ? "Applied." : "Not applied."), kind: r.ok ? "ok" : "bad" };
      return load();
    }).catch(function () { state.busy = false; state.msg = { text: "The review is no longer running. Return to your terminal.", kind: "bad" }; render(); });
  });

  function rows() {
    var q = state.q.toLowerCase();
    return state.data.rows.filter(function (r) {
      if (state.kind !== "all" && r.kind !== state.kind) return false;
      if (state.prio !== "all" && r.priority !== state.prio) return false;
      if (state.show === "open" && r.decision) return false;
      if (state.show === "recorded" && !r.decision) return false;
      if (q && (r.subject + " " + (r.path || "") + " " + r.reason).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var d = KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || ORDER[a.priority] - ORDER[b.priority];
      if (d) return d;
      var x = a.subject + " " + (a.path || ""), y = b.subject + " " + (b.path || "");
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }
  function byId(id) { return state.data.rows.filter(function (r) { return r.id === id; })[0]; }

  function chips(label, list, key) {
    var g = h("div", { class: "grp" }, [h("span", { text: label })]);
    list.forEach(function (o) {
      g.appendChild(h("button", { class: "chip", type: "button", "aria-pressed": state[key] === o[0] ? "true" : "false", text: o[1], onclick: function () { state[key] = o[0]; render(); } }));
    });
    return g;
  }

  function renderTop() {
    var d = state.data, all = d.rows;
    $("proj").textContent = " / " + d.project;
    var open = all.filter(function (r) { return !r.decision; });
    function n(f) { return open.filter(f).length; }
    var recorded = all.length - open.length;
    var tiles = [
      [n(function (r) { return r.kind === "conflict"; }), "Open conflicts", ""],
      [n(function (r) { return r.kind === "inferred-fact"; }), "Inferred facts", ""],
      [n(function (r) { return r.kind === "pattern-fact"; }), "Pattern facts", ""],
      [n(function (r) { return r.priority === "high"; }), "High priority", "hot"],
      [recorded, "Recorded, not applied", "ok"]
    ];
    var stats = $("stats"); clear(stats);
    tiles.forEach(function (t) { stats.appendChild(h("div", { class: "stat " + t[2] }, [h("b", { text: String(t[0]) }), h("span", { text: t[1] })])); });
    var c = d.contract;
    $("about").textContent = c.name + "  \\u00B7  " + c.components + " components  \\u00B7  " + c.tokens + " tokens  \\u00B7  " + c.patterns + " patterns  \\u00B7  " + c.guidelines + " guidelines";
    $("lead").textContent = all.length === 0 ? "Nothing needs a decision. Every conflict and inferred fact in the contract has been confirmed." : open.length + " of " + all.length + " items still need a decision. Nothing inferred or conflicting becomes authoritative until you decide it.";
  }

  function renderBar() {
    var bar = $("bar"); clear(bar);
    var q = h("input", { class: "field", type: "search", placeholder: "Search subject, path or reason", "aria-label": "Search", value: state.q });
    q.addEventListener("input", function () { state.q = q.value; renderList(); renderDetail(); });
    bar.appendChild(q);
    bar.appendChild(chips("Kind", KINDS, "kind"));
    bar.appendChild(chips("Priority", PRIOS, "prio"));
    bar.appendChild(chips("Show", SHOWS, "show"));
    var by = h("input", { class: "field", type: "text", placeholder: "Your name", "aria-label": "Deciding as", value: state.by, maxlength: "200", id: "by" });
    by.addEventListener("input", function () { state.by = by.value; try { localStorage.setItem("reviewer", by.value); } catch (e) {} });
    bar.appendChild(h("label", { class: "by" }, ["Deciding as", by]));
  }

  function renderList() {
    var list = $("list"); clear(list);
    var rs = rows();
    if (rs.length === 0) {
      list.appendChild(h("div", { class: "empty", text: state.data.rows.length === 0 ? "Nothing to review." : "No items match these filters." }));
      return;
    }
    if (!state.selected || !rs.some(function (r) { return r.id === state.selected; })) state.selected = rs[0].id;
    rs.forEach(function (r) {
      var l1 = h("div", { class: "l1" }, [
        h("span", { class: "sub", text: r.subject }),
        h("span", {}, [r.decision ? h("span", { class: "tag rec", text: "recorded" }) : h("span", { class: "tag " + r.priority, text: r.priority })])
      ]);
      var kids = [l1];
      if (r.path) kids.push(h("div", { class: "pth", text: r.path }));
      kids.push(h("div", { class: "why", text: r.reason }));
      list.appendChild(h("button", { class: "row" + (r.decision ? " done" : ""), type: "button", role: "option", "aria-selected": r.id === state.selected ? "true" : "false", onclick: function () { state.selected = r.id; renderList(); renderDetail(); } }, kids));
    });
  }

  function decide(row, action, extra) {
    if (!state.by.trim()) { state.msg = { text: "Say who is deciding first: type your name above.", kind: "bad" }; render(); var b = $("by"); if (b) b.focus(); return; }
    var note = $("note") ? $("note").value : "";
    var ref = $("ref") ? $("ref").value : "";
    var body = { id: row.id, action: action, by: state.by.trim() };
    if (note.trim()) body.note = note.trim();
    if (ref.trim()) body.reference = ref.trim();
    if (extra && extra.source) body.source = extra.source;
    var rs = rows(), at = rs.map(function (r) { return r.id; }).indexOf(row.id);
    state.busy = true; render();
    api("/api/decide", body).then(function (r) {
      state.busy = false;
      if (!r.ok) { state.msg = { text: r.message, kind: "bad" }; render(); return; }
      state.msg = { text: "Recorded. It takes effect when you apply the decisions.", kind: "ok" };
      return load().then(function () {
        // Move on to the next item that still needs a decision.
        var next = rows();
        if (next.length > 0) state.selected = next[Math.min(at, next.length - 1)].id;
        render();
      });
    }).catch(function () { state.busy = false; state.msg = { text: "The review is no longer running. Return to your terminal.", kind: "bad" }; render(); });
  }

  function renderDetail() {
    var box = $("detail"); clear(box);
    var r = state.selected ? byId(state.selected) : null;
    if (!r) { box.appendChild(h("p", { class: "hint", text: "Choose an item to read the evidence and decide it." })); return; }
    box.appendChild(h("h2", { text: r.subject }));
    if (r.path) box.appendChild(h("div", { class: "pth", text: r.path }));
    var tags = h("div", { class: "tags" }, [h("span", { class: "tag", text: KIND_NAME[r.kind] }), h("span", { class: "tag " + r.priority, text: r.priority + " priority" })]);
    if (r.confidence !== undefined) tags.appendChild(h("span", { class: "tag", text: "confidence " + Math.round(r.confidence * 100) + "%" }));
    if (r.rule) tags.appendChild(h("span", { class: "tag", text: r.rule }));
    box.appendChild(tags);
    if (r.decision) {
      var d = r.decision;
      box.appendChild(h("div", { class: "made", text: "Recorded: " + d.action + (d.source ? " (" + d.source + ")" : "") + " by " + d.by + (d.note ? ". " + d.note : "") + ". Apply the decisions to make it take effect." }));
    }
    box.appendChild(h("h3", { text: "Why it needs a decision" }));
    box.appendChild(h("p", { text: r.reason }));
    box.appendChild(h("h3", { text: "Evidence" }));
    box.appendChild(h("div", { class: "ev", text: r.evidence.length ? r.evidence.join("\\n") : "none recorded" }));
    box.lastChild.style.whiteSpace = "pre-wrap";

    var disabled = state.busy;
    if (r.kind === "conflict") {
      box.appendChild(h("h3", { text: "What each source says" }));
      var t = h("table", { class: "claims" }, [h("thead", {}, [h("tr", {}, [h("th", { text: "Source" }), h("th", { text: "Value" }), h("th", { text: "" })])])]);
      var tb = h("tbody", {});
      (r.claims || []).forEach(function (cl) {
        tb.appendChild(h("tr", {}, [
          h("td", {}, [h("div", { text: cl.sourceId }), h("div", { class: "pth", text: cl.status })]),
          h("td", {}, [h("pre", { text: cl.value })]),
          h("td", {}, [h("button", { class: "btn small", type: "button", disabled: disabled, text: "Use this", onclick: function () { decide(r, "resolve", { source: cl.sourceId }); } })])
        ]));
      });
      t.appendChild(tb); box.appendChild(t);
      box.appendChild(h("p", { class: "hint", text: "Use this: the value is right, and the other sources are fixed at their source. Accept: the sources differ on purpose. Dismiss: this is not a real conflict. The value is not rewritten; the conflict leaves the queue." }));
    } else {
      box.appendChild(h("p", { class: "hint", text: r.kind === "inferred-fact" ? "Approve makes this fact authoritative. Reject records that it is wrong." : "Approve confirms this fact of a pattern you wrote. To change it, edit the pattern definition." }));
    }
    box.appendChild(h("label", { class: "hint", for: "note", text: "Note (optional)" }));
    box.appendChild(h("textarea", { class: "field", id: "note", maxlength: "2000", placeholder: "Why this decision" }));
    box.appendChild(h("div", { class: "hint" }));
    box.appendChild(h("label", { class: "hint", for: "ref", text: "Reference (optional): a link or ticket" }));
    box.appendChild(h("input", { class: "field", id: "ref", type: "text", maxlength: "500", style: "width:100%;margin-bottom:14px" }));
    var acts = h("div", { class: "acts" });
    if (r.kind === "conflict") {
      acts.appendChild(h("button", { class: "btn", type: "button", disabled: disabled, text: "Accept as a known difference", onclick: function () { decide(r, "accept"); } }));
      acts.appendChild(h("button", { class: "btn", type: "button", disabled: disabled, text: "Dismiss: not a real conflict", onclick: function () { decide(r, "dismiss"); } }));
    } else {
      acts.appendChild(h("button", { class: "btn primary", type: "button", disabled: disabled, text: "Approve", onclick: function () { decide(r, "approve"); } }));
      if (r.kind === "inferred-fact") acts.appendChild(h("button", { class: "btn bad", type: "button", disabled: disabled, text: "Reject", onclick: function () { decide(r, "reject"); } }));
    }
    box.appendChild(acts);
  }

  function renderFoot() {
    var pending = state.data ? state.data.rows.filter(function (r) { return r.decision; }).length : 0;
    var m = $("msg");
    m.className = "msg" + (state.msg && state.msg.kind ? " " + state.msg.kind : "");
    m.textContent = state.msg ? state.msg.text : pending > 0 ? pending + " decision" + (pending === 1 ? "" : "s") + " recorded, waiting to apply" : "No decisions waiting to apply";
    $("apply").disabled = state.busy || pending === 0;
    $("apply").textContent = pending > 0 ? "Apply " + pending + " decision" + (pending === 1 ? "" : "s") : "Apply decisions";
  }

  function render() {
    if (state.closed) {
      clear($("app")); $("app").appendChild(h("div", { class: "gone", text: "Review closed. You can close this tab. Decisions that were recorded but not applied take effect at the next compile." }));
      $("foot").hidden = true; $("done").hidden = true;
      return;
    }
    if (!state.data) return;
    renderTop(); renderBar(); renderList(); renderDetail(); renderFoot();
  }
  function load() {
    return api("/api/state").then(function (d) { state.data = d; render(); });
  }
  document.addEventListener("keydown", function (e) {
    var t = e.target && e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey || !state.data) return;
    if (e.key !== "j" && e.key !== "k") return;
    var rs = rows(), i = rs.map(function (r) { return r.id; }).indexOf(state.selected);
    var next = rs[Math.max(0, Math.min(rs.length - 1, i + (e.key === "j" ? 1 : -1)))];
    if (next) { state.selected = next.id; renderList(); renderDetail(); }
  });
  load().catch(function () { $("lead").textContent = "The review is no longer running. Return to your terminal."; });
})();
</script>
</body>
</html>
`
