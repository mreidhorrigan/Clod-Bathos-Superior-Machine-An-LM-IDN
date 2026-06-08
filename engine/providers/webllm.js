/* ===========================================================================
 * IDN LLM PROVIDER · WEBLLM   (engine/providers/webllm.js)
 * ===========================================================================
 * Runs a real model ENTIRELY IN THE BROWSER via WebLLM (MLC) + WebGPU — no
 * Ollama, no inference server. This is the provider for the "web" build.
 *
 * REQUIREMENTS (documented for the user): a WebGPU browser (Chrome/Edge, recent
 * Safari) and HTTP hosting — module workers + WebGPU do NOT run from file://.
 * The model weights (~hundreds of MB) download once on first run and are cached
 * by the browser; the loading screen shows progress via init().
 *
 * IMPORTANT: the WebLLM library is loaded with a DYNAMIC import() that only fires
 * the first time this provider is actually used. So in the file:// "folder" build
 * (where CONFIG.llm.provider = 'ollama') this script is completely inert — it
 * registers itself but never imports anything.
 *
 * Registers as the 'webllm' provider. Contract:
 *   chat(messages, { format?, options? }) -> Promise<string>
 *   init(onProgress) -> Promise   // warm up / download the model
 * ===========================================================================*/
(function (global) {
  "use strict";

  // pinning a version is fine too, e.g. ".../@mlc-ai/web-llm@0.2.79"
  var WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";

  function wcfg() {
    var IDN = global.IDN || {};
    return (IDN.config && IDN.config.webllm) || {};
  }
  function modelId() { return wcfg().model || "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"; }

  var mlc = null;            // the imported module
  var engine = null;         // the live MLCEngine
  var enginePromise = null;  // in-flight init (so concurrent callers share one load)
  var progressCb = null;     // last progress listener (set by init)
  var schemaUnsupported = false;
  var lastError = null;      // last init failure, surfaced in-terminal for diagnosis

  // Load the library (once) + create the engine (once), reporting download progress.
  async function ensureEngine(onProgress) {
    if (onProgress) progressCb = onProgress;
    if (engine) return engine;
    if (!enginePromise) {
      enginePromise = (async function () {
        if (!mlc) mlc = await import(/* @vite-ignore */ WEBLLM_URL);
        engine = await mlc.CreateMLCEngine(modelId(), {
          initProgressCallback: function (p) { if (progressCb) { try { progressCb(p); } catch (e) {} } },
        });
        return engine;
      })().catch(function (e) { enginePromise = null; lastError = e; throw e; }); // allow a later retry
    }
    return enginePromise;
  }

  // Warm-up hook for the loading screen (downloads weights, streams progress).
  async function init(onProgress) { return ensureEngine(onProgress); }

  // map our JSON-schema `format` -> WebLLM structured output (best effort).
  function requestFor(messages, opts) {
    var o = opts.options || {};
    var req = {
      messages: messages,
      temperature: (o.temperature != null ? o.temperature : 0.7),
      max_tokens: (o.num_predict != null ? o.num_predict : 400),
    };
    // Anti-repetition (OpenAI-style; supported by MLC). Forwarded only when set, so
    // the temp-0 structured routing call (which omits them) is left untouched. Small
    // models like SmolLM2 collapse into phrase loops on free-form text without these.
    if (o.frequency_penalty != null) req.frequency_penalty = o.frequency_penalty;
    if (o.presence_penalty != null) req.presence_penalty = o.presence_penalty;
    if (opts.format && !schemaUnsupported) {
      try { req.response_format = { type: "json_object", schema: JSON.stringify(opts.format) }; }
      catch (e) { req.response_format = { type: "json_object" }; }
    } else if (opts.format) {
      req.response_format = { type: "json_object" }; // schema unsupported on this build → plain JSON
    }
    return req;
  }

  async function chat(messages, opts) {
    opts = opts || {};
    var eng = await ensureEngine();
    var res;
    try {
      res = await eng.chat.completions.create(requestFor(messages, opts));
    } catch (e) {
      // Some WebLLM versions reject a schema'd response_format — retry as plain JSON once.
      if (opts.format && !schemaUnsupported) {
        schemaUnsupported = true;
        if (global.console) console.warn("[IDN webllm] schema response_format unsupported; retrying as json_object");
        res = await eng.chat.completions.create(requestFor(messages, opts));
      } else {
        throw e;
      }
    }
    return (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || "";
  }

  if (global.IDNLLM && global.IDNLLM.use) {
    // `available()` reports whether the in-browser engine actually loaded (so the
    // boot screen can warn if we're silently on the keyword/authored-text fallback).
    global.IDNLLM.use("webllm", { chat: chat, init: init, available: function () { return !!engine; }, error: function () { return lastError; } });
  } else if (global.console) {
    console.warn("[IDN webllm] IDNLLM not found — load engine/llm.js before this provider.");
  }
})(window);
