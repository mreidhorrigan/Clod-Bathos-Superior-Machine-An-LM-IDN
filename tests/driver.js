/* ===========================================================================
 * IDN STORYTEST · HEADLESS DRIVER   (tests/driver.js)
 * ===========================================================================
 * Runs the REAL engine (engine/llm.js + engine/engine.js + a story file) under
 * macOS JavaScriptCore (`osascript -l JavaScript`) with NO browser and NO
 * vis/audio: `window`/`IDN` are stubbed so every presentation effect no-ops,
 * and the LLM provider is replaced by a SYNCHRONOUS curl → local Ollama bridge
 * registered as IDNLLM.use('harness', …) — so the prompts, JSON schema,
 * hostility veto, keyword fallback etc. are all the production code paths.
 *
 * Driven by storytest.py: it writes a config JSON, points IDN_TEST_CONFIG at
 * it, and parses the one-JSON-object-per-line protocol on stdout.
 *
 * Why async takeTurn() completes here: JavaScriptCore drains the promise
 * microtask queue when the main evaluation ends, and every await in the turn
 * chain resolves synchronously (the curl bridge blocks; nothing needs timers).
 * So: kick off the async run, let the drain finish it, emit as we go.
 * ===========================================================================*/
ObjC.import("Foundation");

var App = Application.currentApplication();
App.includeStandardAdditions = true;

/* ---- tiny stdlib --------------------------------------------------------- */
var OUT = $.NSFileHandle.fileHandleWithStandardOutput;
function emit(obj) {
  var s = JSON.stringify(obj) + "\n";
  OUT.writeData($.NSString.alloc.initWithUTF8String(s).dataUsingEncoding($.NSUTF8StringEncoding));
}
function readFile(p) {
  var s = $.NSString.stringWithContentsOfFileEncodingError($(p), $.NSUTF8StringEncoding, $());
  if (s.isNil()) throw new Error("cannot read file: " + p);
  return s.js;
}
function writeFile(p, text) {
  $(text).writeToFileAtomicallyEncodingError($(p), true, $.NSUTF8StringEncoding, $());
}
function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

// JXA's console has log/error; make sure the names the engine guards on exist.
if (typeof console === "undefined") this.console = { log: function () {} };
["warn", "error", "debug", "info"].forEach(function (k) {
  if (typeof console[k] !== "function") console[k] = console.log;
});

/* ---- config (written by storytest.py) ------------------------------------ */
var cfgPath = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey("IDN_TEST_CONFIG"));
if (!cfgPath) throw new Error("IDN_TEST_CONFIG not set — run me via storytest.py");
var CFG = JSON.parse(readFile(cfgPath));

/* ---- browser stubs --------------------------------------------------------
 * Just enough `window` for the engine scripts. IDN.glitch/clock/voice stay
 * null so applyPresentationEffects/Target no-op (the engine guards each). */
var window = this;
window.window = window;
window.IDN = {
  config: { llm: { provider: "harness" }, engine: CFG.engine || {} },
  glitch: null, clock: null, voice: null,
};

/* ---- load the real code (llm → engine → story, like the page) ------------ */
eval(readFile(CFG.root + "/engine/llm.js"));
eval(readFile(CFG.root + "/engine/engine.js"));
eval(readFile(CFG.storyPath)); // sets window.IDN_STORY

/* ---- the harness LLM provider: synchronous curl → Ollama ----------------- */
var TMPDIR = ObjC.unwrap($.NSTemporaryDirectory()) + "idn-storytest-" +
             ObjC.unwrap($.NSProcessInfo.processInfo.globallyUniqueString);
$.NSFileManager.defaultManager
  .createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(TMPDIR), true, $(), $());

var reqN = 0;
var llmLog = []; // calls made during the current turn (reset per turn, emitted with it)

