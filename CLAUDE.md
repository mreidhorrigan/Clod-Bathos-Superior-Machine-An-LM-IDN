# CLAUDE.md — orientation for the IDN Terminal project

A glitchy amber-CRT **Interactive Digital Narrative**: the player types free text; a
**deterministic state machine** drives the story while a (small / optional) **LLM only
classifies intent and re-voices authored beats**. Runs in the browser; the narrator is
also **spoken** (in-browser TTS) and the speech + screen glitches are sound-designed.

This file is the fast map. **`README.md` is the deep dive** (full story schema +
per-subsystem docs). **`HANDOFF.md` is current status + the packaging roadmap** (the
active goal: easy/browser-side delivery) — read it first if you're picking this up.

---

## Run / build

- **Default dev run — WebLLM, no Ollama:** `python3 serve.py` → opens `http://localhost:8000/…`.
  The source `CONFIG.llm.provider` defaults to **`webllm`** (an in-browser model via WebGPU),
  so it needs **http + a WebGPU browser**, NOT a `file://` double-click. First run downloads
  the model; the **loading screen** waits for a click/keypress (also unlocks audio) and shows
  download progress. If opened from `file://`, the loader says to run `serve.py`.
- **No-server / `file://` run — Ollama or offline:** set `CONFIG.llm.provider='ollama'` (or
  use the folder build) and double-click. Needs `OLLAMA_ORIGINS='*' ollama serve` for adaptive
  narration, else it plays the authored-text fallback.
- **Two ship builds:** `python3 build.py` → `dist/` (there is **no Node** here):
  - `dist/folder/` — `provider:'ollama'`, runs from `file://`. Zip & ship.
  - `dist/web/` — `provider:'webllm'`, http-hosted (`python3 serve.py`), needs WebGPU.
