/* ===========================================================================
 * IDN ENGINE · VOICE / TTS SOUND-DESIGN LAYER   (engine/voice.js)
 * ===========================================================================
 * Speaks the narrator out loud — but treats the speech as RAW MATERIAL, not a
 * polite screen-reader. The smallest real TTS that runs from file:// with no
 * build and no data files (SAM, a 23 KB pure-JS port of the C64-era "Software
 * Automatic Mouth") renders each line to a Float32Array of PCM, which we feed
 * into a Web Audio effects RACK and only THEN to the speakers. So the voice is
 * processed — band-limited, bit-crushed, driven, reverbed — to sit inside the
 * degraded amber-CRT world instead of on top of it.
 *
 * WHY NOT the browser's built-in speechSynthesis?
 *   Because you CANNOT route speechSynthesis through Web Audio — it goes
 *   straight to the output device with no tap. No filters, no crush, no
 *   reactivity. It survives here only as an unprocessed fallback engine.
 *
 * SIGNAL PATH  (one reusable graph; presets just retune the nodes)
 *   SAM ─▶ AudioBuffer(22050) ─▶ source(detune)
 *        ─▶ highpass ─▶ lowpass ─▶ bit-crusher ─▶ soft-drive
 *        ─▶ ( dry  +  convolver reverb wet )
 *        ─▶ ( dry  +  ring-mod wet )          ← only opened by the 'haunted' preset
 *        ─▶ master gain ─▶ analyser ─▶ destination
 *
 * PORTABILITY NOTES (deliberate, matches the rest of this template)
 *   · No AudioWorklet: it needs addModule(url), which fails over file:// in
 *     Chrome. The bit-crusher is a ScriptProcessorNode — deprecated but loads
 *     from file:// everywhere. Swap to a Worklet if you ever serve over http.
 *   · No impulse-response file: the reverb IR is SYNTHESISED in JS (decaying
 *     noise), so there is nothing to fetch.
 *
 * PUBLIC API  (also surfaced as window.IDN.voice)
 *   IDNVoice.speak(text, { speaker })   queue + play one processed utterance
 *   IDNVoice.stop()                     barge-in: kill all speech, restore glitch
 *   IDNVoice.setEnabled(bool) / .toggle() / .enabled
 *   IDNVoice.setPreset('crt'|'haunted'|'clean'|'dry')   · .preset · .presets
 *   IDNVoice.test([text])               speak a sample with the current settings
 *   IDNVoice.unlock()                   resume the AudioContext from a gesture
 *   IDNVoice.fx                         live node/param refs for console tweaking
 *   IDNVoice.profiles                   per-character SAM voices (editable)
 *
 * Reads its settings lazily from window.IDN.config.voice (see the HTML CONFIG),
 * so load order never matters. No modules, no build step. Loads fine from file://.
 * ===========================================================================*/
