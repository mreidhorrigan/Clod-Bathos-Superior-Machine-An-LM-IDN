/* ===========================================================================
 * IDN SPEECH PROVIDER · WHISPER (FULLY OFFLINE)   (engine/providers/whisper-stt.js)
 * ===========================================================================
 * Speech-to-text that runs ENTIRELY IN THE BROWSER and NEVER touches the cloud —
 * the no-cloud answer to the built-in 'webspeech' provider. It is to STT what
 * engine/providers/webllm.js is to the LLM: a real model running locally on
 * WebGPU (or WASM), with weights streamed ONCE from a CDN and then browser-cached.
 * The microphone audio is captured, resampled, and transcribed on-device; nothing
 * is ever sent anywhere.
 *
 * Uses Hugging Face Transformers.js (the maintained successor to @xenova/transformers)
 * pulled with a DYNAMIC import() that only fires the first time this provider is
 * actually used — so when CONFIG.speech.provider != 'whisper' this script is inert
 * (it registers itself but imports nothing and downloads nothing).
 *
 * REQUIREMENTS (documented for the user, same shape as WebLLM):
 *   · a modern Chromium/WebGPU browser (falls back to slower WASM without WebGPU)
 *   · http hosting + mic permission — getUserMedia needs a SECURE CONTEXT
 *     (localhost/https), so this is for the served build, not a file:// page.
 * The model (tens–hundreds of MB) downloads on FIRST mic use, not at boot, so
 * players who never speak never pay for it.
 *
 * Registers as the 'whisper' provider. Contract (engine/speech.js):
 *   supported()            -> bool
 *   start(handlers, opts)  -> void      // load model (once) -> capture -> transcribe
 *   stop()                 -> void      // cancel immediately
 *   init(onProgress)       -> Promise   // optional pre-warm (download the model now)
 *   handlers = { onStart, onInterim, onFinal(text), onEnd, onError(code), onStatus(msg) }
 *
 * No streaming partials: Whisper transcribes a finished phrase. Tap-to-talk is
 * implemented with a tiny energy-based endpointer (speak, pause, it submits);
 * `continuous` keeps the mic open and segments on each silence.
 *
 * PORTABILITY NOTE: capture uses a ScriptProcessorNode (not an AudioWorklet) to
 * match the rest of this template — Worklets need addModule(url), which fails over
 * file://. Resampling to Whisper's 16 kHz uses an OfflineAudioContext (no fetch).
 * ===========================================================================*/
