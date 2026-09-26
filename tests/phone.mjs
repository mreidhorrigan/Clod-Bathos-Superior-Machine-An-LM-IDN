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
check("status bar", await fit("#statusbar, #statusbar .left, #statusbar .right"));
check("prompt bar", await fit("#promptbar, #input, #micbtn"));
check("terminal lines", await fit("#transcript, #transcript > *"));
console.log("status bar: " + await text("#statusbar"));
console.log("the terminal: " + ((await text("#transcript > *")) || "(empty)").slice(0, 400));
console.log(logs.length ? "\nconsole:\n" + logs.join("\n") : "");
console.log("\nverdict: " + (bad ? bad + " NO" : "fits a phone, and warns it away"));
sock.close(); chrome.kill(); await new Promise((r) => chrome.on("exit", r));
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* fine */ }