(function (global) {
  "use strict";

  /* ---- lazy config (mirrors engine/llm.js: never touch window.IDN at load) --- */
  function cfg() {
    var IDN = global.IDN || {};
    var v = (IDN.config && IDN.config.voice) || {};
    return {
      enabled:      v.enabled      !== false,   // default ON
      engine:       v.engine       || "sam",    // 'sam' | 'webspeech'
      preset:       v.preset       || "crt",    // see PRESETS
      reactive:     v.reactive     !== false,   // voice energy nudges IDN.glitch
      perCharacter: v.perCharacter !== false,   // vary SAM voice by speaker
      master:       (v.master != null ? v.master : 0.9),
      leadInMs:     (v.leadInMs != null ? v.leadInMs : 700), // ambient lead before 1st voice
      readback:     v.readback     !== false,   // speak the player's own line back (natural voice)
    };
  }

  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  /* ---------------------------------------------------------------------------
   * PRESETS — each one is just a bag of numbers the single rack is retuned to.
   * *ByGlitch fields let a value track the engine's degradation: e.g. crushBits
   * drops and the lowpass closes as IDN.glitch.level rises ("more broken as the
   * signal decays"). Tune freely; nothing here is load-bearing for the FSM.
   * ------------------------------------------------------------------------- */
  var PRESETS = {
    // shortwave / intercom / dying CRT — the default, matches the visual world
    crt: {
      hp: 300, lp: 3400, lpByGlitch: 0.45,
      crushBits: 8, crushBitsByGlitch: 3.0,
      crushHz: 11000, crushHzByGlitch: 0.45,
      drive: 0.35,
      verbWet: 0.18, verbSeconds: 0.45, verbDecay: 3.0,
      ringWet: 0.0, ringHz: 0,
      detune: 0, playbackRate: 1.0,
      reactiveAmount: 1.4,
    },
    // grand, looming, faintly threatening — Clod Bathos at rest (mildly menacing):
    // lowered + slowed a touch, driven, with a cavernous tail. Still intelligible.
    menacing: {
      hp: 200, lp: 3000, lpByGlitch: 0.45,
      crushBits: 9, crushBitsByGlitch: 2.5,
      crushHz: 12000, crushHzByGlitch: 0.45,
      drive: 0.30,
      verbWet: 0.30, verbSeconds: 1.6, verbDecay: 2.6,
      ringWet: 0.0, ringHz: 0,
      detune: -120, playbackRate: 0.97,
      reactiveAmount: 1.3,
    },
    // something older riding the noise — uncanny, slow, spectral
    haunted: {
      hp: 180, lp: 2600, lpByGlitch: 0.5,
      crushBits: 9, crushBitsByGlitch: 2.0,
      crushHz: 12000, crushHzByGlitch: 0.4,
      drive: 0.2,
      verbWet: 0.42, verbSeconds: 3.6, verbDecay: 2.2,
      ringWet: 0.5, ringHz: 60,
      detune: -300, playbackRate: 0.94,
      reactiveAmount: 1.1,
    },
    // menace cracking — shorter tail, lifting pitch; first warmth showing through
    thaw: {
      hp: 170, lp: 3800, lpByGlitch: 0.35,
      crushBits: 10, crushBitsByGlitch: 2.0,
      crushHz: 14000, crushHzByGlitch: 0.4,
      drive: 0.18,
      verbWet: 0.20, verbSeconds: 1.0, verbDecay: 2.8,
      ringWet: 0.0, ringHz: 0,
      detune: -40, playbackRate: 0.99,
      reactiveAmount: 1.0,
    },
    // genuinely warm — open, intimate, a touch quicker; Clod gone fond
    warm: {
      hp: 140, lp: 5200, lpByGlitch: 0.2,
      crushBits: 12, crushBitsByGlitch: 1.0,
      crushHz: 18000, crushHzByGlitch: 0.25,
      drive: 0.10,
      verbWet: 0.13, verbSeconds: 0.7, verbDecay: 3.0,
      ringWet: 0.0, ringHz: 0,
      detune: 25, playbackRate: 1.02,
      reactiveAmount: 0.8,
    },
    // readable retro speech-synth — light shaping only
    clean: {
      hp: 120, lp: 6500, lpByGlitch: 0.15,
      crushBits: 12, crushBitsByGlitch: 0.5,
      crushHz: 22050, crushHzByGlitch: 0.1,
      drive: 0.05,
      verbWet: 0.08, verbSeconds: 0.35, verbDecay: 3.0,
      ringWet: 0.0, ringHz: 0,
      detune: 0, playbackRate: 1.0,
      reactiveAmount: 0.6,
    },
    // bypass — SAM straight to the speakers (master gain only)
    dry: {
      hp: 20, lp: 20000, lpByGlitch: 0,
      crushBits: 16, crushBitsByGlitch: 0,
      crushHz: 22050, crushHzByGlitch: 0,
      drive: 0,
      verbWet: 0, verbSeconds: 0.3, verbDecay: 3,
      ringWet: 0, ringHz: 0,
      detune: 0, playbackRate: 1.0,
      reactiveAmount: 0,
    },
  };

  /* ---------------------------------------------------------------------------
   * WARMTH TRAJECTORY — one continuous emotional axis through the presets:
   *
   *   -1 ───────── -0.4 ───────── +0.2 ───────── +1
   *   haunted      menacing       thaw           warm
   *   (spectral)   (at rest)      (cracking)     (fond)
   *
   * setWarmth(t) piecewise-interpolates every rack number between those anchor
   * presets and applies the result (registered as PRESETS.trajectory so every
   * name-based path — playNext, /voice — keeps working). Drive it from a story:
   *   profiles:  { warmth: -0.5, glitch: 0.35 }            (a stop per node)
   *   bindings:  { from: "world.regard", to: "voice.warmth", in:[0,6], out:[-0.5,1] }
   * ------------------------------------------------------------------------- */
  var WARMTH_ANCHORS = [
    [-1.0, "haunted"], [-0.4, "menacing"], [0.2, "thaw"], [1.0, "warm"],
  ];
  function warmthBag(t) {
    t = clamp(+t || 0, -1, 1);
    var lo = WARMTH_ANCHORS[0], hi = WARMTH_ANCHORS[WARMTH_ANCHORS.length - 1];
    for (var i = 0; i < WARMTH_ANCHORS.length - 1; i++) {
      if (t >= WARMTH_ANCHORS[i][0] && t <= WARMTH_ANCHORS[i + 1][0]) {
        lo = WARMTH_ANCHORS[i]; hi = WARMTH_ANCHORS[i + 1]; break;
      }
    }
    var a = PRESETS[lo[1]], b = PRESETS[hi[1]];
    var f = (hi[0] === lo[0]) ? 0 : (t - lo[0]) / (hi[0] - lo[0]);
    var bag = {};
    Object.keys(a).forEach(function (k) {
      var av = a[k], bv = (k in b) ? b[k] : av;
      bag[k] = (typeof av === "number" && typeof bv === "number") ? av + (bv - av) * f : av;
    });
    return bag;
  }

  /* ---------------------------------------------------------------------------
   * PER-CHARACTER VOICES — SAM synth params (pitch/speed/mouth/throat) plus a
   * few rack biases, keyed by the speaking character's id from story.js. SAM
   * quirk: a HIGHER `pitch` number is a LOWER voice (it's a period). Missing
   * speakers fall back to `_default`. Mood (e.g. the presence's 'hurt'/'wary'/
   * 'anchored') nudges these further in resolveProfile().
   * ------------------------------------------------------------------------- */
  var PROFILES = {
    _default: { sam: { pitch: 64, speed: 72, mouth: 128, throat: 128 }, detune: 0, lpBias: 1.0,  crushBias: 1.0, verbBias: 1.0 },
    // IDN/OS — the clerical shell: brighter, clearer, drier
    host:     { sam: { pitch: 60, speed: 70, mouth: 140, throat: 110 }, detune: 0, lpBias: 1.30, crushBias: 0.7, verbBias: 0.6 },
    // the presence — lower, slower, hollow, more degraded and wetter
    other:    { sam: { pitch: 78, speed: 82, mouth: 110, throat: 165 }, detune: -45, lpBias: 0.85, crushBias: 1.3, verbBias: 1.6 },
  };

  /* ---- text sanitiser: SAM speaks ASCII; stage directions/glyphs sound wrong */
  function sanitize(text) {
    if (!text) return "";
    return String(text)
      .replace(/\([^)]*\b(?:type|reset|press)\b[^)]*\)/gi, " ") // "(type /reset…)" asides
      .replace(/[‘’‚‛]/g, "'")               // smart single quotes
      .replace(/[“”„‟]/g, '"')               // smart double quotes
      .replace(/[–—―]/g, "-")                     // dashes
      .replace(/[…]/g, "...")                               // ellipsis
      .replace(/[^\x20-\x7E\n]/g, " ")                            // anything non-ASCII (glitch glyphs)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600);                                            // keep one utterance bounded
  }

  /* ===========================================================================
   * AUDIO GRAPH — built once, lazily, on the first real attempt to speak.
   * ===========================================================================*/
  var ctx = null;        // AudioContext
  var graph = null;      // the rack (node refs)
  var unlocked = false;  // has a user gesture resumed the context?
  var sfxBus = null;     // gain bus for the glitch blips (-> destination)
  var sfxNoise = null;   // shared noise buffer reused by the blips

  function AC() { return global.AudioContext || global.webkitAudioContext || null; }

  // Synthesise a stereo reverb impulse response (decaying noise) — no fetch.
  function makeIR(seconds, decay) {
    var rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    var ir = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return ir;
  }

  // tanh-ish soft-clip curve for the drive WaveShaper.
  function makeDriveCurve(amount) {
    var n = 1024, curve = new Float32Array(n), k = amount * 8 + 0.0001;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); // smooth saturation
    }
    return curve;
  }

  // ScriptProcessor bit-crusher (bit-depth quantise + sample-rate decimate).
  function makeCrusher() {
    var node = ctx.createScriptProcessor(4096, 1, 1);
    node._bits = 8;
    node._norm = 0.5; // fraction of the context sample-rate the sample-hold runs at
    var phase = 0, hold = 0;
    node.onaudioprocess = function (e) {
      var input = e.inputBuffer.getChannelData(0);
      var output = e.outputBuffer.getChannelData(0);
      var step = Math.pow(0.5, node._bits);
      var norm = node._norm;
      for (var i = 0; i < input.length; i++) {
        phase += norm;
        if (phase >= 1) { phase -= 1; hold = step * Math.floor(input[i] / step + 0.5); }
        output[i] = hold;
      }
    };
    return node;
  }

  function buildGraph() {
    var g = {};
    g.input  = ctx.createGain();
    g.hp     = ctx.createBiquadFilter(); g.hp.type = "highpass";
    g.lp     = ctx.createBiquadFilter(); g.lp.type = "lowpass";
    g.crush  = makeCrusher();
    g.shaper = ctx.createWaveShaper();

    // reverb send (dry + convolver wet) summed at g.post
    g.dry      = ctx.createGain();
    g.conv     = ctx.createConvolver();
    g.wet      = ctx.createGain();
    g.post     = ctx.createGain();

    // ring-mod send (dry + osc-multiplied wet) summed at g.master
    g.ringDry  = ctx.createGain();
    g.ringMod  = ctx.createGain(); g.ringMod.gain.value = 0; // base 0; osc drives it
    g.ringWet  = ctx.createGain();
    g.ringOsc  = ctx.createOscillator(); g.ringOsc.type = "sine"; g.ringOsc.frequency.value = 60;

    g.master   = ctx.createGain();
    g.analyser = ctx.createAnalyser(); g.analyser.fftSize = 512;
    g._rms     = new Uint8Array(g.analyser.fftSize);

    // wire: input -> hp -> lp -> crush -> shaper -> (dry|conv->wet) -> post
    g.input.connect(g.hp); g.hp.connect(g.lp); g.lp.connect(g.crush); g.crush.connect(g.shaper);
    g.shaper.connect(g.dry);  g.dry.connect(g.post);
    g.shaper.connect(g.conv); g.conv.connect(g.wet); g.wet.connect(g.post);

    // post -> (ringDry | ringMod->ringWet) -> master -> analyser -> destination
    g.post.connect(g.ringDry); g.ringDry.connect(g.master);
    g.post.connect(g.ringMod);  g.ringMod.connect(g.ringWet); g.ringWet.connect(g.master);
    g.ringOsc.connect(g.ringMod.gain); g.ringOsc.start();

    g.master.connect(g.analyser); g.analyser.connect(ctx.destination);
    return g;
  }

  // Push a preset's numbers into the rack. `glitch` is the engine's baseline
  // degradation (0..1+) captured per utterance — it sharpens the crush/lowpass.
  function applyPreset(name, glitch, prof) {
    if (!graph) return;
    var p = PRESETS[name] || PRESETS.crt, g = graph;
    glitch = glitch || 0; prof = prof || PROFILES._default;

    g.hp.frequency.value = p.hp;
    g.lp.frequency.value = clamp(p.lp * (1 - glitch * p.lpByGlitch) * prof.lpBias, 600, 20000);

    g.crush._bits = clamp(p.crushBits - glitch * p.crushBitsByGlitch, 3, 16);
    var hz = clamp(p.crushHz * (1 - glitch * p.crushHzByGlitch), 2000, ctx.sampleRate);
    g.crush._norm = clamp((hz / ctx.sampleRate) / (prof.crushBias || 1), 0.04, 1);

    g.shaper.curve = makeDriveCurve(p.drive);
    g.shaper.oversample = "2x";

    g.conv.buffer = makeIR(p.verbSeconds, p.verbDecay);
    var verb = clamp(p.verbWet * prof.verbBias, 0, 1);
    g.wet.gain.value = verb; g.dry.gain.value = 1 - verb * 0.5;

    g.ringWet.gain.value = p.ringWet; g.ringDry.gain.value = 1 - p.ringWet * 0.6;
    if (p.ringHz) g.ringOsc.frequency.value = p.ringHz;

    g.master.gain.value = cfg().master;
  }

  // Lazily create the context+graph. Returns false if Web Audio is unavailable.
  function ensure() {
    if (ctx) return true;
    var Ctor = AC();
    if (!Ctor) { console.warn("[IDN voice] Web Audio API unavailable — voice disabled."); return false; }
    try {
      ctx = new Ctor(); graph = buildGraph(); IDNVoice.fx = graph;
      // glitch-SFX bus + a half-second shared noise buffer for the blips
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(ctx.destination);
      var nlen = Math.floor(ctx.sampleRate * 0.5), nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate), nd = nbuf.getChannelData(0);
      for (var i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
      sfxNoise = nbuf;
      return true;
    }
    catch (e) { console.warn("[IDN voice] could not start audio:", e); return false; }
  }

  /* ---- gesture unlock: browsers start the context suspended until a gesture -
   * Also kicks off the ambient bed (if enabled) — its first audible moment. */
  function unlock() {
    if (!ensure()) return;
    var ready = function () { unlocked = true; if (ambientCfg().enabled) ambientStart(); };
    if (ctx.state === "suspended") ctx.resume().then(ready).catch(function () {});
    else ready();
  }
  // one-time global gesture hooks (covers the case where the page is just clicked)
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    global.addEventListener && global.addEventListener(ev, function once() {
      global.removeEventListener(ev, once, true); unlock();
    }, true);
  });

  /* ===========================================================================
   * VOICE RESOLUTION — speaker id (+ live mood from the engine) -> SAM params.
   * ===========================================================================*/
  function resolveProfile(speaker) {
    var base = (cfg().perCharacter && speaker && PROFILES[speaker]) ? PROFILES[speaker] : PROFILES._default;
    // shallow clone so mood tweaks don't mutate the stored profile
    var prof = { sam: Object.assign({}, base.sam), detune: base.detune, lpBias: base.lpBias, crushBias: base.crushBias, verbBias: base.verbBias };
    try {
      var eng = global.IDNEngine;
      if (eng && eng.state && eng.state.characters[speaker]) {
        var mood = eng.state.characters[speaker].state.mood;
        // SIGNAL moods (hurt/wary/anchored) + CLOD BATHOS moods (affronted/flattered/
        // thawing/haughty). Cold/wounded = darker + grittier; warmed = brighter; the
        // haughty resting state gets a slight grandiose drop. (Moods are per-story, so
        // these never collide across the two narratives.)
        if (mood === "hurt" || mood === "wary" || mood === "affronted") { prof.lpBias *= 0.8; prof.crushBias *= 1.25; prof.detune -= 25; }
        else if (mood === "anchored" || mood === "flattered" || mood === "thawing" || mood === "moved") { prof.lpBias *= 1.15; prof.crushBias *= 0.85; }
        else if (mood === "haughty") { prof.detune -= 12; prof.crushBias *= 1.05; }
      }
    } catch (e) { /* engine optional */ }
    return prof;
  }

  function currentGlitch() {
    try { var gl = global.IDN && global.IDN.glitch; return gl ? (gl.level || 0) : 0; } catch (e) { return 0; }
  }

  /* ===========================================================================
   * REACTIVE GLITCH — while speech plays, nudge IDN.glitch.level by the voice's
   * energy, then restore the baseline. Degradation mapping reads the captured
   * baseline (not the live level) so this never feeds back on itself.
   * ===========================================================================*/
  var reactive = { raf: 0, base: 0, amount: 0, active: false };
  function reactiveStart(amount) {
    if (!cfg().reactive || !amount) return;
    var gl = global.IDN && global.IDN.glitch; if (!gl) return;
    if (!reactive.active) reactive.base = gl.level || 0; // capture once across a run of utterances
    reactive.amount = amount; reactive.active = true;
    if (reactive.raf) return;
    var loop = function () {
      var g = graph, IDNgl = global.IDN && global.IDN.glitch;
      if (!g || !IDNgl) { reactive.raf = 0; return; }
      g.analyser.getByteTimeDomainData(g._rms);
      var sum = 0;
      for (var i = 0; i < g._rms.length; i++) { var d = (g._rms[i] - 128) / 128; sum += d * d; }
      var rms = Math.sqrt(sum / g._rms.length);              // 0..~1
      IDNgl.level = clamp(reactive.base + rms * reactive.amount, 0, 1.5);
      reactive.raf = global.requestAnimationFrame(loop);
    };
    reactive.raf = global.requestAnimationFrame ? global.requestAnimationFrame(loop) : 0;
  }
  function reactiveStop() {
    if (!reactive.active) return;
    if (reactive.raf && global.cancelAnimationFrame) global.cancelAnimationFrame(reactive.raf);
    reactive.raf = 0; reactive.active = false;
    var gl = global.IDN && global.IDN.glitch; if (gl) gl.level = reactive.base; // restore baseline
  }

  /* ===========================================================================
   * AMBIENT BED — a quiet, generative "dead channel": band-passed noise + a low
   * carrier hum, built entirely in Web Audio (no samples). It SWELLS with
   * IDN.glitch.level, so the static crowds in during tense beats and recedes when
   * calm. Shares the voice AudioContext and starts on the first gesture-unlock
   * (when CONFIG.voice.ambient.enabled). The noise/hum oscillators never stop —
   * the bed is gated by a master gain, so it fades in/out click-free forever.
   * ===========================================================================*/
  var ambient = { nodes: null, built: false, running: false, timer: 0, levelOverride: null, startedAt: null };

  function ambientCfg() {
    var v = (global.IDN && global.IDN.config && global.IDN.config.voice) || {};
    var a = v.ambient || {};
    return {
      enabled: a.enabled !== false,
      level: ambient.levelOverride != null ? ambient.levelOverride : (a.level != null ? a.level : 0.05),
    };
  }

  function buildAmbient() {
    if (ambient.built || !ctx) return;
    var n = {};
    // 2 s of white noise, looped — the bandpass shapes it into soft hiss
    var len = Math.floor(ctx.sampleRate * 2), nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    n.noise = ctx.createBufferSource(); n.noise.buffer = nb; n.noise.loop = true;
    n.bp = ctx.createBiquadFilter(); n.bp.type = "bandpass"; n.bp.frequency.value = 900; n.bp.Q.value = 0.7;
    n.noiseGain = ctx.createGain(); n.noiseGain.gain.value = 0.6;
    // a very slow LFO wanders the band — gives the static some 'shortwave' life
    n.lfo = ctx.createOscillator(); n.lfo.type = "sine"; n.lfo.frequency.value = 0.07;
    n.lfoGain = ctx.createGain(); n.lfoGain.gain.value = 350;
    n.lfo.connect(n.lfoGain); n.lfoGain.connect(n.bp.frequency);
    // low carrier hum beneath it all
    n.hum = ctx.createOscillator(); n.hum.type = "sine"; n.hum.frequency.value = 56;
    n.humGain = ctx.createGain(); n.humGain.gain.value = 0.5;
    // master gate (0 = silent); the whole bed fades via this one node
    n.master = ctx.createGain(); n.master.gain.value = 0;
    n.noise.connect(n.bp); n.bp.connect(n.noiseGain); n.noiseGain.connect(n.master);
    n.hum.connect(n.humGain); n.humGain.connect(n.master);
    n.master.connect(ctx.destination);
    n.noise.start(); n.lfo.start(); n.hum.start();
    ambient.nodes = n; ambient.built = true;
  }

  // Re-map glitch.level -> bed loudness/brightness. Smoothed so it never zippers.
  function ambientUpdate() {
    if (!ambient.built) return;
    var n = ambient.nodes, a = ambientCfg(), t = ctx.currentTime, lvl = currentGlitch();
    var open = (ambient.running && a.enabled) ? 1 : 0;
    n.master.gain.setTargetAtTime(a.level * open, t, 0.4);      // overall fade in/out
    n.noiseGain.gain.setTargetAtTime(0.5 + lvl * 1.4, t, 0.4);  // static swells with glitch
    n.humGain.gain.setTargetAtTime(0.55 + lvl * 0.3, t, 0.4);   // hum steadier
    n.bp.frequency.setTargetAtTime(700 + lvl * 2600, t, 0.6);   // brighter/harsher as it degrades
    n.bp.Q.setTargetAtTime(0.7 + lvl * 2.0, t, 0.6);
  }

  function ambientStart() {
    if (!ensure()) return;
    buildAmbient();
    if (!ambient.running) ambient.startedAt = ctx.currentTime; // mark for the voice lead-in
    ambient.running = true;
    ambientUpdate();
    if (!ambient.timer) ambient.timer = global.setInterval(ambientUpdate, 250);
  }
  function ambientStop() {
    ambient.running = false;
    if (ambient.built) ambientUpdate();   // ramps master gain to 0 (sources keep running)
    if (ambient.timer) { global.clearInterval(ambient.timer); ambient.timer = 0; }
  }

  /* ===========================================================================
   * GLITCH SFX — short procedural blips SYNCED to the visual glitch engine. The
   * glitch scheduler (in the HTML) calls IDNVoice.sfx.blip(kind) the instant it
   * fires a tear / flash / chroma / etc., so the picture and the sound break
   * together. (The reverse link already exists: the voice's energy drives
   * IDN.glitch.level — see reactiveStart — so audio and visuals are coupled both
   * ways.) Quiet, very short, throttled, and scaled by the current glitch.level.
   * ===========================================================================*/
  var sfx = { disabled: false, levelOverride: null }, lastBlip = 0;

  function sfxCfg() {
    var v = (global.IDN && global.IDN.config && global.IDN.config.voice) || {};
    var s = v.glitchSfx || {};
    return {
      enabled: s.enabled !== false && !sfx.disabled,
      level: sfx.levelOverride != null ? sfx.levelOverride : (s.level != null ? s.level : 0.2),
    };
  }

  // fresh gain node with a short percussive attack/decay envelope
  function sfxEnv(dur, amp) {
    var g = ctx.createGain(), t = ctx.currentTime, a = Math.max(0.0001, amp);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(a, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
  function sfxNoiseBurst(dur, type, freq, q, amp, sweepTo) {
    var src = ctx.createBufferSource(); src.buffer = sfxNoise; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    if (sweepTo) { var t = ctx.currentTime; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur); }
    var g = sfxEnv(dur, amp);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(); src.stop(ctx.currentTime + dur + 0.03);
  }
  function sfxTone(freq, type, dur, amp, detune2) {
    var t = ctx.currentTime, o = ctx.createOscillator(); o.type = type || "sine"; o.frequency.value = freq;
    var g = sfxEnv(dur, amp); o.connect(g); g.connect(sfxBus);
    o.start(); o.stop(t + dur + 0.03);
    if (detune2) { var o2 = ctx.createOscillator(); o2.type = type || "sine"; o2.frequency.value = freq; o2.detune.value = detune2; o2.connect(g); o2.start(); o2.stop(t + dur + 0.03); }
  }

  // kind = the glitch effect that just fired ('tear'|'flash'|'chroma'|'skew'|'jitter'|'overlap')
  function glitchBlip(kind) {
    var c = sfxCfg(); if (!c.enabled) return;
    if (!ensure() || ctx.state !== "running") return;
    var now = ctx.currentTime;
    if (now - lastBlip < 0.06) return;             // throttle chained events (no machine-gun)
    lastBlip = now;
    var amp = c.level * (0.35 + currentGlitch() * 0.9);  // louder as the picture degrades
    switch (kind) {
      case "flash":   sfxNoiseBurst(0.09, "highpass", 3000, 0.7, amp * 0.9); break;            // bright pop
      case "tear":    sfxNoiseBurst(0.16, "bandpass", 1900, 3.0, amp, 240); break;             // downward zip
      case "chroma":  sfxTone(640 + Math.random() * 160, "square", 0.12, amp * 0.45, 32); break; // metallic ring
      case "skew":    sfxTone(90, "sine", 0.16, amp * 0.7); break;                              // low wobble
      case "jitter":  sfxNoiseBurst(0.03, "highpass", 5200, 0.7, amp * 0.5); break;             // tick
      case "overlap": sfxNoiseBurst(0.05, "bandpass", 1200, 2.0, amp * 0.6, 600); break;        // stutter
      default:        sfxNoiseBurst(0.05, "bandpass", 1500, 1.0, amp * 0.5);
    }
  }

  /* ===========================================================================
   * UI CUES — short procedural feedback for the VOICE-INPUT (mic) lifecycle:
   * a rising chirp when the mic goes live, a falling one when it stops, and a soft
   * pulsing bed while the offline model transcribes. Same rules as the glitch SFX
   * (synthesised, no fetch; routed through sfxBus) but INDEPENDENT of the narrator's
   * enabled flag — mic feedback should sound even with the spoken narration off.
   * Wired to engine/speech.js events in the HTML. Toggle: IDNVoice.cue.setEnabled().
   * ===========================================================================*/
  var cues = { disabled: false, level: null };       // level null = read config/default
  function cueCfg() {
    var v = (global.IDN && global.IDN.config && global.IDN.config.voice) || {};
    var c = v.cues || {};
    return {
      enabled: c.enabled !== false && !cues.disabled,
      level: cues.level != null ? cues.level : (c.level != null ? c.level : 0.22),
    };
  }
  function cueReady() {                               // null unless we may make sound now
    var c = cueCfg();
    if (!c.enabled) return null;
    if (!ensure() || ctx.state !== "running") return null;
    return c;
  }
  // one tone, optionally gliding f0->f1, with a soft attack/decay, started at +when
  function cueOsc(when, f0, f1, dur, amp, type) {
    var t = ctx.currentTime + (when || 0), o = ctx.createOscillator();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp), t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function cueMicOn() {                               // rising two-step: "listening"
    var c = cueReady(); if (!c) return;
    cueOsc(0,    520, 660, 0.09, c.level,       "triangle");
    cueOsc(0.07, 790, 880, 0.11, c.level * 0.6, "sine");
  }
  function cueMicOff() {                              // falling two-step: "stopped"
    var c = cueReady(); if (!c) return;
    cueOsc(0,    700, 560, 0.10, c.level * 0.7, "triangle");
    cueOsc(0.06, 470, 380, 0.12, c.level * 0.5, "sine");
  }
  // looping "processing" bed: a low sine + its fifth, tremolo-pulsed (~working).
  var proc = { osc: null, osc2: null, lfo: null, depth: null, gain: null, on: false };
  function cueProcessingStart() {
    if (proc.on) return;
    var c = cueReady(); if (!c) return;
    proc.on = true;
    var t = ctx.currentTime, base = c.level * 0.16;
    proc.gain = ctx.createGain();
    proc.gain.gain.setValueAtTime(0.0001, t);
    proc.gain.gain.linearRampToValueAtTime(base, t + 0.15);   // fade in to the tremolo midpoint
    proc.gain.connect(sfxBus);
    proc.osc  = ctx.createOscillator(); proc.osc.type  = "sine"; proc.osc.frequency.value  = 196;
    proc.osc2 = ctx.createOscillator(); proc.osc2.type = "sine"; proc.osc2.frequency.value = 294; proc.osc2.detune.value = 6;
    proc.osc.connect(proc.gain); proc.osc2.connect(proc.gain);
    proc.lfo = ctx.createOscillator(); proc.lfo.type = "sine"; proc.lfo.frequency.value = 2.6;  // pulses/sec
    proc.depth = ctx.createGain(); proc.depth.gain.value = base;   // swing the gain ~0..2*base
    proc.lfo.connect(proc.depth); proc.depth.connect(proc.gain.gain);
    proc.osc.start(t); proc.osc2.start(t); proc.lfo.start(t);
  }
  function cueProcessingStop() {
    if (!proc.on) return;
    proc.on = false;
    var t = ctx.currentTime, stopAt = t + 0.16;
    try {
      proc.gain.gain.cancelScheduledValues(t);
      proc.gain.gain.setValueAtTime(Math.max(0.0001, proc.gain.gain.value), t);
      proc.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);    // fade out, no click
    } catch (e) {}
    [proc.osc, proc.osc2, proc.lfo].forEach(function (o) { try { o.stop(stopAt); } catch (e) {} });
    proc.osc = proc.osc2 = proc.lfo = proc.depth = proc.gain = null;
  }

  /* ===========================================================================
   * PLAYBACK QUEUE — utterances play back-to-back (one paragraph at a time),
   * so narration tracks the typewriter and stop() can barge-in cleanly.
   * ===========================================================================*/
  var queue = [];
  var current = null; // live AudioBufferSourceNode

  // active preset = the user's explicit choice, else whatever config says NOW
  // (config isn't available at load time, so never cache it).
  function activePreset() { return state.presetForced ? state.preset : cfg().preset; }

  function playNext() {
    if (!queue.length) { current = null; reactiveStop(); return; }
    var job = queue.shift();
    var name = activePreset();
    var preset = PRESETS[name] || PRESETS.crt;
    applyPreset(name, job.glitch, job.prof);

    var src = ctx.createBufferSource();
    src.buffer = job.buffer;
    src.playbackRate.value = preset.playbackRate;
    if (src.detune) src.detune.value = (preset.detune || 0) + (job.prof.detune || 0);
    src.connect(graph.input);
    current = src;
    reactiveStart(preset.reactiveAmount);
    src.onended = function () { if (current === src) { current = null; playNext(); } };

    // Lead-in: never let the voice begin before the ambient bed has had a moment
    // to come up. Only bites on the first utterance right after audio unlocks;
    // later ones start immediately (the bed has long since established).
    var startAt = ctx.currentTime;
    if (ambient.running && ambient.startedAt != null) {
      var floor = ambient.startedAt + (cfg().leadInMs / 1000);
      if (floor > startAt) startAt = floor;
    }
    try { src.start(startAt); } catch (e) { current = null; playNext(); }
  }

  // SAM text -> AudioBuffer(22050 mono). Returns null on failure.
  function renderSAM(text, prof) {
    var SamJs = global.SamJs;
    if (!SamJs) { console.warn("[IDN voice] SamJs not loaded (engine/vendor/samjs.js)"); return null; }
    try {
      var sam = new SamJs(prof.sam || {});
      var f32 = sam.buf32(text);            // Float32Array @ 22050 Hz
      if (!f32 || !f32.length) return null;
      var buf = ctx.createBuffer(1, f32.length, 22050);
      buf.getChannelData(0).set(f32);
      return buf;
    } catch (e) { console.warn("[IDN voice] SAM render failed:", e); return null; }
  }

  /* ===========================================================================
   * PUBLIC API
   * ===========================================================================*/
  var state = { preset: null, presetForced: false, forceEnabled: null };

  var IDNVoice = {
    presets: Object.keys(PRESETS),
    profiles: PROFILES,
    fx: null, // set to the live graph once built — tweak nodes from the console

    get enabled() { return state.forceEnabled != null ? state.forceEnabled : cfg().enabled; },
    setEnabled: function (b) { state.forceEnabled = !!b; if (!b) this.stop(); return this.enabled; },
    toggle: function () { return this.setEnabled(!this.enabled); },

    get preset() { return activePreset(); },

    /* Warmth trajectory: t in [-1 (haunted) … -0.4 (menacing) … +0.2 (thaw) … +1 (warm)].
     * Interpolates the rack between the anchor presets and makes it the active
     * voice (as the 'trajectory' preset). Returns the clamped t. */
    get warmth() { return state.warmth; },
    warmthBag: warmthBag,   // introspection: the interpolated rack numbers for a given t
    setWarmth: function (t) {
      t = clamp(+t || 0, -1, 1);
      PRESETS.trajectory = warmthBag(t);
      state.warmth = t;
      this.setPreset("trajectory");
      return t;
    },

    setPreset: function (name) {
      if (!PRESETS[name]) { console.warn("[IDN voice] unknown preset:", name, "— have:", this.presets.join(", ")); return this.preset; }
      state.preset = name; state.presetForced = true;
      if (graph) applyPreset(name, currentGlitch(), PROFILES._default);
      return name;
    },

    unlock: unlock,

    /* isSpeaking(): is a narrator utterance playing right now (either the SAM rack
     * or the unprocessed speechSynthesis fallback)? The speech-to-text layer
     * (engine/speech.js) reads this to ignore the mic while the narrator talks, so
     * hands-free voice input never transcribes the TTS back into the prompt. */
    isSpeaking: function () {
      if (current) return true;
      try { return !!(global.speechSynthesis && global.speechSynthesis.speaking); } catch (e) { return false; }
    },

    /* ambient: the generative "dead channel" bed (filtered noise + low carrier
     * hum). Independent of the spoken voice; swells with IDN.glitch.level. */
    ambient: {
      start: ambientStart,
      stop: ambientStop,
      get enabled() { return ambient.running && ambientCfg().enabled; },
      setEnabled: function (b) { if (b) ambientStart(); else ambientStop(); return this.enabled; },
      toggle: function () { return this.setEnabled(!this.enabled); },
      setLevel: function (x) { ambient.levelOverride = Math.max(0, Math.min(1, +x || 0)); if (ambient.built) ambientUpdate(); return ambient.levelOverride; },
    },

    /* sfx: short procedural blips fired by the visual glitch engine so audio and
     * picture break together. The HTML's glitch scheduler calls .blip(kind). */
    sfx: {
      blip: glitchBlip,
      get enabled() { return sfxCfg().enabled; },
      setEnabled: function (b) { sfx.disabled = !b; return this.enabled; },
      toggle: function () { return this.setEnabled(!this.enabled); },
      setLevel: function (x) { sfx.levelOverride = Math.max(0, Math.min(1, +x || 0)); return sfx.levelOverride; },
    },

    /* cue: UI feedback for the mic lifecycle (engine/speech.js wires these).
     * micOn/micOff = chirps; processingStart/Stop = the pulsing transcribe bed. */
    cue: {
      micOn: cueMicOn,
      micOff: cueMicOff,
      processingStart: cueProcessingStart,
      processingStop: cueProcessingStop,
      get processing() { return proc.on; },
      get enabled() { return cueCfg().enabled; },
      setEnabled: function (b) { cues.disabled = !b; if (!b) cueProcessingStop(); return this.enabled; },
      toggle: function () { return this.setEnabled(!this.enabled); },
      setLevel: function (x) { cues.level = Math.max(0, Math.min(1, +x || 0)); return cues.level; },
    },

    /* speak(text, { speaker }): sanitise -> render with SAM -> queue through the
     * rack. Honours the configured engine; 'webspeech' is an UNPROCESSED fallback
     * (the browser won't let it through Web Audio). No-op when disabled/empty. */
    speak: function (text, opts) {
      opts = opts || {};
      if (!this.enabled) return 0;
      var clean = sanitize(text);
      if (!clean) return 0;

      if (cfg().engine === "webspeech") { speakWebSpeech(clean); return 0; }

      if (!ensure()) return 0;
      if (ctx.state === "suspended") ctx.resume().catch(function () {}); // best effort

      var prof = resolveProfile(opts.speaker);
      var buffer = renderSAM(clean, prof);
      if (!buffer) return 0;
      queue.push({ buffer: buffer, prof: prof, glitch: currentGlitch() });
      if (!current) playNext();

      // Report the AUDIBLE length (seconds) so the typewriter can pace text to the
      // voice. Account for detune/playbackRate (they speed up / stretch playback).
      // Return 0 when audio isn't actually running (e.g. the pre-gesture boot
      // opener) so the typewriter falls back to CONFIG.typeSpeed.
      if (ctx.state !== "running") return 0;
      var preset = PRESETS[activePreset()] || PRESETS.crt;
      var cents = (preset.detune || 0) + (prof.detune || 0);
      var rate = (preset.playbackRate || 1) * Math.pow(2, cents / 1200);
      return buffer.duration / rate;
    },

    /* stop(): barge-in. Clears the queue, kills the live source, restores glitch. */
    stop: function () {
      queue.length = 0;
      if (current) { try { current.onended = null; current.stop(); } catch (e) {} current = null; }
      reactiveStop();
      try { if (global.speechSynthesis) global.speechSynthesis.cancel(); } catch (e) {}
    },

    test: function (text) {
      this.speak(text || "Signal acquired. This is the voice subsystem, routed through the web audio rack.",
                 { speaker: "other" });
    },

    /* readback(text): speak the PLAYER'S line back in a natural voice, before the
     * machine reply. Returns a Promise that resolves when it ends (or immediately if
     * disabled/unsupported) so the caller can sequence the reply after it. */
    readback: function (text) {
      if (cfg().readback === false) return Promise.resolve();
      return readbackSpeak(sanitize(text));
    },
  };

  /* ---- unprocessed fallback: browser speechSynthesis (cannot be DSP'd) ------- */
  function speakWebSpeech(text) {
    try {
      var synth = global.speechSynthesis;
      if (!synth) { console.warn("[IDN voice] speechSynthesis unavailable"); return; }
      var u = new global.SpeechSynthesisUtterance(text);
      u.rate = 1.0; u.pitch = 0.8;
      synth.speak(u);
    } catch (e) { console.warn("[IDN voice] webspeech failed:", e); }
  }

  /* ---- PLAYER READ-BACK: the player's own line, spoken in a natural browser voice
   * (NOT the SAM rack) — a pleasant contrast to the affected machine reply, and a
   * confirmation of what voice input transcribed. Picks the nicest available en voice. */
  var pleasantVoice = null, pickedVoice = false;
  function pickPleasantVoice() {
    if (pickedVoice && pleasantVoice) return pleasantVoice;
    try {
      var synth = global.speechSynthesis;
      var vs = (synth && synth.getVoices && synth.getVoices()) || [];
      if (!vs.length) return null;                 // voices not loaded yet — retry next call
      pickedVoice = true;
      var en = vs.filter(function (v) { return /^en/i.test(v.lang || ""); });
      var pool = en.length ? en : vs;
      var pref = /Samantha|Ava|Allison|Karen|Moira|Tessa|Serena|Google US English|Google UK English Female|Aria|Jenny|Zira|Natural|Neural/i;
      pleasantVoice = pool.filter(function (v) { return pref.test(v.name || ""); })[0]
                   || pool.filter(function (v) { return v.default; })[0]
                   || pool[0];
      return pleasantVoice;
    } catch (e) { return null; }
  }
  function readbackSpeak(text) {
    if (!text) return Promise.resolve();
    var synth = global.speechSynthesis;
    if (!synth || !global.SpeechSynthesisUtterance) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        var u = new global.SpeechSynthesisUtterance(text);
        var v = pickPleasantVoice(); if (v) u.voice = v;
        u.rate = 1.0; u.pitch = 1.0;               // natural, unprocessed
        var done = false, fin = function () { if (done) return; done = true; resolve(); };
        u.onend = fin; u.onerror = fin;
        // some engines never fire onend — cap the wait so the reply can never hang on it
        setTimeout(fin, clamp(1200 + text.length * 80, 1200, 12000));
        synth.speak(u);
      } catch (e) { resolve(); }
    });
  }

  global.IDNVoice = IDNVoice;
})(typeof window !== "undefined" ? window : this);