(function (global) {
  "use strict";

  // Pin a version if you like, e.g. ".../@huggingface/transformers@3.x".
  var LIB_URL = "https://esm.run/@huggingface/transformers";

  function wcfg() {
    var IDN = global.IDN || {};
    var s = (IDN.config && IDN.config.speech) || {};
    var w = s.whisper || {};
    return {
      model:        w.model        || "Xenova/whisper-base.en", // any transformers.js ASR id; '.en' = English-only
      device:       w.device       || "auto",                  // 'auto' | 'webgpu' | 'wasm'
      dtype:        w.dtype         || null,                    // 'fp32'|'fp16'|'q8'|… (null = library default)
      language:     w.language      || null,                    // multilingual models only ('english', 'french', …)
      silenceMs:    (w.silenceMs    != null ? w.silenceMs    : 1100), // trailing silence that ends a phrase
      minSpeechMs:  (w.minSpeechMs  != null ? w.minSpeechMs  : 250),  // ignore sub-quarter-second blips
      maxSeconds:   (w.maxSeconds   != null ? w.maxSeconds   : 20),   // hard cap on one phrase
      vadThreshold: (w.vadThreshold != null ? w.vadThreshold : 0.012),// RMS gate for "is this speech?"
      normalize:    !!w.normalize,                                     // OFF by default: the naive RMS boost amplified room noise → Whisper hallucinated
      leadTrimMs:   (w.leadTrimMs   != null ? w.leadTrimMs   : 0),      // trim clip start (0 = keep onset; the preroll already covers the cue)
      prerollMs:    (w.prerollMs    != null ? w.prerollMs    : 500),    // PRE-press audio kept on a warm mic, so a fast/early onset is never lost
      idleReleaseMs:(w.idleReleaseMs!= null ? w.idleReleaseMs: 20000),  // release a warm (idle) mic after this long with no push
    };
  }

  function supported() {
    try {
      var md = global.navigator && global.navigator.mediaDevices;
      return !!(md && md.getUserMedia &&
                (global.AudioContext || global.webkitAudioContext) &&
                (global.OfflineAudioContext || global.webkitOfflineAudioContext));
    } catch (e) { return false; }
  }

  /* ---- lazy library + model (mirrors engine/providers/webllm.js) ----------- */
  var lib = null, transcriber = null, loadPromise = null, lastError = null, statusCb = null;

  function pickDevice() {
    var d = wcfg().device;
    if (d && d !== "auto") return d;
    try { return (global.navigator && global.navigator.gpu) ? "webgpu" : "wasm"; }
    catch (e) { return "wasm"; }
  }

  async function ensurePipeline(onStatus) {
    if (onStatus) statusCb = onStatus;
    if (transcriber) return transcriber;
    if (!loadPromise) {
      loadPromise = (async function () {
        if (statusCb) statusCb("VOICE INPUT · loading offline model…");
        if (!lib) lib = await import(/* @vite-ignore */ LIB_URL);
        var c = wcfg(), lastPct = -1;
        var progress = function (p) {
          try {
            if (!statusCb || !p) return;
            if (p.status === "progress" && typeof p.progress === "number") {
              var pct = Math.round(p.progress);                          // transformers.js reports 0..100
              if (pct !== lastPct && pct % 5 === 0) { lastPct = pct; statusCb("VOICE INPUT · downloading model " + pct + "%"); }
            } else if (p.status === "ready") {
              statusCb("VOICE INPUT · model ready");
            }
          } catch (e) {}
        };
        var make = function (device) {
          var opts = { device: device, progress_callback: progress };
          if (c.dtype) opts.dtype = c.dtype;
          return lib.pipeline("automatic-speech-recognition", c.model, opts);
        };
        var dev = pickDevice();
        try { transcriber = await make(dev); }
        catch (e) {
          if (dev === "webgpu") {                                        // WebGPU is finicky — fall back to WASM
            if (statusCb) statusCb("VOICE INPUT · WebGPU unavailable, retrying on WASM…");
            transcriber = await make("wasm");
          } else { throw e; }
        }
        if (statusCb) statusCb("");                                       // clear the status line
        return transcriber;
      })().catch(function (e) { loadPromise = null; lastError = e; if (statusCb) statusCb(""); throw e; });
    }
    return loadPromise;
  }

  async function init(onProgress) { return ensurePipeline(onProgress); }

  /* ---- mic capture + a tiny energy VAD endpointer --------------------------- */
  var ac = null, stream = null, srcNode = null, proc = null, sink = null;
  var chunks = [], capRate = 16000, capturing = false, runToken = 0;
  var handlersRef = null, optsRef = null;
  var speechMs = 0, silenceMs = 0, totalMs = 0, heardSpeech = false;
  // WARM-MIC: keep the stream + graph alive between push-to-talk presses so capture
  // is live the INSTANT Space goes down (getUserMedia latency would otherwise eat the
  // onset — the "wait a beat before speaking" problem). While warm-but-idle we keep a
  // short rolling PREROLL of recent audio, so speech started a hair early is captured
  // too. An idle timer releases the mic (drops the recording indicator) after a quiet
  // spell.
  var warm = false, preroll = [], prerollSamples = 0, idleTimer = null;

  function AC()  { return global.AudioContext || global.webkitAudioContext; }
  function OAC() { return global.OfflineAudioContext || global.webkitOfflineAudioContext; }

  function clearIdle() { if (idleTimer && global.clearTimeout) global.clearTimeout(idleTimer); idleTimer = null; }
  function armIdle() {
    clearIdle();
    var ms = wcfg().idleReleaseMs;
    if (ms > 0 && global.setTimeout) idleTimer = global.setTimeout(function () {
      idleTimer = null; if (!capturing && !busy) teardown();    // release the warm mic after a quiet spell
    }, ms);
  }

  // Acquire the mic + build the capture graph ONCE and keep it WARM. Idempotent: if
  // already warm it returns immediately (so a push begins instantly). While warm but
  // not capturing, onAudio fills the rolling PREROLL buffer instead of `chunks`.
  async function ensureMic() {
    if (warm && stream && ac && proc) return;
    stream = await global.navigator.mediaDevices.getUserMedia({ audio: true });
    ac = new (AC())();
    capRate = ac.sampleRate;
    srcNode = ac.createMediaStreamSource(stream);
    proc = ac.createScriptProcessor(4096, 1, 1);
    sink = ac.createGain(); sink.gain.value = 0;
    preroll = []; prerollSamples = 0;
    proc.onaudioprocess = onAudio;
    srcNode.connect(proc); proc.connect(sink); sink.connect(ac.destination);
    // A long model download/permission prompt can outlive the click gesture, leaving
    // the context suspended (then onaudioprocess never fires) — resume it.
    if (ac.state === "suspended") { try { ac.resume(); } catch (e) {} }
    warm = true;
  }

  // Flip warm -> capturing, seeding `chunks` with the preroll so the utterance's very
  // start (spoken at, or just before, the press) is included.
  function beginCapture() {
    chunks = preroll.slice();
    totalMs = (prerollSamples / capRate) * 1000;
    speechMs = 0; silenceMs = 0; heardSpeech = false;
    preroll = []; prerollSamples = 0;
    capturing = true;
  }

  async function start(handlers, opts) {
    var myToken = ++runToken;            // bumped by stop(); lets us bail out of a cancelled load
    handlersRef = handlers; optsRef = opts || {};
    clearIdle();
    if (!supported()) { if (handlers.onError) handlers.onError("unsupported"); return; }

    // 1) model first (may download on first use); progress streams to the status line
    try { await ensurePipeline(handlers.onStatus); }
    catch (e) { if (myToken === runToken && handlers.onError) handlers.onError("model-load-failed"); return; }
    if (myToken !== runToken) return;    // user cancelled during the download

    // 2) mic + capture graph — built once, then kept WARM so restarts are instant.
    //    (secure context only; throws -> not-allowed / mic-failed.)
    try { await ensureMic(); }
    catch (e) {
      teardown();   // release any half-acquired stream / partial graph
      var code = (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) ? "not-allowed" : "mic-failed";
      if (myToken === runToken && handlers.onError) handlers.onError(code);
      return;
    }
    if (myToken !== runToken) { teardown(); return; }

    // 3) begin accumulating immediately — the preroll already holds the last ~½ second.
    beginCapture();
    if (handlers.onStart) handlers.onStart();
  }

  function onAudio(e) {
    var input = e.inputBuffer.getChannelData(0);
    var copy = new Float32Array(input.length); copy.set(input);

    if (!capturing) {
      // warm but idle: keep a short rolling PREROLL so the onset is never lost — but
      // NEVER preroll the narrator's own TTS (acoustic bleed), or it would get
      // prepended to the player's next phrase. Clear the buffer while it speaks.
      if (!warm) return;
      try { var V = global.IDNVoice; if (V && V.isSpeaking && V.isSpeaking()) { preroll = []; prerollSamples = 0; return; } } catch (e) {}
      preroll.push(copy); prerollSamples += copy.length;
      var maxPre = Math.round(capRate * (wcfg().prerollMs / 1000));
      while (prerollSamples > maxPre && preroll.length > 1) { prerollSamples -= preroll.shift().length; }
      return;
    }

    chunks.push(copy);

    var sum = 0, i;
    for (i = 0; i < input.length; i++) { var v = input[i]; sum += v * v; }
    var rms = Math.sqrt(sum / input.length);

    var c = wcfg(), frameMs = (input.length / capRate) * 1000;
    totalMs += frameMs;
    if (rms >= c.vadThreshold) { heardSpeech = true; speechMs += frameMs; silenceMs = 0; }
    else if (heardSpeech)      { silenceMs += frameMs; }

    // endpoint: heard enough speech, then a gap of silence -> finalize the phrase.
    // In push-to-talk we IGNORE the silence endpointer (release()/endSegment finalizes
    // instead), so a mid-thought pause never cuts the player off; the cap still applies.
    var ptt = !!(optsRef && optsRef.pushToTalk);
    if (!ptt && heardSpeech && speechMs >= c.minSpeechMs && silenceMs >= c.silenceMs) { finalizeSegment(); return; }
    if (totalMs >= c.maxSeconds * 1000) { finalizeSegment(); return; }     // hard cap
  }

  function flatten(arr) {
    var len = 0, i; for (i = 0; i < arr.length; i++) len += arr[i].length;
    var out = new Float32Array(len), off = 0;
    for (i = 0; i < arr.length; i++) { out.set(arr[i], off); off += arr[i].length; }
    return out;
  }

  // Trim a short lead (the mic-on cue + onset) and RMS-normalise quiet capture toward a
  // usable level, with a peak ceiling so we never clip. Both materially help Whisper on
  // weak/quiet mics. Returns a Float32Array at the ORIGINAL rate (resample happens next).
  function conditionAudio(data, rate) {
    var c = wcfg(), x = data, i, v, a;
    if (c.leadTrimMs > 0) {
      var cut = Math.round(rate * (c.leadTrimMs / 1000));
      if (cut > 0 && cut < x.length) x = x.subarray(cut);
    }
    if (!c.normalize || !x.length) return x;
    var sum = 0, peak = 0;
    for (i = 0; i < x.length; i++) { v = x[i]; sum += v * v; a = v < 0 ? -v : v; if (a > peak) peak = a; }
    var rms = Math.sqrt(sum / x.length);
    if (rms < 1e-5) return x;                              // essentially silence — leave it
    var gain = 0.10 / rms;                                 // aim for a healthy average level…
    gain = Math.min(gain, 0.97 / Math.max(peak, 1e-5));    // …but never clip the loudest sample
    gain = Math.min(gain, 4);                              // …and don't crank pure hiss / room noise
    if (gain <= 1.02) return x;                            // already loud enough
    var out = new Float32Array(x.length);
    for (i = 0; i < x.length; i++) out[i] = x[i] * gain;
    return out;
  }

  // Resample arbitrary-rate mono PCM to Whisper's 16 kHz via an OfflineAudioContext
  // (high quality, and it fetches nothing — file://-safe).
  async function resampleTo16k(data, rate) {
    if (rate === 16000) return data;
    var Ctor = OAC();
    var frames = Math.max(1, Math.round(data.length * 16000 / rate));
    var off = new Ctor(1, frames, 16000);
    var buf = off.createBuffer(1, data.length, rate);
    buf.getChannelData(0).set(data);
    var s = off.createBufferSource(); s.buffer = buf; s.connect(off.destination); s.start();
    var rendered = await off.startRendering();
    return rendered.getChannelData(0);
  }

  function isEnglishOnly(model) { return /\.en\b/i.test(model) || /[._-]en($|[._-])/i.test(model); }

  async function transcribe(audio16k) {
    var c = wcfg(), t = await ensurePipeline();
    var opts = { chunk_length_s: 30, stride_length_s: 5 };
    // English-only ('.en') models REJECT language/task params; multilingual ones want them.
    if (!isEnglishOnly(c.model)) { opts.task = "transcribe"; if (c.language) opts.language = c.language; }
    var out = await t(audio16k, opts);
    return (out && out.text) || "";
  }

  // Endpointer (or the maxSeconds cap) reached: transcribe what we captured, emit it,
  // then either keep listening (continuous) or end the session.
  var busy = false;
  async function finalizeSegment() {
    if (busy) return;
    busy = true;
    capturing = false;                         // pause accumulation while we transcribe
    var myToken = runToken;
    var c = wcfg(), cont = !!(optsRef && optsRef.continuous);
    var captured = flatten(chunks);
    var hadSpeech = heardSpeech, spokeMs = speechMs;   // grab BEFORE the reset below
    chunks = []; speechMs = 0; silenceMs = 0; totalMs = 0; heardSpeech = false;

    // Only transcribe if we actually HEARD speech (energy over the VAD gate, for long
    // enough). The preroll guarantees samples exist, so a sample-count check would let
    // a SILENT press through — and Whisper hallucinates "1"/"you"/etc. on silence and
    // auto-submits it as a phantom turn. Gate on DETECTED SPEECH, not buffer length.
    try {
      if (hadSpeech && spokeMs >= c.minSpeechMs) {
        if (handlersRef && handlersRef.onStatus) handlersRef.onStatus("VOICE INPUT · transcribing…");
        var audio16k = await resampleTo16k(conditionAudio(captured, capRate), capRate);
        var text = (await transcribe(audio16k)).trim();
        if (handlersRef && handlersRef.onStatus) handlersRef.onStatus("");
        if (myToken !== runToken) return;      // cancelled mid-transcription
        if (text && handlersRef && handlersRef.onFinal) handlersRef.onFinal(text);
      }
    } catch (e) {
      if (handlersRef && handlersRef.onStatus) handlersRef.onStatus("");
      if (myToken === runToken && handlersRef && handlersRef.onError) handlersRef.onError("transcribe-failed");
    } finally {
      busy = false;
      if (myToken !== runToken) { /* stop() already tore down */ }
      else if (cont) { capturing = true; }     // continuous: resume capture immediately
      else {
        // single phrase (push-to-talk / tap): STAY WARM so the next press is instant;
        // arm the idle timer to release the mic if the player goes quiet for a while.
        capturing = false; chunks = [];
        armIdle();
        if (handlersRef && handlersRef.onEnd) handlersRef.onEnd();
      }
    }
  }

  // stop() = cancel. The silence endpointer is what SUBMITS; a manual stop just ends
  // the session without transcribing the trailing audio.
  function stop() {
    runToken++;                                // invalidates any in-flight start()/finalize
    clearIdle();
    var had = capturing || warm || stream || ac;
    teardown();
    if (had && handlersRef && handlersRef.onEnd) handlersRef.onEnd();
  }

  // Push-to-talk release: transcribe whatever was captured RIGHT NOW rather than
  // waiting for the silence endpointer. If nothing meaningful was captured (released
  // too fast, or capture never started), just stop without a transcript.
  function endSegment() {
    if (busy) return;
    if (capturing || chunks.length) finalizeSegment();
    else stop();
  }

  function teardown() {
    capturing = false; warm = false;
    clearIdle();
    try { if (proc) proc.onaudioprocess = null; } catch (e) {}
    try { if (srcNode) srcNode.disconnect(); } catch (e) {}
    try { if (proc) proc.disconnect(); } catch (e) {}
    try { if (sink) sink.disconnect(); } catch (e) {}
    try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { if (ac && ac.state !== "closed") ac.close(); } catch (e) {}
    ac = null; stream = null; srcNode = null; proc = null; sink = null; chunks = []; preroll = []; prerollSamples = 0;
  }

  if (global.IDNSpeech && global.IDNSpeech.use) {
    global.IDNSpeech.use("whisper", {
      supported: supported, start: start, stop: stop, init: init,
      endSegment: endSegment,                  // push-to-talk: finalize on release()
      error: function () { return lastError; },
    });
  } else if (global.console) {
    console.warn("[IDN whisper-stt] IDNSpeech not found — load engine/speech.js before this provider.");
  }
})(typeof window !== "undefined" ? window : this);
