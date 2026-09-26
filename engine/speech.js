/* ===========================================================================
 * IDN ENGINE · SPEECH-TO-TEXT / VOICE-CONTROL LAYER   (engine/speech.js)
 * ===========================================================================
 * The mirror image of engine/voice.js: where voice.js SPEAKS the narrator,
 * this LISTENS to the player. The mic feeds a recogniser whose final transcript
 * is dropped into the prompt exactly as if the player had typed it — so the same
 * deterministic FSM + LLM appraisal drives the story, no special voice path.
 *
 *   player speaks ─▶ recogniser ─▶ transcript ─▶ (the normal input/handleSubmit)
 *
 * PROVIDER-AGNOSTIC, exactly like the LLM dispatcher (engine/llm.js). One config
 * switch picks the recogniser:
 *
 *      CONFIG.speech.provider  ->  'webspeech'   (default; the only built-in)
 *
 * The built-in 'webspeech' provider uses the browser's Web Speech API
 * (SpeechRecognition / webkitSpeechRecognition). It is the ONLY option that fits
 * this template's rules — zero dependencies, zero bytes downloaded, no build, and
 * it loads from a classic <script> like everything else. It runs in the same
 * Chrome/Edge target the rest of the project already requires (Firefox ships
 * neither SpeechRecognition nor the WebGPU path; Safari is partial). On Chrome it
 * historically streamed audio to Google's cloud; the 2026 spec adds ON-DEVICE
 * recognition (`processLocally`), which we PREFER when the browser has it and
 * silently fall back to remote when it doesn't.
 *
 * Want fully-offline STT instead? Implement the same tiny contract against
 * Whisper (transformers.js + WebGPU) or Vosk (WASM) in engine/providers/, then
 * `IDNSpeech.use('whisper', impl)` — same shape as the LLM providers. Those pull
 * 50 MB–GB of model weights from a CDN, so they're intentionally NOT bundled here
 * (that would break the no-runtime-fetch, file://-friendly promise); the seam is
 * left open on purpose.
 *
 * PROVIDER CONTRACT
 *   provider.supported()            -> bool
 *   provider.start(handlers, opts)  -> void   // begin recognising
 *   provider.stop()                 -> void   // stop/cancel immediately
 *   handlers = { onStart, onInterim(text), onFinal(text), onEnd, onError(code) }
 *   opts     = { lang, continuous, interimResults, maxAlternatives, preferLocal }
 *
 * PUBLIC API  (also surfaced as window.IDN.speech)
 *   IDNSpeech.supported()                 is a recogniser available at all?
 *   IDNSpeech.start() / .stop() / .toggle()   begin / end listening
 *   IDNSpeech.listening                   bool (live)
 *   IDNSpeech.setEnabled(bool)/.toggle()/.enabled   master affordance on/off
 *   IDNSpeech.on(type, fn) -> off()       'start'|'end'|'interim'|'final'|'error'|'state'
 *   IDNSpeech.attach({ input, submit, button })   one-call wiring (see the HTML)
 *   IDNSpeech.use(name, impl) / .provider()       provider plumbing (like IDNLLM)
 *
 * Degrade, never throw: if no recogniser exists (or the mic is blocked) every
 * call no-ops and supported() is false — the player just types. Reads its config
 * lazily from window.IDN.config.speech, so script load order never matters. No
 * modules, no build step. Loads fine from file:// (though the mic itself needs a
 * secure context — localhost/https — so it's happiest in the served build).
 * ===========================================================================*/
