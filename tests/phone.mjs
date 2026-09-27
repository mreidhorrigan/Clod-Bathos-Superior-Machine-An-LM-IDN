// phone.mjs: Clod Bathos on a phone.
//
//   node tests/phone.mjs                         the live game (GitHub Pages)
//   node tests/phone.mjs http://localhost:8000/  a local serve.py
//
// One headless Chrome (muted, background priority, GPU off) made an iPhone: its
// screen (390 by 844), touch and user agent, and a WebGPU adapter as Safari offers
// one. It checks the splash warns a phone away (the model wants a computer's graphics
// card), that a phone never starts the model's download, and that the splash, the
// boot text, the status bar, the terminal and the prompt all fit inside the screen.
// A line ending NO fails.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_ = process.argv[2] || "https://mreidhorrigan.github.io/Clod-Bathos-Superior-Machine-An-LM-IDN/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execFileSync("taskpolicy", ["-b", "-p", String(process.pid)]); } catch (e) { /* not macOS */ }
try { process.setPriority(19); } catch (e) { /* fine */ }

const profile = mkdtempSync(join(tmpdir(), "phone-"));
const port = 9960 + Math.floor(Math.random() * 30);
const chrome = spawn("taskpolicy", ["-b", CHROME, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run",
  "--window-size=390,844", "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });
// however this ends (done, an error, Ctrl-C), the browser goes with it: a Chrome left
// behind by a run that threw kept a page spinning for most of a day (2026-09-24)
const stopChrome = () => { try { chrome.kill("SIGKILL"); } catch (e) { /* gone */ } };
process.on("exit", stopChrome);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { stopChrome(); process.exit(130); });
process.on("uncaughtException", (e) => { console.log("ERROR " + (e && e.stack || e)); stopChrome(); process.exit(1); });
process.on("unhandledRejection", (e) => { console.log("ERROR " + (e && e.stack || e)); stopChrome(); process.exit(1); });
let ws = null;
for (let i = 0; i < 100 && !ws; i++) {
  await sleep(200);
  try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch (e) { /* not up */ }
}
if (!ws) { console.log("chrome did not start"); process.exit(1); }
const sock = new WebSocket(ws);
await new Promise((r) => sock.addEventListener("open", r));
let id = 0; const waiting = new Map(); const logs = [];
const t0 = Date.now(), at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + " s";
sock.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled" && /warn|error/.test(m.params.type))
    logs.push(at() + "  console." + m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 220));
  if (m.method === "Runtime.exceptionThrown") logs.push(at() + "  EXCEPTION: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split("\n")[0]);
});
// every call answers within 20 s or gives up (a page busy or gone must not hang the test)
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const n = ++id, t = setTimeout(() => { waiting.delete(n); res({ timedOut: true }); }, 20000);
  waiting.set(n, (m) => { clearTimeout(t); res(m); });
  sock.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }));
});
const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Runtime.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);
const evalIn = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.timedOut) { console.log(at() + "  (the page did not answer within 20 s)"); return undefined; }
  return r.result && r.result.result ? r.result.result.value : undefined; };

