// first-load.mjs: what a visitor sees on a first load, in a browser with no WebGPU.
//
//   node tests/first-load.mjs                         the live game (GitHub Pages)
//   node tests/first-load.mjs http://localhost:8000/  a local serve.py
//   FIRST_LOAD_SECONDS=180 node tests/first-load.mjs  wait longer on the loader
//   FIRST_LOAD_MODE=slow node tests/first-load.mjs URL
//       a browser WITH WebGPU on a slow line: the model's download is faked (5% every
//       1.5 s), and the visitor presses a key to play before it is done; the model
//       then arrives mid-game
//   FIRST_LOAD_TURN=0 ...    stop once the game has started (the opening takes a minute to type)
//
// One headless Chrome, muted, at background priority, with the GPU off: WebGPU
// finds no adapter, as on a phone or a browser without it. The script clicks the
// loading screen (the gesture that starts everything), then records every change
// of the loader's prompt and every line the terminal prints, with the time; then
// it takes one turn ("hello") and records the reply. It prints the timeline, and
// a verdict line: whether the page said plainly that the model had not loaded,
// and whether the game answered.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_ = process.argv[2] || "https://mreidhorrigan.github.io/Clod-Bathos-Superior-Machine-An-LM-IDN/";
const SLOW = process.env.FIRST_LOAD_MODE === "slow";
const WAIT = Number(process.env.FIRST_LOAD_SECONDS || 120);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execFileSync("taskpolicy", ["-b", "-p", String(process.pid)]); } catch (e) { /* not macOS */ }
try { process.setPriority(19); } catch (e) { /* fine */ }

const profile = mkdtempSync(join(tmpdir(), "first-load-"));
const port = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn("taskpolicy", ["-b", CHROME, "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run",
  "--window-size=1200,800", "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });
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
const evalIn = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.timedOut) { console.log(at() + "  (the page did not answer within 20 s)"); return undefined; }
  return r.result && r.result.result ? r.result.result.value : undefined; };
await send("Page.navigate", { url: URL_ }, sessionId);
for (let i = 0; i < 60; i++) { await sleep(500); if (await evalIn("document.readyState === 'complete' && !!document.getElementById('loader')")) break; }

if (SLOW) await evalIn(`(() => {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({}) } });
  IDNLLM.init = (cb) => new Promise((res) => { let p = 0; const t = setInterval(() => { p = Math.min(1, p + 0.05); cb({ progress: p }); if (p >= 1) { clearInterval(t); res(); } }, 1500); });
  return true; })()`);
const timeline = [];
const note = timeline.push.bind(timeline);
timeline.push = (line) => { console.log(line); return note(line); };   // live, as it happens
const snap = `JSON.stringify({
  loader: (() => { const l = document.getElementById('loader'); if (!l || l.style.display === 'none' || getComputedStyle(l).visibility === 'hidden') return null;
    return [...l.querySelectorAll('.loader-prompt, .loader-note, .loader-status')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim()).join(' | '); })(),
  lines: [...document.querySelectorAll('#transcript > *')].map((e) => e.textContent.trim()).filter(Boolean),
  gpu: !!navigator.gpu,
  status: (document.querySelector('#narrator-state') || {}).textContent || '',
})`;
let last = { loader: undefined, lines: [] };
const record = async () => {
  const raw = await evalIn(snap);
  if (!raw) return last;
  const s = JSON.parse(raw);
  if (s.loader !== last.loader) timeline.push(at() + "  loader: " + (s.loader === null ? "(gone)" : s.loader));
  for (let i = last.lines.length; i < s.lines.length; i++) timeline.push(at() + "  terminal: " + s.lines[i].slice(0, 200));
  if (s.status !== last.status && s.loader === null) timeline.push(at() + "  status bar: " + s.status.trim());
  last = s; return s;
};
console.log("First load of " + URL_ + (SLOW ? ", a WebGPU browser on a slow line (faked)" : ", with no WebGPU"));
const first = await record();
timeline.push(at() + "  navigator.gpu " + (first.gpu ? "exists (the adapter may still be missing)" : "is missing"));
await evalIn("document.getElementById('loader').click(), true");      // the first gesture
const end = Date.now() + WAIT * 1000;
let s = first, pressed = 0;
while (Date.now() < end) {
  await sleep(500); s = await record();
  // a notice that waits for a key (the model cannot load here), or, on the slow line, the
  // download under way: press a key once, as a visitor would, to play
  if (s.loader && (/PLAY WITHOUT IT/.test(s.loader) || (SLOW && /LOADING THE AI NARRATOR\s+1\d%/.test(s.loader))) && pressed < 1) {
    await sleep(1500); pressed++;
    timeline.push(at() + "  (a key pressed)");
    await evalIn("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true })), true");
  }
  if (s.loader === null && s.lines.some((l) => /Address me/.test(l))) break;
}
if (s.loader !== null) timeline.push(at() + "  STILL ON THE LOADING SCREEN after " + WAIT + " s");
else if (process.env.FIRST_LOAD_TURN === "0") timeline.push(at() + "  (no turn taken: FIRST_LOAD_TURN=0)");
else {
  const before = s.lines.length;
  timeline.push(at() + "  (typed: hello)");
  await evalIn(`(() => { const i = document.getElementById('input'); i.value = 'hello'; i.form.requestSubmit(); return true; })()`);
  let quiet = 0, text = "";
  for (let i = 0; i < 120 && quiet < 8; i++) {                     // until the reply has been typed out
    await sleep(500); s = await record();
    const now = s.lines.slice(before).join("\n");
    quiet = now === text && s.lines.length > before + 1 ? quiet + 1 : 0; text = now;
  }
  const reply = s.lines.slice(before + 1).join(" / ");
  timeline.push(at() + "  reply: " + (reply ? reply.slice(0, 300) : "(none)"));
  if (SLOW) { for (let i = 0; i < 60 && !/NARRATOR · AI/.test(s.status); i++) { await sleep(500); s = await record(); } }
}
const all = timeline.join("\n");
console.log((logs.length ? "\nconsole:\n" + logs.join("\n") : ""));
const said = /model|offline|webgpu|narrator/i.test(all.split("\n").filter((l) => /terminal:|loader:/.test(l)).join("\n"));
const answered = /reply: (?!\(none\))/.test(all);
console.log("\nverdict: the page " + (said ? "says what the model is doing" : "never mentions the model") + "; the game " + (s.loader === null ? "started" : "never started")
  + "; " + (answered ? "it answered a turn" : "it did not answer") + (SLOW ? "; the status bar ends at " + s.status.trim() : "") + ".");
sock.close(); chrome.kill(); await new Promise((r) => chrome.on("exit", r));
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* fine */ }