(function (global) {
  "use strict";

  /* ---- lazy config (mirrors engine/llm.js + voice.js: never touch IDN at load) */
  function cfg() {
    var IDN = global.IDN || {};
    var s = (IDN.config && IDN.config.speech) || {};
    return {
      enabled:           s.enabled           !== false,  // master on/off (the mic affordance)
      provider:          s.provider          || "webspeech",
      lang:              s.lang              || "en-US",
      continuous:        !!s.continuous,                 // hands-free: keep listening across turns
      interimResults:    s.interimResults    !== false,  // stream partial words into the input box
      autoSubmit:        s.autoSubmit        !== false,  // a final transcript is sent automatically
      maxAlternatives:   s.maxAlternatives   || 1,
      preferLocal:       s.preferLocal       !== false,  // request on-device recognition when supported
      localOnly:         !!s.localOnly,                  // (webspeech) require on-device; NEVER use cloud
      muteWhileSpeaking: s.muteWhileSpeaking !== false,  // ignore the mic while the narrator (TTS) talks
    };
  }

  /* ---- provider registry (identical shape to IDNLLM.use) -------------------- */
  var providers = {};
  function providerName() {
    try {
      var q = new URLSearchParams((global.location && global.location.search) || "").get("stt");
      if (q) return q;                                   // ?stt=webspeech override, for quick A/B
    } catch (e) {}
    return cfg().provider;
  }
  function activeProvider() { return providers[providerName()]; }

  /* ---- tiny event bus ------------------------------------------------------- */
  var bus = {};
  function on(type, fn) {
    (bus[type] || (bus[type] = [])).push(fn);
    return function off() { var a = bus[type]; if (!a) return; var i = a.indexOf(fn); if (i !== -1) a.splice(i, 1); };
  }
  function emit(type, payload) {
    var a = bus[type]; if (!a) return;
    for (var i = 0; i < a.length; i++) { try { a[i](payload); } catch (e) { if (global.console) console.warn("[IDN speech] listener error:", e); } }
  }

  /* ---- is the narrator currently speaking? (anti-echo for continuous mode) --- */
  function narratorSpeaking() {
    try { var V = global.IDNVoice; return !!(V && typeof V.isSpeaking === "function" && V.isSpeaking()); }
    catch (e) { return false; }
  }

  /* ===========================================================================
   * SUBSYSTEM STATE + CORE
   * ===========================================================================*/
  var state = {
    listening: false,     // recogniser is live right now
    want: false,          // the user asked to listen (drives continuous auto-restart)
    forceEnabled: null,   // setEnabled() override of cfg().enabled
    starting: false,      // guards the start() race (recognisers throw if double-started)
    ptt: false,           // push-to-talk hold in progress (Space): finalize on release
  };

  function supported() {
    var p = activeProvider();
    return !!(p && typeof p.supported === "function" && p.supported());
  }

  function isEnabled() { return state.forceEnabled != null ? state.forceEnabled : cfg().enabled; }

  function setListening(v) {
    if (state.listening === v) return;
    state.listening = v;
    emit("state", { listening: v, enabled: isEnabled() });
  }

  // The handlers we hand to the active provider. The subsystem owns POLICY
  // (anti-echo gating, continuous auto-restart, event fan-out); the provider only
  // owns raw recognition.
  var handlers = {
    onStart: function () { state.starting = false; setListening(true); emit("start"); },
    onInterim: function (text) {
      if (!text) return;
      if (cfg().muteWhileSpeaking && narratorSpeaking()) return;   // it's hearing the TTS, not the player
      emit("interim", text);
    },
    onFinal: function (text) {
      text = (text || "").trim();
      if (!text) return;
      if (cfg().muteWhileSpeaking && narratorSpeaking()) return;
      emit("final", text);
    },
    onEnd: function () {
      // Recognisers end themselves after a phrase (or a silence timeout). If the
      // user still wants to listen (continuous, no manual stop, no fatal error),
      // transparently restart so it feels uninterrupted.
      var keepGoing = state.want && cfg().continuous;
      state.starting = false;
      setListening(false);
      emit("end");
      if (keepGoing) { setTimeout(function () { if (state.want) reallyStart(); }, 250); }
      else { state.want = false; }
    },
    onError: function (code) {
      // 'no-speech'/'aborted' are benign (silence or our own stop). Permission /
      // local-unavailable / model failures are fatal — stop wanting, surface it.
      state.starting = false;   // important: an async provider may error BEFORE onStart
      if (code === "not-allowed" || code === "service-not-allowed" ||
          code === "local-unavailable" || code === "model-load-failed" ||
          code === "mic-failed" || code === "unsupported") state.want = false;
      emit("error", code);
    },
    // Provider progress / one-line status (e.g. the Whisper model downloading).
    onStatus: function (msg) { emit("status", msg); },
  };

  function reallyStart() {
    var p = activeProvider();
    if (!p || !supported()) { emit("error", "unsupported"); return false; }
    if (state.listening || state.starting) return true;       // already going
    state.starting = true;
    var c = cfg();
    try {
      p.start(handlers, {
        lang: c.lang, continuous: state.ptt ? false : c.continuous, interimResults: c.interimResults,
        maxAlternatives: c.maxAlternatives, preferLocal: c.preferLocal, localOnly: c.localOnly,
        pushToTalk: state.ptt,            // skip the provider's silence endpointer; wait for release()
      });
      return true;
    } catch (e) {
      state.starting = false;
      if (global.console) console.warn("[IDN speech] start failed:", e);
      emit("error", "start-failed");
      return false;
    }
  }

  function start() {
    if (!isEnabled()) return false;
    state.want = true;
    return reallyStart();
  }
  function stop() {
    state.want = false; state.ptt = false;
    var p = activeProvider();
    try { if (p && typeof p.stop === "function") p.stop(); } catch (e) {}
    setListening(false);
  }
  function toggle() { return state.listening || state.want ? (stop(), false) : start(); }

  /* push-to-talk: hold to capture, release to transcribe + submit ONE phrase. The
   * provider is started with pushToTalk:true so it skips its silence endpointer and
   * keeps capturing until release() calls endSegment(). Providers without endSegment
   * fall back to stop(). Drives the spacebar-to-talk binding in the HTML. */
  function push() {
    if (!isEnabled()) return false;
    if (state.ptt) return true;                 // already holding
    state.ptt = true; state.want = true;
    return reallyStart();
  }
  function release() {
    if (!state.ptt) return false;
    state.ptt = false; state.want = false;      // this is the last phrase — don't auto-restart
    var p = activeProvider();
    if (p && typeof p.endSegment === "function") { try { p.endSegment(); } catch (e) {} }
    else stop();
    return true;
  }

  /* ===========================================================================
   * attach(): the one-call DOM glue. Keeps the module DOM-agnostic (like voice.js)
   * while making the HTML side a single line. Wires:
   *   · interim transcript -> live into `input` (so you watch it land)
   *   · final transcript   -> `submit(text)` when CONFIG.speech.autoSubmit (default),
   *                           else left in `input` for you to edit + press Enter
   *   · `button` (optional) -> click toggles; gets .listening / aria-pressed; hidden
   *                            when no recogniser exists (the affordance is moot)
   * ===========================================================================*/
  function attach(o) {
    o = o || {};
    var input = o.input || null, submit = o.submit || null, button = o.button || null;
    var priorPlaceholder = input ? input.getAttribute("placeholder") : null;

    if (button) {
      // The button defaults to hidden in CSS (.micbtn{display:none}); reveal it
      // only when a recogniser actually exists, via a class so it stays hidden if
      // this script ever fails to load. No layout knowledge leaks into JS.
      if (supported()) {
        button.classList.add("available");
        button.addEventListener("click", function (e) { e.preventDefault(); toggle(); });
      } else {
        button.classList.remove("available");
      }
    }

    on("interim", function (text) { if (input) input.value = text; });

    on("final", function (text) {
      if (cfg().autoSubmit && submit) {
        if (input) input.value = "";
        submit(text);
      } else if (input) {
        input.value = text;            // park it for review; player presses Enter
        try { input.focus(); } catch (e) {}
      }
    });

    function applyState(s) {
      if (button) {
        button.classList.toggle("listening", !!s.listening);
        try { button.setAttribute("aria-pressed", s.listening ? "true" : "false"); } catch (e) {}
        try { button.title = s.listening ? "Stop listening" : "Speak (voice input)"; } catch (e) {}
      }
      if (input) {
        if (s.listening) input.setAttribute("placeholder", "listening…");
        else if (priorPlaceholder != null) input.setAttribute("placeholder", priorPlaceholder);
        else input.removeAttribute("placeholder");
      }
    }
    on("state", applyState);
    applyState({ listening: state.listening, enabled: isEnabled() });   // sync now, regardless of attach timing

    return IDNSpeech;   // chainable
  }

  /* ===========================================================================
   * PUBLIC API
   * ===========================================================================*/
  var IDNSpeech = {
    supported: supported,
    start: start,
    stop: stop,
    toggle: toggle,
    push: push,         // push-to-talk: hold (Space) to capture…
    release: release,   // …release to transcribe + submit one phrase
    attach: attach,
    on: on,
    // Optional pre-warm: download/initialise the active provider's model now (e.g.
    // IDN.speech.init() to pull the Whisper model before the first mic press).
    init: function (onProgress) {
      var p = activeProvider();
      return (p && typeof p.init === "function") ? p.init(onProgress) : Promise.resolve(null);
    },

    get listening() { return state.listening; },
    get enabled() { return isEnabled(); },
    setEnabled: function (b) { state.forceEnabled = !!b; if (!b) stop(); emit("state", { listening: state.listening, enabled: isEnabled() }); return isEnabled(); },
    toggleEnabled: function () { return this.setEnabled(!isEnabled()); },

    // provider plumbing (mirrors IDNLLM)
    use: function (name, impl) { providers[name] = impl; return impl; },
    provider: providerName,
    providers: providers,
  };

  /* ===========================================================================
   * BUILT-IN PROVIDER · WEB SPEECH API  ('webspeech')
   * ---------------------------------------------------------------------------
   * Self-registers below, exactly like engine/providers/ollama.js self-registers
   * with IDNLLM. Kept in this file (not engine/providers/) because it's tiny and
   * dependency-free — the default needs no extra <script> tag. Heavier offline
   * providers belong in their own engine/providers/ file.
   * ===========================================================================*/
  (function registerWebSpeech() {
    function Ctor() { return global.SpeechRecognition || global.webkitSpeechRecognition || null; }

    var rec = null;          // the live SpeechRecognition instance
    var localBlocked = false; // set once if on-device was requested but unsupported → fall back to remote

    function supportedWS() { return !!Ctor(); }

    function build(h, opts) {
      var C = Ctor(); if (!C) return null;
      var r = new C();
      r.lang = opts.lang || "en-US";
      r.continuous = !!opts.continuous;
      r.interimResults = opts.interimResults !== false;
      r.maxAlternatives = opts.maxAlternatives || 1;

      // 2026 on-device recognition: localOnly REQUIRES it; preferLocal merely wants
      // it (and may fall back to the cloud). Either way, request it when exposed.
      var wantLocal = opts.localOnly || (opts.preferLocal && !localBlocked);
      if (wantLocal && ("processLocally" in r)) {
        try { r.processLocally = true; } catch (e) {}
      }

      r.onstart = function () { if (h.onStart) h.onStart(); };
      r.onresult = function (e) {
        var interim = "", final = "";
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var res = e.results[i];
          var t = (res[0] && res[0].transcript) || "";
          if (res.isFinal) final += t; else interim += t;
        }
        if (interim && h.onInterim) h.onInterim(interim);
        if (final && h.onFinal) h.onFinal(final);
      };
      r.onerror = function (e) {
        var code = (e && e.error) || "error";
        var localFail = (code === "language-not-supported" || code === "service-not-allowed");
        // On-device requested but unavailable: unless localOnly, remember it so the
        // restart/cloud path can take over instead of dying silently.
        if (!opts.localOnly && !localBlocked && r.processLocally && localFail) localBlocked = true;
        // localOnly NEVER falls back to the cloud — report it plainly.
        if (opts.localOnly && localFail) code = "local-unavailable";
        if (h.onError) h.onError(code);
      };
      r.onend = function () { if (h.onEnd) h.onEnd(); };
      return r;
    }

    function startWS(h, opts) {
      stopWS();                          // never double-start
      rec = build(h, opts);
      if (!rec) { if (h.onError) h.onError("unsupported"); return; }
      try {
        rec.start();
      } catch (e) {
        // Synchronous throw (e.g. on-device model not present). Unless localOnly,
        // drop on-device and retry once over the cloud so the mic still works.
        if (!opts.localOnly && rec.processLocally && !localBlocked) {
          localBlocked = true;
          try { rec.processLocally = false; rec.start(); return; } catch (e2) {}
        }
        if (h.onError) h.onError(opts.localOnly ? "local-unavailable" : "start-failed");
      }
    }

    function stopWS() {
      if (!rec) return;
      try { rec.onend = rec.onresult = rec.onerror = rec.onstart = null; rec.abort(); } catch (e) {}
      rec = null;
    }

    IDNSpeech.use("webspeech", { supported: supportedWS, start: startWS, stop: stopWS });
  })();

  global.IDNSpeech = IDNSpeech;
})(typeof window !== "undefined" ? window : this);
