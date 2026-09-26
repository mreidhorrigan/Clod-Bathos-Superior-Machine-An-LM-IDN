/* ===========================================================================
 * IDN ENGINE · LLM DISPATCHER   (engine/llm.js)
 * ===========================================================================
 * The provider-agnostic brain. It owns the ONLY two jobs a not-very-smart model
 * does inside this narrative, and builds their prompts + JSON schema here:
 *
 *    1) appraise() — constrained INTENT ROUTING (+ categorical signals). Emits a
 *                    JSON schema whose `transition` is an enum of the legal moves,
 *                    so a structured-output provider literally cannot pick an
 *                    illegal move.
 *    2) render()   — RE-VOICE an authored beat in a character's hidden persona.
 *
 * It does NOT talk to any model directly. Instead it dispatches a single
 * chat(messages, opts) call to the ACTIVE PROVIDER, chosen by ONE config switch:
 *
 *      CONFIG.llm.provider  ->  'ollama' | 'webllm'   (default 'ollama')
 *
 * Providers self-register (see engine/providers/*.js):
 *      IDNLLM.use('ollama', { chat, available?, resetAvailability? })
 *      IDNLLM.use('webllm', { chat, init? })
 * and each implements the SAME contract:
 *      provider.chat(messages, { format?, options?, model? }) -> Promise<string>
 *      provider.init?(onProgress)  -> Promise   // e.g. WebLLM model download
 *
 * If the active provider isn't registered or throws, the FSM (engine.js) catches
 * it and falls back to keyword routing + authored beats — so the game always
 * runs. No modules, no build step. Loads fine from file://.
 * ===========================================================================*/
