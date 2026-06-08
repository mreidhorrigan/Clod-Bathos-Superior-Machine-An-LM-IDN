/* ===========================================================================
 * IDN LLM PROVIDER · OLLAMA   (engine/providers/ollama.js)
 * ===========================================================================
 * Talks to a LOCAL Ollama server over HTTP (default http://localhost:11434).
 * This is the provider for the "folder" build: the user installs Ollama, runs
 *   OLLAMA_ORIGINS='*' ollama serve
 * and opens the page from file://. If Ollama isn't running, chat() throws and
 * the FSM falls back to keyword routing + authored beats (still playable).
 *
 * Registers itself as the 'ollama' provider via IDNLLM.use(). Loads as a classic
 * <script> AFTER engine/llm.js, so window.IDNLLM already exists. Reads its
 * settings from CONFIG.ollama (unchanged from earlier versions).
 *
 * Contract: chat(messages, { format?, options?, model? }) -> Promise<string>
 *   `format` (a JSON-schema object) maps to Ollama's `format` field = structured
 *   outputs (constrained decoding), so appraise() gets schema-valid JSON back.
 * ===========================================================================*/
(function (global) {
  "use strict";

  // Lazily read the page CONFIG so script load-order never matters.
  function cfg() {
    var IDN = global.IDN || {};
    var c = (IDN.config && IDN.config.ollama) || {};
    return {
      endpoint:    c.endpoint  || "http://localhost:11434/api/chat",
      model:       c.model     || "llama3.2",
      timeoutMs:   c.timeoutMs || 30000,
      baseOptions: c.options   || {},
    };
  }

  /* Single non-streaming chat call. `opts.format` (JSON schema) -> structured outputs. */
  async function chat(messages, opts) {
    opts = opts || {};
    var c = cfg();
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, c.timeoutMs);

    var body = {
      model:    opts.model || c.model,
      messages: messages,
      stream:   false,
      options:  Object.assign({}, c.baseOptions, opts.options || {}),
    };
    if (opts.format) body.format = opts.format; // <- structured outputs

    var res;
    try {
      res = await fetch(c.endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  ctrl.signal,
        body:    JSON.stringify(body),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("Ollama HTTP " + res.status);
    var data = await res.json();
    return (data.message && data.message.content) || "";
  }

  /* Optional reachability probe (cached). Handy for boot/debug; the turn loop
   * just tries chat() and falls back on error. */
  var _reachable = null;
  async function available() {
    if (_reachable !== null) return _reachable;
    try {
      var base = cfg().endpoint.replace(/\/api\/.*$/, "");
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 1500);
      var res = await fetch(base + "/api/tags", { signal: ctrl.signal });
      clearTimeout(timer);
      _reachable = res.ok;
    } catch (e) {
      _reachable = false;
    }
    return _reachable;
  }
  function resetAvailability() { _reachable = null; }

  // Register with the dispatcher (engine/llm.js loads first).
  if (global.IDNLLM && global.IDNLLM.use) {
    global.IDNLLM.use("ollama", { chat: chat, available: available, resetAvailability: resetAvailability });
  } else if (global.console) {
    console.warn("[IDN ollama] IDNLLM not found — load engine/llm.js before this provider.");
  }
})(window);
