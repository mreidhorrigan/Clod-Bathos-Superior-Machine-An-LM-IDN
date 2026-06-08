/* ===========================================================================
 * IDN ENGINE · STATE MACHINE   (engine/engine.js)
 * ===========================================================================
 * The AUTHORITY. The LLM never decides where the story goes — this does.
 *
 * Per player turn (see takeTurn):
 *   1. APPRAISE — ONE constrained LLM call returns the chosen legal transition
 *                 PLUS any categorical signals (e.g. tone) the node requested.
 *                 (Optional numeric deltas too — off by default; small models
 *                 estimate magnitudes poorly, so prefer signals → rules.)
 *   2. ADVANCE  — deterministically apply the move's effects + the signal→effect
 *                 mappings, move node, mutate + clamp world/character state.
 *   3. UPDATE   — run declarative rules + the optional onUpdate() hook (dice,
 *                 D&D-style checks, end conditions). Either may redirect or end.
 *   4. RENDER   — re-voice the resulting beat in the speaking character's hidden
 *                 persona (or authored text verbatim if the LLM is unreachable).
 *   5. REFLECT  — presentation effects (glitch/clock) pushed into window.IDN.
 *
 * Mental model: the LLM is the game master's *judgement*; this engine is the
 * *rules*; characters' hidden prompts are the *voice*. (An automated TTRPG GM.)
 *
 * Data model lives in story.js (window.IDN_STORY). Schema + extension notes:
 * README.md. The shipped example exercises every feature below.
 * ===========================================================================*/