- Edit the source `CONFIG` block; `build.py` rewrites only the `// BUILD_PROVIDER` line and
  lays out `dist/` (generated — don't hand-edit `dist/`).
- **Extra/alternate stories** live in `stories/*.story.js` — swappable (copy one over `story.js`).

## "The dialogue ignores the LLM" — usually EXPECTED, not a bug

The engine **always plays** even with no model: on any LLM error it falls back to
**keyword routing** (matching a transition's `examples`) + the **authored `beat` shown
verbatim**. That looks identical to "the LLM isn't connected." To actually use a model:

- **WebLLM (the default):** `python3 serve.py`, open over **http** in **Chrome/Edge**
  (NOT Firefox — its WebGPU trips `maxStorageBuffersPerShaderStage requested=10 limit=8`).
  A double-clicked `file://` page can't run WebLLM. First load downloads `CONFIG.webllm.model`
  — note the default **0.5B is weak** (misroutes; over-invents prose); bump to 1.5B/1B for quality.
- **Ollama:** `OLLAMA_ORIGINS='*' ollama serve`, then open with **`?llm=ollama`** (a URL
  override that forces a provider for one load, no edit) — or set `CONFIG.llm.provider='ollama'`.
  Works from `file://`; the origins flag is required there (page origin is `null`).
- **Diagnose in the console:** `IDNLLM.provider()`, `await IDNLLM.available()` (Ollama
  reachability), and `IDN.config.engine.showRouter = true` then take a turn → a route
  logged `[llm]` = model used; `[keyword]`/`[no-match]` = fallback. Check the Network tab
  for the POST to `:11434`.

## Architecture (mental model)

> The state machine is the rails. The LLM is only the conductor.

Per turn (`engine/engine.js → takeTurn`): **appraise** (one constrained LLM call: route to
a *legal* transition + classify categorical `signals`) → **advance** (deterministic) →
**update** (rules / dice / endings) → **render** (re-voice the destination beat) →
**reflect** (push glitch/audio). The LLM never decides *what* happens; weak models are
asked to **classify, not quantify** (numeric estimation is noisy — kept off by default).

## File map

| File | Role |
|---|---|
| `IDN Terminal.html` | UI + `CONFIG` (the one place to configure) + CRT/glitch CSS&JS + loading screen + boot. Loads the engine scripts then an inline app script. |
| `story.js` | `window.IDN_STORY` — the narrative graph + `presentation` index. **Author here.** |
| `engine/engine.js` | The FSM authority: guards, signals, rules, seeded dice, **presentation profiles + bindings**. |
| `engine/llm.js` | **LLM dispatcher**: builds the routing/appraisal JSON schema + re-voicing prompts; routes `chat()` to the active provider. |
| `engine/providers/ollama.js` | LLM provider — local Ollama over HTTP. Self-registers `IDNLLM.use('ollama', …)`. |
| `engine/providers/webllm.js` | LLM provider — WebLLM in-browser (WebGPU); dynamic-`import()`s the lib **only when selected**. |
| `engine/voice.js` | Voice/TTS sound design: SAM → Web Audio rack; ambient bed; glitch SFX. `window.IDNVoice`. |
| `engine/speech.js` | **Speech-to-text / voice control**: pluggable STT (built-in Web Speech provider); player speaks → transcript → the normal prompt. `window.IDNSpeech`. |
| `engine/providers/whisper-stt.js` | **Offline STT provider** — transformers.js Whisper (WebGPU/WASM), no cloud; dynamic-imports the lib only when `provider:'whisper'`. Self-registers `IDNSpeech.use('whisper', …)`. |
| `engine/vendor/samjs.js` | Vendored SAM TTS (~23 KB pure JS). License is murky (reverse-engineered) — see README. |
| `build.py` | Emits `dist/folder` + `dist/web`. Pure stdlib. |
| `storytest.py` + `tests/` | **Headless LLM-live playtests**: scenario JSONs + a JSC driver run the real engine against local Ollama (no browser/vis/audio). Not shipped by `build.py`. |
| `README.md` | Full docs. | `dist/` | Generated. |

## Subsystems (where to look)

- **LLM** — `CONFIG.llm.provider` ('ollama'|'webllm') switches it. Dispatcher in `llm.js`;
  providers in `engine/providers/`. Add one: implement `chat(messages,{format,options})`
  (+ optional `init(onProgress)`) and `IDNLLM.use('name', impl)`. Fallback lives in
  `engine.js` (`_appraise` catch + `_renderBeat` catch). `_renderBeat` also applies
  deterministic **render guards** — speaker-label strip, mid-sentence truncation trim,
  node `mustConvey` (key-fact words), `meta.renderMustNot` (persona regex backstop) —
  any failure discards the re-voice for the authored beat. Don't put QUOTABLE forbidden
  phrases in a persona prompt (weak models parrot them); use `renderMustNot`.
- **Voice/audio** — `CONFIG.voice` + `engine/voice.js` / `window.IDNVoice`. SAM renders PCM
  → a Web Audio rack (presets `crt|menacing|haunted|thaw|warm|clean|dry`, plus the **WARMTH
  TRAJECTORY**: `setWarmth(t)`, t ∈ -1 haunted … -0.4 menacing … +0.2 thaw … +1 warm,
  interpolates the rack between anchors; drive via profile `warmth:` or a `voice.warmth`
  binding — the simple Clod's gates climb it; the complex Clod binds mood to it), a
  generative **ambient** bed, and
  **glitch SFX** synced to the visual glitches. Voice energy also drives `IDN.glitch.level`
  (reactive). Spoken text is **paced to the audio duration**; `CONFIG.typeSpeed` is the
  unvoiced fallback (~13 cps = SAM's rate). `/voice …` slash commands toggle/tune it live.
- **Voice input / STT** — `CONFIG.speech` + `engine/speech.js` / `window.IDNSpeech`. The
  *mirror* of the voice layer: the player SPEAKS, the transcript is dropped into the prompt and
  submitted like typed text (no separate path — same FSM + LLM appraisal). Pluggable exactly like
  the LLM (`IDNSpeech.use('name', impl)`, `?stt=` override). Two providers: **`webspeech`**
  (built-in default) = the browser Web Speech API — no deps/download, but in Chrome it MAY use
  Google's cloud; it prefers on-device and `CONFIG.speech.localOnly` forces no-cloud (errors if
  unavailable). **`whisper`** (`engine/providers/whisper-stt.js`) = fully OFFLINE transformers.js
  Whisper on WebGPU/WASM — audio never leaves the device; model streams once from the HF CDN (like
  WebLLM), dynamic-imported only when selected; tap-to-talk via a tiny energy VAD endpointer.
  Default tap-to-talk (`/listen`), opt-in hands-free (`continuous`, mutes the mic while the
  narrator talks via `IDNVoice.isSpeaking()`). Mic needs a secure context (localhost/https) → the
  served build; mic button hidden + silent no-op where unsupported. `/listen …` + a mic button drive it.
- **CRT / glitch visuals** — `<style>` + `5. GLITCH ENGINE` in the HTML; runtime API
  `IDN.glitch` / `IDN.clock`. A bright **scan bar** sweeps down; the screen edge is a clean
  static rounded rect (the old re-rolled ragged edge was removed — never re-roll a clip-path).
- **Presentation index** — `story.presentation` ties glitch+audio to state in ONE place:
  `profiles` (named look/sound a node picks via `present:` — index by STATE) + `bindings`
  (world/char param → presentation target each turn — index by PARAMETER). **Precedence:
  profile → inline `onEnter` → bindings (bindings win).** Engine: `_applyProfile`,
  `applyBindings`, `applyPresentationTarget` in `engine.js`.

## Conventions (respect these when editing)

- **Classic `<script>`, NOT ES modules** — so it loads from `file://`. Load order matters
  (llm → providers → story → engine → samjs → voice → inline app).
- **Nothing fetches a local asset at runtime** (keeps `file://` working): SAM is pure JS,
  the reverb IR is synthesized in JS, the bitcrusher is a `ScriptProcessorNode` (not an
  AudioWorklet, which needs `addModule(url)`), and WebLLM is dynamic-imported only when
  selected. Preserve this when adding features.
- **Lazy `CONFIG` reads** — subsystems read `window.IDN.config.*` at call time (a `cfg()`
  helper), so script load-order never bites. `window.IDN` is assembled at the end of the
  inline script.
- **Degrade, never throw into the turn loop** — providers/voice/glitch all no-op or fall
  back if a dependency is missing.

## Testing without Node (there is no Node here; Python 3 + `osascript` are available)

- **`python3 storytest.py` — the headless story-testing harness (USE THIS FIRST).** Runs the
  REAL engine + story under JavaScriptCore (`tests/driver.js`) with LLM calls bridged to local
  Ollama — no browser, vis/audio out of the loop. **Operating manual: `tests/README.md`**
  (suites, commands, output interpretation, the debugging loop). Two suites: the DEFAULT
  (`storytest.py --reps 3`, simple story, must stay green on `smollm2:1.7b`) and the COMPLEX
  (`storytest.py tests/scenarios/complex/*.json --model llama3.2 --reps 3` — that story's
  5-way signal taxonomy is noise below ~3B, measured). `--llm off` = keyword-fallback path;
  `probe:true` = routing matrix; `-v` dumps the exact prompts.
- **Parse-check** any JS without executing: `new Function(src)` under
  `osascript -l JavaScript` (throws on syntax errors). For the HTML, extract the inline
  `<script>` with a tiny Python regex first.
- **Headless JSC facts:** stub `window`/`console` etc.; promise **microtasks DO drain when
  the main evaluation ends**, so full `async` chains (e.g. `takeTurn()`) complete IF every
  await resolves without timers — make the provider synchronous (blocking curl) and emit
  results via ObjC stdout, not the script's return value. Timers never fire. For UMD vendor
  libs, prepend a `var module={exports:{}}` shim. See memory "Browser JS testing w/o Node".
- Real WebGPU inference, actual audio, and the mic need a browser/server — verify manually.

## Gotchas

- **Audio is silent until the loading-screen gesture** (browser autoplay policy) — by design.
- **WebLLM needs WebGPU + http hosting, and specifically Chrome/Edge** — it cannot run from
  `file://`, and **Firefox fails** (`maxStorageBuffersPerShaderStage requested=10 limit=8`).
  A real neural model can't be embedded in the HTML (weights are 100s of MB–GB; streamed from CDN).
- **`?llm=ollama` / `?llm=webllm` URL param** overrides the provider for one load (no edit) —
  handy for testing. See `engine/llm.js → providerName()`. (`?stt=` does the same for speech.)
- **Voice input (STT) needs a secure context, and the default may use the cloud** — the mic
  (`getUserMedia`) only works over localhost/https (the served build), NOT a double-clicked
  `file://`. The default `webspeech` provider MAY stream audio to Google's cloud in Chrome; for
  guaranteed no-cloud use `CONFIG.speech.provider='whisper'` (fully offline) or `localOnly:true`
  (on-device webspeech, errors if unavailable). The Whisper model downloads on first mic use.
- **Default WebLLM model (0.5B) is weak** — misroutes / over-invents. For a shipped experience
  bump `CONFIG.webllm.model` to ~1.5B/1B. (See HANDOFF.md → Packaging.)
- **SAM's license** is murky (reverse-engineered) — fine for personal use, risky to
  redistribute; the TTS source is isolated behind `renderSAM()` in `voice.js` for easy swap.
- **A binding overrides a profile/`onEnter`** for the same target every turn — bind
  continuous params to targets your scenes don't set (ambient / preset / a glitch bias).

## Cross-session memory
Durable notes live in `~/.claude/projects/<this-project>/memory/` (user profile,
LLM-providers/builds, presentation index, the weak-LLM rule, the no-Node testing trick).