function ollamaChatSync(messages, opts) {
  var kind = (opts && opts.format) ? "appraise" : "render";
  var body = {
    model: (opts && opts.model) || CFG.ollama.model,
    messages: messages,
    stream: false,
    options: Object.assign({}, CFG.ollama.options || {}, (opts && opts.options) || {}),
  };
  if (opts && opts.format) body.format = opts.format; // structured outputs, same as providers/ollama.js
  var reqPath = TMPDIR + "/req-" + (++reqN) + ".json";
  writeFile(reqPath, JSON.stringify(body));
  var t0 = Date.now(), raw;
  try {
    raw = App.doShellScript(
      "curl -sS --fail --max-time " + Math.ceil((CFG.ollama.timeoutMs || 120000) / 1000) +
      " -H 'Content-Type: application/json' --data-binary @" + shq(reqPath) + " " + shq(CFG.ollama.endpoint)
    );
  } catch (e) {
    llmLog.push({ kind: kind, model: body.model, ms: Date.now() - t0,
                  error: String((e && e.message) || e), messages: messages });
    throw new Error("ollama call failed: " + ((e && e.message) || e));
  }
  var data = JSON.parse(raw);
  var text = (data.message && data.message.content) || "";
  llmLog.push({ kind: kind, model: body.model, ms: Date.now() - t0,
                response: text, messages: messages, options: body.options });
  return text;
}

IDNLLM.use("harness", {
  chat: async function (messages, opts) {
    if (CFG.provider === "off") throw new Error("LLM disabled by harness (provider=off)");
    return ollamaChatSync(messages, opts);
  },
});

if (CFG.render === false) {
  // routing stays live; re-voicing throws → _renderBeat falls back to the authored beat (fast turns)
  IDNLLM.render = function () { return Promise.reject(new Error("render disabled by harness")); };
}

/* ---- run the scenario ----------------------------------------------------- */
(async function main() {
  try {
    var story = window.IDN_STORY;
    if (!story) throw new Error("story file did not set window.IDN_STORY: " + CFG.storyPath);
    var eng = new IDNEngineClass(story, { seed: (CFG.seed != null ? CFG.seed : 1) });

    if (CFG.at) {                 // probe mode: jump straight to a node (runs its onEnter)
      eng._enter(CFG.at);
      eng.state.visited = [CFG.at];
    }
    if (CFG.world) Object.keys(CFG.world).forEach(function (k) {
      IDNEngineClass.setPath(eng.state, "world." + k, CFG.world[k]);
    });

    emit({ type: "meta", story: (story.meta && story.meta.title) || null, start: eng.state.current,
           provider: CFG.provider, model: CFG.ollama && CFG.ollama.model,
           render: CFG.render !== false, seed: CFG.seed });

    var history = [];
    if (CFG.opening) {
      llmLog = [];
      var opener = await eng.openingBeatVoiced();
      emit({ type: "opening", reply: opener, state: eng.state.current, llm: llmLog });
    }

    var turns = CFG.turns || [];
    for (var i = 0; i < turns.length; i++) {
      var input = turns[i];
      llmLog = [];
      eng.lastAppraisal = null; // keyword-fallback path doesn't set it — don't let a stale one lie

      history.push({ role: "user", content: input });
      var recent = history.slice(0, -1).slice(-8); // exactly what the page passes (tone only)
      var reply = await eng.takeTurn(input, recent);
      history.push({ role: "assistant", content: reply });

      var m = /^(.*) \[(.*)\]$/.exec(eng.lastRoute || "");
      emit({
        type: "turn", i: i + 1, input: input, reply: reply,
        state: eng.state.current, ended: eng.ended,
        route: m ? m[1] : eng.lastRoute, kind: m ? m[2] : null,
        appraisal: eng.lastAppraisal,
        world: eng.state.world, flags: eng.state.flags, chars: eng.state.characters,
        llm: llmLog,
      });
      if (eng.ended) break;
    }
    emit({ type: "done" });
  } catch (e) {
    emit({ type: "fatal", error: String((e && e.message) || e), stack: (e && e.stack) || null });
  }
})();
""; // script result (ignored) — the async chain above drains after this line