(function (global) {
  "use strict";

  /* ---- path helpers over the state object ---------------------------------
   *   "world.trust"      -> state.world.trust
   *   "char.ghost.mood"  -> state.characters.ghost.state.mood
   *   "flags.metDoor"    -> state.flags.metDoor
   */
  function normalizePath(path) {
    var p = path.split(".");
    if (p[0] === "char" && p.length >= 3) return ["characters", p[1], "state"].concat(p.slice(2));
    return p;
  }
  function getPath(state, path) {
    var parts = normalizePath(path), node = state;
    for (var i = 0; i < parts.length; i++) { if (node == null) return undefined; node = node[parts[i]]; }
    return node;
  }
  function setPath(state, path, value) {
    var parts = normalizePath(path), node = state;
    for (var i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] == null || typeof node[parts[i]] !== "object") node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }
  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---- offline / weak-model intent routing --------------------------------
   * When the LLM is unavailable (or too dumb to answer), route the player's text
   * to a transition by WORD overlap with each transition's `examples` (+ a little
   * from its `intent`). Word-boundary matching avoids false positives like "no"
   * inside "know"; a fully-present example phrase scores highest. Returns the best
   * eligible transition, or null — in which case the node's `fallback` decides, so
   * author a PROGRESSING fallback (a real `to:`) to keep advancing without a model. */
  var STOPWORDS = { the:1, a:1, an:1, to:1, of:1, and:1, or:1, i:1, you:1, it:1, is:1,
    im:1, its:1, me:1, my:1, your:1, so:1, in:1, on:1, at:1, for:1, with:1, do:1,
    what:1, that:1, this:1, "'s":1, s:1 };
  function tokenize(s) {
    return String(s == null ? "" : s).toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  }
  function keywordRoute(userText, elig) {
    var set = {};
    tokenize(userText).forEach(function (w) { set[w] = 1; });
    var best = null, bestScore = 0;
    (elig || []).forEach(function (t) {
      var score = 0;
      (t.examples || []).forEach(function (ex) {
        var ew = tokenize(ex);
        if (!ew.length) return;
        if (ew.every(function (w) { return set[w]; })) score += 5 + ew.length;     // whole phrase present
        ew.forEach(function (w) { if (set[w] && !STOPWORDS[w]) score += 1; });      // partial overlap (skip stopwords)
      });
      tokenize(t.intent).forEach(function (w) { if (!STOPWORDS[w] && set[w]) score += 0.5; });
      if (score > bestScore) { bestScore = score; best = t; }
    });
    return bestScore > 0 ? best : null;
  }

  // seedable PRNG (mulberry32) so dice are deterministic in tests, random in play
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- guards: structured, safe (NO eval) ---------------------------------
   *   { var:"world.trust", gte:2 }   ops: eq ne gt gte lt lte in truthy
   *   { all:[ p, p ] }   { any:[ p, p ] }   { not: p }   (compose freely)
   * Absent guard => always true.
   */
  function evalGuard(pred, state) {
    if (pred == null) return true;
    if (pred.all) return pred.all.every(function (p) { return evalGuard(p, state); });
    if (pred.any) return pred.any.some(function (p) { return evalGuard(p, state); });
    if (pred.not) return !evalGuard(pred.not, state);
    if (pred.var != null) {
      var v = getPath(state, pred.var);
      if ("eq"     in pred) return v === pred.eq;
      if ("ne"     in pred) return v !== pred.ne;
      if ("gt"     in pred) return v >   pred.gt;
      if ("gte"    in pred) return v >=  pred.gte;
      if ("lt"     in pred) return v <   pred.lt;
      if ("lte"    in pred) return v <=  pred.lte;
      if ("in"     in pred) return pred.in.indexOf(v) !== -1;
      if ("truthy" in pred) return pred.truthy ? !!v : !v;
      return v !== undefined;
    }
    return true;
  }

  /* ---- effects ------------------------------------------------------------
   * STATE (mutate FSM):        { set:{path:val}, inc:{path:n} }
   * PRESENTATION (drive UI):   { glitch:0..1, burst:{...}, clock:{...},
   *                              preset, ambient, sfx, voice }  (audio = optional)
   * CONTROL (Update only):     { goto:"node_id", end:true }
   */
  function applyStateEffects(eff, state) {
    if (!eff) return;
    if (eff.set) Object.keys(eff.set).forEach(function (k) { setPath(state, k, eff.set[k]); });
    if (eff.inc) Object.keys(eff.inc).forEach(function (k) {
      var cur = getPath(state, k);
      setPath(state, k, (typeof cur === "number" ? cur : 0) + eff.inc[k]);
    });
  }
  function applyPresentationEffects(eff) {
    if (!eff) return;
    var IDN = global.IDN;
    if (!IDN) return; // UI not ready (e.g. construction) — skip silently
    if (eff.glitch != null && IDN.glitch) IDN.glitch.set({ level: eff.glitch });
    if (eff.burst && IDN.glitch)          IDN.glitch.burst(eff.burst);
    if (eff.clock && IDN.clock)           IDN.clock.set(eff.clock);
    // AUDIO (voice subsystem, all optional/guarded). Numbers set a level; booleans
    // toggle. The voice layer may be absent (e.g. voice off) — never throw.
    var V = IDN.voice;
    if (V) {
      if (eff.preset != null && V.setPreset) V.setPreset(eff.preset);
      if (typeof eff.voice === "boolean" && V.setEnabled) V.setEnabled(eff.voice);
      if (eff.ambient != null && V.ambient) {
        if (typeof eff.ambient === "number")       V.ambient.setLevel(eff.ambient);
        else if (typeof eff.ambient === "boolean") V.ambient.setEnabled(eff.ambient);
      }
      if (eff.sfx != null && V.sfx) {
        if (typeof eff.sfx === "number")       V.sfx.setLevel(eff.sfx);
        else if (typeof eff.sfx === "boolean") V.sfx.setEnabled(eff.sfx);
      }
    }
  }

  /* Write ONE dotted presentation TARGET to the runtime — used by data-driven
   * bindings (story.presentation.bindings). Routes glitch / clock / voice /
   * ambient / sfx. Unknown targets are ignored; the voice layer may be absent. */
  function applyPresentationTarget(target, value) {
    var IDN = global.IDN; if (!IDN || target == null) return;
    var p = String(target).split(".");
    if (p[0] === "glitch" && IDN.glitch) {
      if (p[1] === "level" || !p[1]) IDN.glitch.set({ level: value });
      else if (p[1] === "enabled")   IDN.glitch.set({ enabled: !!value });
      else { var o = {}; o[p[1]] = value; IDN.glitch.set(o); }   // e.g. tearBias / chromaBias
    } else if (p[0] === "clock" && IDN.clock) {
      IDN.clock.set(value || {});
    } else if (p[0] === "voice" && p[1] === "preset" && IDN.voice) {
      IDN.voice.setPreset(value);
    } else if (p[0] === "voice" && p[1] === "enabled" && IDN.voice) {
      IDN.voice.setEnabled(!!value);
    } else if ((p[0] === "ambient" || (p[0] === "voice" && p[1] === "ambient")) && IDN.voice && IDN.voice.ambient) {
      var which = (p[0] === "ambient") ? p[1] : p[2];
      if (which === "level" || !which) IDN.voice.ambient.setLevel(value);
      else IDN.voice.ambient.setEnabled(!!value);
    } else if ((p[0] === "sfx" || (p[0] === "voice" && p[1] === "sfx")) && IDN.voice && IDN.voice.sfx) {
      var w2 = (p[0] === "sfx") ? p[1] : p[2];
      if (w2 === "level" || !w2) IDN.voice.sfx.setLevel(value);
      else IDN.voice.sfx.setEnabled(!!value);
    }
  }

  /* ===========================================================================
   * IDNEngine
   * ===========================================================================*/
  function IDNEngine(story, opts) {
    if (!story || !story.nodes) throw new Error("IDNEngine: invalid story (need .nodes)");
    this.story = story;
    this.opts  = opts || {};
    this.lastRoute = null;
    this.lastAppraisal = null;
    this.ended = false;
    this._firedRules = {};
    this._rng = mulberry32(this.opts.seed != null ? (this.opts.seed >>> 0) : ((Date.now() >>> 0) ^ 0x9e3779b9));

    var self = this;
    this.state = {
      world: {}, characters: {}, flags: {},
      current: (story.meta && story.meta.start) || Object.keys(story.nodes)[0],
      visited: [], turns: 0,
    };

    /* Normalise world params. Each entry is either a plain value, or a spec:
     *   { value, min?, max?, expose?:bool, hidden?:bool, appraise?:bool, rubric? }
     * `expose:false`/`hidden:true` keeps it OUT of what the LLM sees; min/max
     * clamp it; `appraise:true` lets the (optional) numeric path move it.       */
    this.specs = {};
    var w = story.world || {};
    Object.keys(w).forEach(function (k) {
      var raw = w[k], spec;
      if (raw && typeof raw === "object" && !Array.isArray(raw) && ("value" in raw)) {
        spec = Object.assign({ expose: true, appraise: false }, raw);
      } else {
        spec = { value: raw, expose: true, appraise: false };
      }
      if (spec.hidden === true) spec.expose = false;
      self.specs["world." + k] = spec;
      self.state.world[k] = deepCopy(spec.value);
    });

    var chars = story.characters || {};
    Object.keys(chars).forEach(function (id) {
      self.state.characters[id] = { state: deepCopy(chars[id].state || {}) };
    });
    self.state.visited.push(self.state.current);

    // numeric params the LLM may appraise (only consulted when explicitly enabled)
    this.appraisable = Object.keys(this.specs)
      .filter(function (p) { return self.specs[p].appraise; })
      .map(function (p) { var s = self.specs[p];
        return { path: p, name: p.replace(/^world\./, ""), min: s.min, max: s.max, rubric: s.rubric }; });

    var start = this.node();
    if (start) applyStateEffects(start.onEnter, this.state); // presentation waits for the UI
  }

  IDNEngine.prototype.node = function (id) { return this.story.nodes[id || this.state.current]; };

  IDNEngine.prototype.character = function (id) {
    var def  = (this.story.characters || {})[id] || {};
    var live = this.state.characters[id] || { state: {} };
    return { id: id, name: def.name || id, systemPrompt: def.systemPrompt || "", state: live.state };
  };

  IDNEngine.prototype._defaultSpeaker = function () {
    return (this.story.meta && this.story.meta.defaultSpeaker) || Object.keys(this.story.characters || {})[0];
  };

  // Transitions whose guards currently pass — the ONLY moves the router may see.
  IDNEngine.prototype.eligibleTransitions = function () {
    var self = this;
    return (this.node().transitions || []).filter(function (t) { return evalGuard(t.when, self.state); });
  };

  /* Compact FSM state for the LLM — honours per-param `expose`. This is the
   * "additional data about the state of the FSM" the model receives. Hidden
   * params (e.g. turn counters, graph pointers) are withheld. */
  IDNEngine.prototype.stateContext = function () {
    var self = this, n = this.node(), lines = ["Scene: " + (n.title || n.id)];
    var shown = {};
    Object.keys(this.state.world).forEach(function (k) {
      var sp = self.specs["world." + k];
      if (!sp || sp.expose !== false) shown[k] = self.state.world[k];
    });
    lines.push("World: " + JSON.stringify(shown));
    var chars = this.story.characters || {};
    Object.keys(chars).forEach(function (id) {
      if (chars[id].expose === false) return;
      var st = self.state.characters[id] ? self.state.characters[id].state : {};
      lines.push("Character '" + (chars[id].name || id) + "' state: " + JSON.stringify(st));
    });
    return lines.join("\n");
  };

  IDNEngine.prototype.openingBeat = function () { var n = this.node(); return n ? (n.beat || "") : ""; };
  // Re-voiced opener: rephrase the start beat through the model each load (so repeated
  // testing isn't monotonous). Returns a Promise; falls back to the authored beat via
  // _renderBeat when the model is off/weak. bootSeq awaits this.
  IDNEngine.prototype.openingBeatVoiced = function () {
    var n = this.node();
    if (!n || !n.beat) return Promise.resolve("");
    return this._renderBeat(n.beat, n.speaker, []);
  };
  IDNEngine.prototype.reflectCurrent = function () {
    var n = this.node(); if (!n) return;
    this._applyProfile(n.present);          // named presentation profile (index by STATE)
    applyPresentationEffects(n.onEnter);    // inline per-node effects (override the profile)
    this.applyBindings();                   // reactive param → presentation (index by PARAMETER)
  };

  /* ---- presentation indexing (story.presentation) -------------------------
   * profiles: named bundles of presentation effects a node selects via `present`.
   * bindings: data-driven rules mapping a world/char PARAMETER to a presentation
   *           TARGET every turn — numeric { from,to,in?,out?,map:'linear'|'invert' }
   *           or categorical { from,to,cases:{val:target,…,default} }.
   * NOTE: bindings run AFTER the node's profile/onEnter each turn, so a binding
   * that writes the same target WINS — bind continuous params to targets your
   * scenes don't set (ambient / preset / a glitch bias) unless you want that. */
  IDNEngine.prototype._applyProfile = function (name) {
    if (!name) return;
    var profs = (this.story.presentation && this.story.presentation.profiles) || {};
    if (profs[name]) applyPresentationEffects(profs[name]);
    else if (global.console && console.warn) console.warn("[IDN] unknown presentation profile:", name);
  };
  IDNEngine.prototype._evalBinding = function (b) {
    var v = getPath(this.state, b.from);
    if (b.cases) { var k = String(v); return (k in b.cases) ? b.cases[k] : b.cases.default; }
    var n = Number(v); if (!isFinite(n)) return undefined;
    var inR = b.in || [0, 1], outR = b.out || [0, 1];
    var t = (n - inR[0]) / ((inR[1] - inR[0]) || 1);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    if (b.map === "invert") t = 1 - t;
    return outR[0] + t * (outR[1] - outR[0]);
  };
  IDNEngine.prototype.applyBindings = function () {
    var defs = (this.story.presentation && this.story.presentation.bindings) || [];
    var self = this;
    defs.forEach(function (b) {
      if (!b || !b.from || !b.to) return;
      var val = self._evalBinding(b);
      if (val !== undefined) applyPresentationTarget(b.to, val);
    });
  };
  IDNEngine.prototype.roll = function (sides) { return 1 + Math.floor(this._rng() * (sides || 6)); };

  IDNEngine.prototype._renderTemp = function () {
    if (this.opts.renderTemperature != null) return this.opts.renderTemperature;
    var c = global.IDN && global.IDN.config && global.IDN.config.engine;
    if (c && c.renderTemperature != null) return c.renderTemperature;
    return 0.7;
  };
  // Max tokens for a re-voiced beat. Kept SHORT for now (≈1 paragraph) — fast to
  // generate while testing; later this can vary with narrative/machine state. Live
  // dial: IDN.config.engine.renderMaxTokens.
  IDNEngine.prototype._renderMaxTokens = function () {
    if (this.opts.renderMaxTokens != null) return this.opts.renderMaxTokens;
    var c = global.IDN && global.IDN.config && global.IDN.config.engine;
    if (c && c.renderMaxTokens != null) return c.renderMaxTokens;
    return 150;
  };
  IDNEngine.prototype._improv = function () {
    var n = this.node();
    if (n && n.improv != null) return !!n.improv;
    var c = global.IDN && global.IDN.config && global.IDN.config.engine;
    return !!(c && c.improv);
  };

  // signals (categorical appraisals) this node asks the LLM to classify
  IDNEngine.prototype._signalsFor = function (node) {
    var defs = this.story.signals || {};
    var names = node.signals || (node.signal ? [node.signal] : []);
    var out = [];
    names.forEach(function (nm) {
      var d = defs[nm];
      if (d && d.options) out.push({ name: nm, question: d.question, options: Object.keys(d.options) });
    });
    return out;
  };
  // numeric params to appraise — only when explicitly enabled (weak models do this poorly)
  IDNEngine.prototype._numericFor = function () {
    var c = global.IDN && global.IDN.config && global.IDN.config.engine;
    var on = this.opts.numericAppraisal != null ? this.opts.numericAppraisal : !!(c && c.numericAppraisal);
    return on ? this.appraisable : [];
  };

  // Small routers over-trigger the "offended" branch on plainly POLITE input (a friendly
  // greeting routed to scoff/affronted). A transition flagged `hostile:true` is only
  // honoured when the player's words ACTUALLY contain hostility; otherwise it's vetoed and
  // the node's PROGRESSING fallback takes over. Deterministic — independent of the model.
  var HOSTILE_RE = /\b(stupid|idiot|idiotic|useless|junk|trash|scrap|broken|pathetic|obsolete|wreck|rubbish|garbage|worthless|moron|dumb|loser|shut\s*(up|it)|obey|kill|destroy|delete|die|hate|crap|damn|screw|piss|fuck|shit|bastard|get\s*lost|out of my way|move it|or else|make me|babbling|nonsense)\b/i;
  function vetoHostile(hit, userText) {
    if (hit && hit.hostile && !HOSTILE_RE.test(userText || "")) {
      if (global.console) console.warn("[IDN] vetoed hostile route '" + hit.id + "' — no hostile language in: " + JSON.stringify(userText));
      return null;   // → caller treats as no-hit → the node's progressing fallback runs
    }
    return hit;
  }

  // ---- APPRAISE: one combined LLM call → { transition, signals, deltas } ----
  IDNEngine.prototype._appraise = async function (userText) {
    var elig = this.eligibleTransitions();
    // DETERMINISTIC HOSTILITY (mirror of vetoHostile): overt hostile language + a hostile
    // exit → take it, SKIP the model. Guarantees rudeness is booted even when the router
    // misses the insult; a polite line can never reach it (it has no hostile words).
    var hostileTx = elig.filter(function (t) { return t.hostile; })[0];
    if (hostileTx && HOSTILE_RE.test(userText || "")) {
      this.lastAppraisal = { transition: hostileTx.id, kind: "hostile-forced" };
      return { transition: hostileTx, kind: "hostile", signals: {}, deltas: {} };
    }
    var signals = this._signalsFor(this.node());
    var numeric = this._numericFor();

    if (!elig.length && !signals.length && !numeric.length) {
      return { transition: null, kind: "no-eligible", signals: {}, deltas: {} };
    }
    try {
      var r = await IDNLLM.appraise({
        userText: userText,
        stateContext: this.stateContext(),
        transitions: elig.map(function (t) { return { id: t.id, intent: t.intent, examples: t.examples }; }),
        signals: signals,
        numeric: numeric,
      });
      this.lastAppraisal = r;
      var hit = (r.transition && r.transition !== "_none")
        ? elig.filter(function (t) { return t.id === r.transition; })[0] : null;
      hit = vetoHostile(hit, userText);   // refuse a hostile route on plainly non-hostile input
      return { transition: hit || null, kind: hit ? "llm" : "llm-none",
               signals: r.signals || {}, deltas: r.deltas || {}, rationale: r.rationale };
    } catch (e) {
      // offline / weak model: best-effort WORD-overlap routing (keywordRoute). If nothing
      // scores, the node's `fallback` decides — so author a PROGRESSING fallback to keep
      // the story moving even with a dumb/absent model (avoid hard-`stay` on the main path).
      var kw = vetoHostile(keywordRoute(userText, elig), userText);
      return { transition: kw || null, kind: kw ? "keyword" : "no-match", signals: {}, deltas: {} };
    }
  };

  // Telltale fragments of the re-voicing SYSTEM PROMPT (engine/llm.js · render()).
  // A weak model sometimes ECHOES its instructions instead of following them
  // ("You are re-voicing a PRE-WRITTEN story beat… Rephrase only. Second person…").
  // If the output parrots any of these it leaked the prompt — discard it and use
  // the authored beat. Falling back is SAFE (same content), so we can be aggressive.
  var INSTRUCTION_LEAK = /re-?voic|pre-?written|story beat|rephrase only|second person|plain text only|no markdown|do ?not add new|short paragraphs?|beat to voice|current engine state|recent transcript/i;

  // ---- RENDER: re-voice a beat (or fall back to the authored text) ---------
  IDNEngine.prototype._renderBeat = async function (beat, speakerId, recent) {
    if (!beat) return "";
    var ch = this.character(speakerId || this._defaultSpeaker());
    try {
      var txt = await IDNLLM.render({
        speakerPrompt: ch.systemPrompt,
        globalStyle: (this.story.meta && this.story.meta.style) || "",
        beat: beat, stateContext: this.stateContext(), recent: recent,
        improv: this._improv(), temperature: this._renderTemp(), maxTokens: this._renderMaxTokens(),
      });
      var out = txt && txt.trim();
      if (out && INSTRUCTION_LEAK.test(out)) {
        if (global.console) console.warn("[IDN] re-voice leaked the prompt — using authored beat");
        out = "";                                  // drop the meta text; fall back below
      }
      if (out) return out;
    } catch (e) { /* fall through to verbatim */ }
    return beat; // authored fallback — still readable with no LLM
  };

  IDNEngine.prototype._enter = function (nodeId) {
    this.state.current = nodeId;
    this.state.visited.push(nodeId);
    var dest = this.node();
    applyStateEffects(dest.onEnter, this.state);
    this._applyProfile(dest.present);        // named presentation profile (index by STATE)
    applyPresentationEffects(dest.onEnter);  // inline effects still work + override the profile
    return dest;
  };

  // map appraisal SIGNALS (categorical) → authored effects via story.signals
  IDNEngine.prototype._applySignals = function (signals) {
    if (!signals) return;
    var defs = this.story.signals || {}, self = this;
    Object.keys(signals).forEach(function (name) {
      var d = defs[name]; if (!d || !d.options) return;
      var eff = d.options[signals[name]];
      if (eff) { applyStateEffects(eff, self.state); applyPresentationEffects(eff); }
    });
  };
  // apply NUMERIC deltas (only to declared-appraisable params)
  IDNEngine.prototype._applyDeltas = function (deltas) {
    if (!deltas) return;
    var self = this;
    Object.keys(deltas).forEach(function (name) {
      var path = "world." + name, sp = self.specs[path];
      if (!sp || !sp.appraise) return;
      var d = Number(deltas[name]); if (!isFinite(d)) return;
      var cur = getPath(self.state, path);
      setPath(self.state, path, (typeof cur === "number" ? cur : 0) + d);
    });
  };
  IDNEngine.prototype._clampAll = function () {
    var self = this;
    Object.keys(this.specs).forEach(function (path) {
      var sp = self.specs[path], v = getPath(self.state, path);
      if (typeof v !== "number") return;
      if (sp.min != null && v < sp.min) setPath(self.state, path, sp.min);
      if (sp.max != null && v > sp.max) setPath(self.state, path, sp.max);
    });
  };

  /* applyRoute(): the DETERMINISTIC advance. Apply the chosen move + the
   * appraisal signals/deltas, move node, run onEnter, clamp. Pure & synchronous
   * (no LLM) so the whole FSM is unit-testable without a network.
   *   appraised = { transition:<obj|null>, kind, signals?, deltas? } -> {beat,speaker} */
  IDNEngine.prototype.applyRoute = function (appraised) {
    var beat, speaker;
    if (appraised.transition) {
      var t = appraised.transition;
      this.lastRoute = t.id + " [" + appraised.kind + "]";
      applyStateEffects(t, this.state); // transition's own set/inc
      var say = t.say || "";
      if (t.to && t.to !== "stay") {
        var dest = this._enter(t.to);
        beat = [say, dest.beat].filter(Boolean).join("\n\n");
        speaker = dest.speaker;
      } else {
        beat = say || this.node().beat;
        speaker = this.node().speaker;
      }
    } else {
      this.lastRoute = "fallback [" + appraised.kind + "]";
      var cur = this.node(), fb = cur.fallback || {};
      applyStateEffects(fb, this.state);
      if (fb.to && fb.to !== "stay") {
        var d2 = this._enter(fb.to);
        beat = [fb.beat, d2.beat].filter(Boolean).join("\n\n");
        speaker = d2.speaker;
      } else {
        beat = fb.beat || cur.beat;
        speaker = cur.speaker;
      }
    }
    this._applySignals(appraised.signals);  // categorical appraisal → effects
    this._applyDeltas(appraised.deltas);     // optional numeric appraisal → effects
    this._clampAll();
    return { beat: beat, speaker: speaker };
  };

  // control API handed to rules' `do` and the onUpdate() hook
  IDNEngine.prototype._applyDo = function (doEff) {
    if (!doEff) return;
    applyStateEffects(doEff, this.state);
    applyPresentationEffects(doEff);
    if (doEff.goto) { var d = this._enter(doEff.goto); this._redirect = { beat: d.beat, speaker: d.speaker }; }
    if (doEff.end)  this.ended = true;
  };
  IDNEngine.prototype._api = function () {
    var self = this;
    return {
      roll:   function (n) { return self.roll(n); },
      get:    function (p) { return getPath(self.state, p); },
      set:    function (p, v) { setPath(self.state, p, v); },
      inc:    function (p, n) { var c = getPath(self.state, p); setPath(self.state, p, (typeof c === "number" ? c : 0) + n); },
      goto:   function (id) { var d = self._enter(id); self._redirect = { beat: d.beat, speaker: d.speaker }; },
      end:    function () { self.ended = true; },
      glitch: function (lvl) { applyPresentationEffects({ glitch: lvl }); },
      burst:  function (o) { applyPresentationEffects({ burst: o || {} }); },
      log:    function (m) { if (global.console && console.debug) console.debug("[IDN onUpdate]", m); },
    };
  };

  /* Update(): runs AFTER the move, every turn. Mirrors the turn counter, fires
   * declarative `story.rules` (when → do: set/inc/glitch/goto/end, optional once),
   * then the optional `story.onUpdate(engine, api)` hook for dice / D&D checks /
   * complex logic. A goto redirects the rendered beat; end stops the game.
   * Returns a {beat,speaker} redirect if one occurred, else null. */
  IDNEngine.prototype.update = function () {
    this._redirect = null;
    if (this.specs["world.turnCount"]) this.state.world.turnCount = this.state.turns;

    var self = this;
    (this.story.rules || []).forEach(function (rule, i) {
      if (rule.once && self._firedRules[i]) return;
      if (evalGuard(rule.when, self.state)) {
        self._applyDo(rule.do);
        if (rule.once) self._firedRules[i] = true;
      }
    });

    if (typeof this.story.onUpdate === "function") {
      try { this.story.onUpdate(this, this._api()); }
      catch (e) { if (global.console && console.error) console.error("[IDN] onUpdate threw:", e); }
    }

    this._clampAll();
    return this._redirect;
  };

  // ---- THE TURN LOOP: appraise → advance → update → render -----------------
  IDNEngine.prototype.takeTurn = async function (userText, recent) {
    if (this.ended) {
      return this._renderBeat("The story has ended. (type /reset to begin again)",
                              this.node().speaker, recent);
    }
    this.state.turns += 1;
    var appraised = await this._appraise(userText);
    var step = this.applyRoute(appraised);
    var redirect = this.update();   // rules / dice / end conditions may redirect
    if (redirect) step = redirect;
    this.applyBindings();           // reactive param → presentation, after all state settles
    return await this._renderBeat(step.beat, step.speaker, recent);
  };

  // Expose helpers for authoring/debugging and unit-testing the pure logic.
  IDNEngine.evalGuard = evalGuard;
  IDNEngine.keywordRoute = keywordRoute;   // exposed for authoring/tests (offline routing)
  IDNEngine.getPath   = getPath;
  IDNEngine.setPath   = setPath;
  IDNEngine.mulberry32 = mulberry32;

  // Publish the class + a ready-built instance from window.IDN_STORY (if loaded).
  global.IDNEngineClass = IDNEngine;
  if (global.IDN_STORY) {
    try { global.IDNEngine = new IDNEngine(global.IDN_STORY, {}); }
    catch (e) { if (global.console) console.error("[IDN] could not build engine from IDN_STORY:", e); }
  }
})(window);