// an iPhone: its size, its touch, its user agent, and a WebGPU adapter it would offer
// (Safari on iOS 26 has WebGPU), so the page cannot lean on WebGPU being missing
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, sessionId);
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
await send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" }, sessionId);
await send("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1" }, sessionId);
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({}) } });
  window.__initCalled = 0;
  window.addEventListener('DOMContentLoaded', () => { if (window.IDNLLM) { const i = IDNLLM.init; IDNLLM.init = (...a) => { window.__initCalled++; return i.apply(IDNLLM, a); }; } });` }, sessionId);
await send("Page.navigate", { url: URL_ }, sessionId);
for (let i = 0; i < 60; i++) { await sleep(500); if (await evalIn("document.readyState === 'complete' && !!document.getElementById('loader')")) break; }
await sleep(800);
// what sticks out past the screen's sides or bottom, among what shows
const fit = (sel) => evalIn(`(() => {
  const W = innerWidth, H = innerHeight, out = [];
  for (const e of document.querySelectorAll(${JSON.stringify(sel)})) {
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.left < -1 || r.right > W + 1 || r.bottom > H + 1) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right) + ' x, bottom ' + Math.round(r.bottom));
    if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible') out.push((e.id || e.className || e.tagName) + ' clips ' + (e.scrollWidth - e.clientWidth) + ' px of its width');
  }
  return out; })()`);
let bad = 0;
const check = (what, list) => { console.log(what + ": " + (list && list.length ? list.join("; ") + " NO" : "fits")); if (list && list.length) bad++; };
const text = (sel) => evalIn(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => getComputedStyle(e).display !== 'none' && !e.hidden).map((e) => e.textContent.trim()).join(' | ')`);
console.log("Clod Bathos on a phone (390 by 844), " + URL_);
// the title card is made first thing in the page, ahead of the splash, so the splash is never
// seen before it (made at the end of the page, it came up a moment after the splash)
const first = await evalIn("(() => { const c = document.querySelector('.mhtc'), l = document.getElementById('loader'); return !!(c && l && (c.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)); })()");
console.log("the title card comes before the splash: " + (first ? "yes" : "NO")); if (!first) bad++;
// the title card first: what the work is, then Begin
const cardSays = await text("#mhtc-title, .mhtc-author");
console.log("title card: " + (cardSays || "MISSING NO")); if (!cardSays) bad++;
check("title card", await fit(".mhtc-box, .mhtc-text, .mhtc-go, .mhtc-author"));
// its top in reach: a card taller than the screen once had its top pushed above it
const cardTop = await evalIn("(() => { const c = document.querySelector('.mhtc'); c.scrollTop = 0; return Math.round(Math.min(...[...c.querySelectorAll('.mhtc-lang, .mhtc-kicker, .mhtc-box')].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect().top))); })()");
console.log("the title card's top: " + (cardTop >= 0 ? "in reach (" + cardTop + " px)" : "cut off above the screen NO (" + cardTop + " px)")); if (!(cardTop >= 0)) bad++;
const cardColour = await evalIn("document.querySelector('.mhtc').style.getPropertyValue('--mhtc-c')");
console.log("the title card's colour: " + cardColour + (cardColour === "rgb(154,67,16)" ? " (its own burnt orange)" : " NO"));  if (cardColour !== "rgb(154,67,16)") bad++;
// in French: the card's own switch turns it over (the address takes ?lang=fr), and the
// card says the game itself is in English; a load with ?lang=fr opens it in French
const fr = async (how) => {
  const r = JSON.parse(await evalIn(`JSON.stringify({ lang: document.querySelector('.mhtc').getAttribute('lang'),
    kicker: document.querySelector('.mhtc-kicker').textContent, go: document.querySelector('.mhtc-go').textContent,
    strip: document.querySelector('.mhtc-strip').hidden ? '' : document.querySelector('.mhtc-strip').textContent,
    url: location.search })`));
  const ok = r.lang === "fr" && /^Ce /.test(r.kicker) && r.go === "Commencer" && /anglais/.test(r.strip) && /lang=fr/.test(r.url);
  console.log("French card, " + how + ": " + (ok ? "yes (\"" + r.strip + "\")" : "NO " + JSON.stringify(r))); if (!ok) bad++;
};
await evalIn("document.querySelector('.mhtc-lang').click(), true");
await fr("by its switch");
await evalIn("location.reload(), true");
for (let i = 0; i < 40; i++) { await sleep(250); if (await evalIn("!!document.querySelector('.mhtc') && document.readyState === 'complete'")) break; }
await sleep(500);
await fr("by ?lang=fr");
await evalIn("document.querySelector('.mhtc-lang').click(), true");
const backEn = await evalIn("document.querySelector('.mhtc').getAttribute('lang') === 'en' && document.querySelector('.mhtc-strip').hidden && document.querySelector('.mhtc-go').textContent === 'Begin'");
console.log("back to English: " + (backEn ? "yes, and no strip" : "NO")); if (!backEn) bad++;
await evalIn("document.querySelector('.mhtc-go').click(), true");
const cardGone = await evalIn("!document.querySelector('.mhtc')");
console.log("Begin: " + (cardGone ? "the card goes, the splash shows" : "the card stays NO")); if (!cardGone) bad++;
console.log("splash says: " + await text(".loader-inner > *"));
const warns = /computer/i.test(await text(".loader-inner > *")) && /phone/i.test(await text(".loader-inner > *"));
console.log("splash warns a phone away: " + (warns ? "yes" : "NO")); if (!warns) bad++;
check("splash", await fit(".loader, .loader-inner, .loader-inner > *"));
await evalIn("document.getElementById('loader').dispatchEvent(new Event('touchstart')), true");
for (let i = 0; i < 20; i++) { await sleep(500); if (/PLAY/.test(await text(".loader-prompt") || "")) break; }
console.log("after a tap: " + await text(".loader-prompt, .loader-status"));
await sleep(600);
await evalIn("document.getElementById('loader').click(), true");
for (let i = 0; i < 120; i++) { await sleep(500); if (/Address me/.test(await text("#transcript") || "")) break; }
const init = await evalIn("window.__initCalled");
console.log("the model download on a phone: " + (init ? "started NO" : "not started")); if (init) bad++;
check("boot text", await fit("#boot"));
// the rules, drawn in characters (GLYPH RULES in the page): runs of line broken by knots of
// widgets and mathematical symbols, each clipped to its width with its right cap in view; a
// few glyphs churning; a separator between turns from the same hand, inside the width
const RULES = `JSON.stringify((() => {
  const LINE = /[─━═╌╍┄┅┈┉⎯⎺⎻⎼⎽\\-=_~ ]/, KNOT = /[\\u2200-\\u22FF\\u2300-\\u23FF\\u2500-\\u259F\\u25A0-\\u25FF]/;
  const one = (el) => { const t = el.textContent, rg = document.createRange(); rg.selectNodeContents(el);
    return { n: [...t].length, knots: [...t].filter((c) => KNOT.test(c) && !LINE.test(c)).length, over: Math.round(rg.getBoundingClientRect().width - el.clientWidth), text: t }; };
  return { top: one(document.getElementById('rule-top')), bottom: one(document.getElementById('rule-bottom')) };
})())`;
const r1 = JSON.parse(await evalIn(RULES));
for (const k of ["top", "bottom"]) {
  const r = r1[k], share = r.knots / r.n, ok = r.n >= 20 && share >= 0.2 && share <= 0.7 && r.over <= 2;   // knots a fifth to two thirds of it (about 45% at rest)
  console.log("the " + k + " rule: " + r.n + " glyphs, " + r.knots + " in knots, " + (r.over > 0 ? r.over + " px past its edge" : "its end in view") + (ok ? "" : " NO") + ": " + r.text.slice(0, 48) + "…");
  if (!ok) bad++;
}
// every visual element in characters (the standing rule): the narrator's state, the mic, the scrollbar
const chars = JSON.parse(await evalIn(`JSON.stringify((() => {
  const dot = document.querySelector('#narrator-state .dot'), mic = document.getElementById('micbtn'), t = document.getElementById('transcript'), bar = document.querySelector('.glyph-scroll');
  const cs = (el, pseudo) => getComputedStyle(el, pseudo || null);
  return { dot: cs(dot, '::before').content, dotRound: cs(dot).borderTopLeftRadius, micBorder: cs(mic).borderTopStyle, micRound: cs(mic).borderTopLeftRadius,
    micBefore: cs(mic, '::before').content, micGlyph: cs(mic.querySelector('.mic-glyph'), '::before').content, scrollbar: cs(t).scrollbarWidth,
    over: t.scrollHeight - t.clientHeight, bar: bar ? (bar.hidden ? 'hidden' : bar.textContent.replace(/\\n/g, '')) : 'missing' };
})())`));
const dotOk = /[◉○]/.test(chars.dot) && chars.dotRound === "0px";
console.log("the narrator's state in characters: " + chars.dot + (dotOk ? "" : " NO (" + chars.dotRound + ")")); if (!dotOk) bad++;
const micOk = chars.micBorder === "none" && chars.micRound === "0px" && /\[/.test(chars.micBefore) && /●/.test(chars.micGlyph);
console.log("the mic in characters: " + chars.micBefore + chars.micGlyph + (micOk ? "" : " NO (" + chars.micBorder + ", " + chars.micRound + ")")); if (!micOk) bad++;
const barOk = chars.scrollbar === "none" && (chars.over > 2 ? /█/.test(chars.bar) && /┊/.test(chars.bar) : chars.bar === "hidden");
console.log("the scrollbar in characters: native " + chars.scrollbar + ", " + (chars.over > 2 ? "the transcript overflows, and the column reads " + chars.bar.slice(0, 24) + "…" : "no overflow, the column hidden") + (barOk ? "" : " NO")); if (!barOk) bad++;
// a long transcript: the column shows, its thumb at the foot when scrolled to the end, at the head when scrolled to the top
const col = JSON.parse(await evalIn(`(async () => { for (let i = 0; i < 40; i++) addLine('line ' + i + ' of a long petition', 'sys');
  const t = document.getElementById('transcript'), bar = document.querySelector('.glyph-scroll'), wait = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // the opening may still be typing, so "the end" moves: scroll there again until it holds
  for (let k = 0; k < 20; k++) { t.scrollTop = t.scrollHeight; await wait(); if (t.scrollTop + t.clientHeight >= t.scrollHeight - 2) break; }
  const end = bar.hidden ? '' : bar.textContent.split('\\n');
  t.scrollTop = 0; await wait(); const top = bar.hidden ? '' : bar.textContent.split('\\n');
  return JSON.stringify({ end: end && end.join(''), endFoot: end && end[end.length - 1] === '█', topHead: top && top[0] === '█' }); })()`));
const colOk = col.endFoot && col.topHead;
console.log("a long transcript: the column shows (" + (col.end || "").slice(0, 20) + "…), thumb at the foot at the end, at the head at the top: " + (colOk ? "yes" : "NO " + JSON.stringify(col))); if (!colOk) bad++;
await sleep(1300);
const r2 = JSON.parse(await evalIn(RULES)), churned = r2.top.text !== r1.top.text || r2.bottom.text !== r1.bottom.text;
console.log("the rules churn: " + (churned ? "yes" : "NO")); if (!churned) bad++;
const sep = JSON.parse(await evalIn(`(addSeparator(), JSON.stringify((() => { const el = [...document.querySelectorAll('#transcript .turn-rule')].pop(), rg = document.createRange(); rg.selectNodeContents(el);
  return { n: [...el.textContent].length, right: Math.round(rg.getBoundingClientRect().right), edge: Math.round(document.getElementById('transcript').getBoundingClientRect().right), hidden: el.getAttribute('aria-hidden') }; })()))`));
const sepOk = sep.n >= 8 && sep.right <= sep.edge + 1 && sep.hidden === "true";
console.log("a separator between turns: " + sep.n + " glyphs, " + (sep.right <= sep.edge + 1 ? "inside the width" : (sep.right - sep.edge) + " px past it") + ", hidden from a screen reader: " + sep.hidden + (sepOk ? "" : " NO")); if (!sepOk) bad++;
check("status bar", await fit("#statusbar, #statusbar .left, #statusbar .right"));
check("prompt bar", await fit("#promptbar, #input, #micbtn"));
check("terminal lines", await fit("#transcript, #transcript > *"));
console.log("status bar: " + await text("#statusbar"));
console.log("the terminal: " + ((await text("#transcript > *")) || "(empty)").slice(0, 400));
// with reduced motion, the rules hold still
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
await evalIn("location.reload(), true");
for (let i = 0; i < 40; i++) { await sleep(250); if (await evalIn("document.readyState === 'complete' && !!document.getElementById('rule-top') && document.getElementById('rule-top').textContent.length > 0")) break; }
await sleep(400);
const s1 = await evalIn("document.getElementById('rule-top').textContent"); await sleep(1300);
const s2 = await evalIn("document.getElementById('rule-top').textContent");
console.log("with reduced motion the rules hold still: " + (s1 && s1 === s2 ? "yes" : "NO")); if (!(s1 && s1 === s2)) bad++;
console.log(logs.length ? "\nconsole:\n" + logs.join("\n") : "");
console.log("\nverdict: " + (bad ? bad + " NO" : "fits a phone, and warns it away"));
sock.close(); chrome.kill(); await new Promise((r) => chrome.on("exit", r));
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* fine */ }