(function (global) {
  "use strict";

  /* ---- provider registry --------------------------------------------------- */
  var providers = {};

  // Active provider: a `?llm=` URL override wins (quick A/B without editing — e.g.
  // open …/IDN%20Terminal.html?llm=ollama to force Ollama for this load), then
  // CONFIG.llm.provider, then 'ollama'.
  function providerName() {
    try {
      var q = new URLSearchParams((global.location && global.location.search) || "").get("llm");
      if (q) return q;
    } catch (e) {}
    var IDN = global.IDN || {};
    return (IDN.config && IDN.config.llm && IDN.config.llm.provider) || "ollama";
  }
  function activeProvider() { return providers[providerName()]; }

  /* Dispatch one chat call to the active provider. `opts.format` is a JSON-schema
   * object (structured outputs); each provider maps it to its own API. Throws if
   * the provider isn't registered/loaded — engine.js treats that as "offline". */
  async function chat(messages, opts) {
    var p = activeProvider();
    if (!p || typeof p.chat !== "function") {
      throw new Error('IDN LLM: provider "' + providerName() + '" not available');
    }
    return p.chat(messages, opts || {});
  }

  /* Optional model warm-up (WebLLM downloads weights here; Ollama is a no-op).
   * The loading screen calls this so it can show progress. */
  async function init(onProgress) {
    var p = activeProvider();
    if (p && typeof p.init === "function") return p.init(onProgress);
    return null;
  }

  /* Optional reachability probe, delegated to the provider (Ollama implements it;
   * unknown -> null). The turn loop does NOT depend on this. */
  async function available() {
    var p = activeProvider();
    if (p && typeof p.available === "function") return p.available();
    return null;
  }
  function resetAvailability() {
    var p = activeProvider();
    if (p && typeof p.resetAvailability === "function") p.resetAvailability();
  }

  /* -------------------------------------------------------------------------
   * appraise(): the COMBINED route + appraisal call (ONE structured request).
   *   o = {
   *     userText, stateContext,
   *     transitions: [{id,intent,examples}],      // the discrete move (enum)
   *     signals:     [{name,question,options[]}], // categorical appraisals (enum) — RELIABLE
   *     numeric:     [{name,min,max,rubric}],     // numeric deltas — weak models do this POORLY
   *   }
   *   returns { transition:<id|"_none">, signals:{name:value}, deltas:{name:int}, rationale }
   *
   * Why categorical signals instead of raw numbers: measured on llama3.2, free
   * numeric deltas were noise (a parameter stuck at -1 regardless of input), while
   * the SAME model classifies categories accurately. So we let the model CLASSIFY
   * (its strength) and let the backend own the magnitudes (story.signals → effects).
   * Enums and bounded ints are both schema-guaranteed valid — this is about answer
   * QUALITY, not validity. `numeric` is supported for experiments but off by default.
   * ------------------------------------------------------------------------- */
  async function appraise(o) {
    var hasTx   = o.transitions && o.transitions.length;
    var ids     = (hasTx ? o.transitions.map(function (t) { return t.id; }) : []).concat(["_none"]);
    var signals = o.signals || [];
    var numeric = o.numeric || [];

    var props = { transition: { type: "string", enum: ids }, rationale: { type: "string" } };
    var required = ["transition"];

    if (signals.length) {
      var sp = {}, sreq = [];
      signals.forEach(function (s) { sp[s.name] = { type: "string", enum: s.options }; sreq.push(s.name); });
      props.signals = { type: "object", properties: sp, required: sreq };
      required.push("signals");
    }
    if (numeric.length) {
      var np = {}, nreq = [];
      numeric.forEach(function (n) {
        np[n.name] = { type: "integer", minimum: (n.min != null ? n.min : -3), maximum: (n.max != null ? n.max : 3) };
        nreq.push(n.name);
      });
      props.deltas = { type: "object", properties: np, required: nreq };
      required.push("deltas");
    }

    var schema = { type: "object", properties: props, required: required };

    var menu = (o.transitions || []).map(function (t) {
      var ex = (t.examples && t.examples.length) ? "   (e.g. " + t.examples.join(" / ") + ")" : "";
      return "- " + t.id + ": " + t.intent + ex;
    }).join("\n");
    var sigText = signals.map(function (s) {
      var head = "- " + s.name + ": " + (s.question || "classify") + " → one of: " + s.options.join(" / ");
      // per-label glosses (story signals.<name>.labels) — the same one-line-per-option
      // format the transitions menu uses, which weak models follow far more reliably
      // than a single long question paragraph.
      var glosses = s.labels ? s.options.map(function (o) {
        return s.labels[o] ? "    · " + o + ": " + s.labels[o] : null;
      }).filter(Boolean).join("\n") : "";
      return glosses ? head + "\n" + glosses : head;
    }).join("\n");
    var numText = numeric.map(function (n) {
      return "- " + n.name + ": " + (n.rubric || "how it shifts") +
             " (integer " + (n.min != null ? n.min : -3) + ".." + (n.max != null ? n.max : 3) + ", 0 = no change)";
    }).join("\n");

    var sys =
      "You are the APPRAISER + ROUTER for an interactive-narrative state machine. " +
      "Read the situation and the player's input, then: " +
      "(1) pick the SINGLE listed option that best matches what the player is trying to do " +
      '(choose "_none" if off-topic/nonsensical — do not force a weak match)' +
      (signals.length ? "; (2) classify each requested signal" : "") +
      (numeric.length ? "; (3) estimate each requested numeric shift" : "") +
      ". You never write story text and you never invent options. Output JSON only.";

    var user =
      "SITUATION (engine state):\n" + o.stateContext + "\n\n" +
      'PLAYER INPUT:\n"' + o.userText + '"\n\n' +
      (menu    ? "OPTIONS:\n" + menu + "\n- _none: nothing matches\n\n" : "") +
      (sigText ? "SIGNALS TO CLASSIFY:\n" + sigText + "\n\n" : "") +
      (numText ? "NUMERIC SHIFTS TO ESTIMATE:\n" + numText + "\n\n" : "") +
      "Return JSON.";

    var raw = await chat(
      [ { role: "system", content: sys }, { role: "user", content: user } ],
      { format: schema, options: { temperature: 0, num_predict: 256 } } // deterministic, length-capped
    );

    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = {}; }
    if (ids.indexOf(parsed.transition) === -1) parsed.transition = "_none";
    if (!parsed.signals || typeof parsed.signals !== "object") parsed.signals = {};
    if (!parsed.deltas  || typeof parsed.deltas  !== "object") parsed.deltas  = {};
    return parsed;
  }

  /* -------------------------------------------------------------------------
   * render(): re-voice an authored beat in a character's hidden persona.
   *   o = { speakerPrompt, globalStyle, beat, stateContext, recent[], improv, temperature }
   *   returns string.
   * `speakerPrompt` is the character's system prompt — HIDDEN from the player,
   * sent only to the model. Grounding rules keep a weak model from inventing plot.
   * ------------------------------------------------------------------------- */
  async function render(o) {
    var sys =
      (o.speakerPrompt || "You are the narrator.") + "\n\n" +
      (o.globalStyle ? o.globalStyle + "\n\n" : "") +
      "You are re-voicing a PRE-WRITTEN story beat. Convey exactly what the beat " +
      "says — its facts, events and intent — but in your own voice. " +
      "PERFORM the beat, never narrate it: you ARE the speaker, speaking in the " +
      "FIRST person (I/me/my), and you never describe the speaker from the " +
      "outside or report their actions in the third person. " +
      (o.improv
        ? "You may add small sensory flourishes, but invent NO new plot, names, places, or facts."
        : "Do NOT add new plot, facts, names, places, or choices. Rephrase only.") +
      " Use second person for the PLAYER ('you'); otherwise keep your persona's own " +
      "voice and viewpoint. Plain text only, no markdown. Keep it to ONE short paragraph " +
      "(2-4 sentences) — vivid but BRIEF. Never repeat a phrase, clause, or sentence; " +
      "the moment the beat's content is conveyed, STOP.";

    var msgs = [{ role: "system", content: sys }];

    if (o.recent && o.recent.length) {
      msgs.push({
        role: "system",
        content: "RECENT TRANSCRIPT (for tone/continuity only, not authority):\n" +
          o.recent.map(function (m) {
            return (m.role === "user" ? "PLAYER: " : "NARRATOR: ") + m.content;
          }).join("\n"),
      });
    }

    msgs.push({
      role: "user",
      content:
        "CURRENT ENGINE STATE:\n" + (o.stateContext || "(none)") + "\n\n" +
        "BEAT TO VOICE:\n" + o.beat + "\n\n" +
        "Voice this beat now.",
    });

    return await chat(msgs, {
      options: {
        temperature: (o.temperature != null ? o.temperature : 0.7),
        num_predict: (o.maxTokens != null ? o.maxTokens : 150), // ≈1 short paragraph (webllm→max_tokens; ollama native); engine passes CONFIG.engine.renderMaxTokens
        frequency_penalty: 0.5,   // small models (e.g. SmolLM2) collapse into phrase loops without this
        presence_penalty: 0.3,
        repeat_penalty: 1.2,      // ollama's native anti-repeat (webllm ignores the unknown key)
      },
    });
  }

  global.IDNLLM = {
    chat: chat,
    appraise: appraise,
    classify: appraise,   // back-compat alias (appraise is a superset of the old classify)
    render: render,
    init: init,
    available: available,
    resetAvailability: resetAvailability,
    // provider plumbing
    use: function (name, impl) { providers[name] = impl; return impl; },
    provider: providerName,
    providers: providers,
  };
})(window);
