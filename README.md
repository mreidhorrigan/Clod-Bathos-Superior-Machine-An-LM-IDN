# State-Machine-Driven LLM — IDN Template

A template for an **adaptive interactive digital narrative** where a human types
free text and a **local LLM (Ollama)** responds — but the *story* is driven by a
**deterministic state machine**, not by the model. This is the architecture that
lets a *not-very-smart* local model run a *sophisticated* narrative reliably.

## The core idea

> The state machine is the rails. The LLM is only the conductor.

Think of it as an **automated tabletop game master**: the LLM supplies
*judgement* and *voice*; the engine is the *rules*; each character's hidden
prompt is its *persona*. The finite-state machine owns **all** authoritative
structure — current node, legal moves, world + per-character state — and the LLM
never decides what happens. Each turn runs a fixed pipeline:

1. **APPRAISE** *(one constrained LLM call)* — pick **one legal transition** out
   of the current node, **and** classify any categorical **signals** the node
   asks for (e.g. the player's *tone*). Ollama **structured outputs** (JSON-schema
   constrained decoding) mean the model *literally cannot* return an illegal move
   or an out-of-set label.
2. **ADVANCE** *(deterministic)* — apply the move's authored effects, map each
   signal to state changes via your rules, then mutate + clamp state.
3. **UPDATE** *(deterministic)* — run declarative `rules` + an optional
   `onUpdate()` hook (dice rolls, D&D-style checks, end conditions). Either may
   redirect the scene or end the game.
4. **RE-VOICE** *(one LLM call)* — rephrase the resulting authored *beat* in the
   speaking character's hidden persona, grounded in FSM facts (it rephrases; it
   never invents plot).

Open-ended generation (where small models drift, forget, break character) is
replaced by **constrained classification + grounded rephrasing** — what weak
models are actually good at.

**Why categorical signals and not raw numbers?** Measured on llama3.2 (3B): asked
for a numeric delta per parameter ("how much should trust change?"), the model
returned noise — a value stuck at `-1` regardless of input. Asked to *classify*
(which transition? what tone?), it was reliably correct. So the LLM classifies
and the **backend owns the magnitudes** (`signal → effect`). A numeric-delta path
exists for experiments but is **off by default** (`CONFIG.engine.numericAppraisal`).

### Do we need MCP? No.

MCP is for letting an *autonomous* LLM client discover and call external tools.
Here the flow is the opposite — `game → LLM → game` — so the game stays in
control and calls the model as a constrained subroutine. We use Ollama's native
HTTP API with structured outputs. (MCP would only help later, at *authoring*
time — e.g. exposing the story graph so Claude can help write it. Not the
runtime.)

## Files

| File | Role |
|---|---|
| `IDN Terminal.html` | The CRT-terminal front end. Single integration point: `queryBackend()`. |
| `engine/llm.js` | **LLM dispatcher.** Builds the routing/appraisal JSON schema + re-voicing prompts (`appraise()` / `render()`) and calls the *active provider*. Provider-agnostic. |
| `engine/providers/ollama.js` | LLM provider — local **Ollama** over HTTP (the folder build). |
| `engine/providers/webllm.js` | LLM provider — **WebLLM** in-browser via WebGPU (the web build). Imports the library only when selected. |
| `engine/engine.js` | The FSM. `takeTurn()` = appraise → advance → **`update()`** → render → reflect. The authority: specs, guards, signals, rules, seeded dice. |
| `engine/voice.js` | **Voice / TTS sound design.** Renders each line with SAM and routes it through a Web Audio effects rack (`window.IDNVoice`). See *Voice* below. |
| `engine/vendor/samjs.js` | Vendored [SAM](https://github.com/discordier/sam) — a ~23 KB pure-JS TTS. No data files, loads from `file://`. (Reverse-engineered C64-era synth; see the license note under *Voice*.) |
| `engine/speech.js` | **Speech-to-text / voice control.** Pluggable recogniser (`window.IDNSpeech`); the player speaks and the transcript enters the prompt like typed text. Built-in **Web Speech** provider. See *Voice input* below. |
| `engine/providers/whisper-stt.js` | STT provider — **offline Whisper** via transformers.js (WebGPU/WASM), no cloud. Imports the library only when selected. |
| `story.js` | The narrative graph (`window.IDN_STORY`). **Edit this to write your story.** |
| `build.py` | Emits the two ship builds into `dist/` (folder = Ollama/`file://`, web = WebLLM/http). See *Two builds*. |
| `serve.py` | Static http server so the default WebLLM provider can run (`python3 serve.py`). |
| `stories/` | Swappable alternate stories (`*.story.js`, same shape as `story.js`); copy one over `story.js` to play it. |

Everything is plain classic `<script>` (no modules, no build step) so it runs
straight from `file://`.

### Where to change what

| You want to… | Edit |
|---|---|
| Write/alter the story (nodes, characters, signals, rules, dice) | `story.js` |
| Switch the LLM (Ollama ⇄ WebLLM) | `CONFIG.llm.provider` — one line; see *Choosing the LLM* |
| Switch voice input (Web Speech ⇄ offline Whisper) / make it no-cloud | `CONFIG.speech.provider` / `CONFIG.speech.localOnly` — one line; see *Voice input* |
| Add/tune voice control (mic, tap-to-talk, a new STT provider) | `CONFIG.speech` + `engine/speech.js` (+ `engine/providers/*-stt.js`) |
| Swap the model, system prompt, type speed | the `CONFIG` block (`CONFIG.ollama` / `CONFIG.webllm`) in `IDN Terminal.html` |
| Tune FSM behaviour (render temperature, numeric appraisal, router debug) | `CONFIG.engine` |
| Change the prompts / structured-output schema, or add a provider | `engine/llm.js` (dispatcher) + `engine/providers/*` |
| Change turn logic (appraise → advance → update → render) | `engine/engine.js` |
| Retune/extend the spoken voice (presets, per-character, rack) | `engine/voice.js` + `CONFIG.voice` |
| Tweak the CRT look (scanlines, glitch, colours, edges) | the `<style>` + `5. GLITCH ENGINE` section of `IDN Terminal.html` |
| Bind glitch/audio to states or world params | `story.presentation` (profiles + bindings) — see *Presentation* |

Each major file opens with a banner comment stating its role, and the inline
`<script>` is split into numbered ALL-CAPS sections (search for `1. CONFIG`,
`5. GLITCH ENGINE`, …). Start at `story.js` to author; start at `CONFIG` to configure.

## Running it

**Default — WebLLM, no Ollama.** The source defaults to `provider: 'webllm'` (an
in-browser model). Run **`python3 serve.py`** and open the printed
`http://localhost:8000/…` URL in a **WebGPU** browser (Chrome / Edge). The first run
downloads the model (cached after) — no Ollama, no server you maintain. WebLLM can't
run from a `file://` double-click; the loading screen will tell you to use `serve.py`.

The steps below are the **Ollama / `file://`** path (set `CONFIG.llm.provider = 'ollama'`,
or use the folder build):

1. **Install + pull a model.** A small instruction-following model that's good
   at JSON is enough — the model's job here is deliberately tiny. Tested with
   `llama3.2` (3B); `qwen2.5` is also excellent at structured output.
   ```sh
   ollama pull llama3.2
   ```
2. **Start Ollama allowing the page's origin** (needed because the browser calls
   `localhost:11434` directly):
   ```sh
   OLLAMA_ORIGINS='*' ollama serve
   ```
3. **Open `IDN Terminal.html`** in a browser. (Either double-click it — `file://`
   works — or serve the folder with `python3 -m http.server` and open
   `http://localhost:8000/IDN%20Terminal.html`.)
4. Set the model in the HTML `CONFIG.ollama.model` if you pulled something other
   than `llama3.2`.

**Offline / no Ollama:** the engine degrades gracefully — input is routed by
keyword matching against each transition's `examples`, and beats are shown as
authored text verbatim. The narrative is still playable, just not adaptive.

**Voice / sound design:** the narrator is also **spoken** — each line is rendered
by a tiny TTS and processed through a Web Audio rack (see *Voice* below). Browsers
start audio suspended, so the app opens on a **loading screen**; the first
click/keypress unlocks audio (and starts the ambient bed), *then* boots — so the
opening narration is voiced and the background is already humming. Toggle/retune
live: `/voice` (on/off), `/voice haunted`, `/voice test`. The voice is independent
of Ollama — it speaks whatever is shown.

## Choosing the LLM: Ollama or WebLLM

The narrator's model is a **pluggable provider**, chosen by one switch:

```js
CONFIG.llm = { provider: 'webllm' }   // default; 'ollama' | 'webllm'
```

- **`ollama`** — a local **Ollama** server over HTTP (`engine/providers/ollama.js`). Runs from `file://`; you run `ollama serve` (see *Running it*).
- **`webllm`** — a model running **entirely in the browser** via **WebGPU** (`engine/providers/webllm.js`), no server. The library is dynamically `import()`ed *only when selected*, so the Ollama build never loads it and stays `file://`-safe. Choose the model in `CONFIG.webllm.model` (default: a small q4 instruct model). **Requires WebGPU + http hosting**; the loading screen shows the one-time model download.

`engine/llm.js` builds the same prompts + JSON schema for both and dispatches to the active provider. If the provider is unreachable, the FSM falls back to keyword routing + authored beats, so the game always runs. **Add another backend** by implementing `chat(messages, { format, options })` and registering it: `IDNLLM.use('myprovider', { chat })`.

### Is the model actually being used?

The engine **always plays even with no model** — on any LLM error it falls back to
keyword routing (matching a transition's `examples`) + the authored `beat` shown
verbatim. That's indistinguishable from "the LLM isn't connected," so if the narration
seems non-adaptive:

- **Ollama:** run it with origins allowed — `OLLAMA_ORIGINS='*' ollama serve` (**required
  from `file://`**, where the page origin is `null`, or the browser CORS-blocks the call) —
  and make sure `CONFIG.ollama.model` is pulled.
- **WebLLM:** serve over **http** (`python3 serve.py`) and open in **Chrome/Edge** — *not*
  Firefox (its WebGPU fails with `maxStorageBuffersPerShaderStage requested=10 limit=8`); won't
  run from `file://`. The default 0.5B model is weak (misroutes / over-invents) — bump
  `CONFIG.webllm.model` to ~1.5B/1B for better play. Tip: append **`?llm=ollama`** (or `?llm=webllm`)
  to the URL to force a provider for one load without editing.
- **Confirm:** in the console, `await IDNLLM.available()` and `IDN.config.engine.showRouter = true`,
  then take a turn — a route logged `[llm]` means the model drove it; `[keyword]` / `[no-match]`
  means the fallback did.

## Two builds (`build.py`)

One source, two deployables — pure-Python, no Node, it just rewrites the one
provider line and lays out `dist/`:

```sh
python3 build.py          # both, into dist/
python3 build.py folder   # just the Ollama / file:// build
python3 build.py web      # just the WebLLM / http build
```

- **`dist/folder/`** — `provider='ollama'`, entry `IDN Terminal.html`. Zip and ship; users open it from `file://` and run Ollama (or rely on the offline fallback).
- **`dist/web/`** — `provider='webllm'`, entry `index.html`, plus a `serve.py`. Deploy to any static host; `python3 serve.py` for a local test. Needs a WebGPU browser; first load downloads the model.

Both share the exact same `engine/`, `story.js`, etc.; each build folder gets a `READ-ME-FIRST.txt` quick-start.

## Story-graph schema (`story.js`)

```js
window.IDN_STORY = {
  meta: {
    title: "…",
    start: "node_id",            // entry node
    defaultSpeaker: "host",      // used if a node omits `speaker`
    style: "…",                  // appended to EVERY render (tone/setting rules)
  },

  // World vars. A plain value is exposed to the LLM and not appraised; or use a
  // spec to bound it, hide it, or opt into numeric appraisal.
  world: {
    trust:     0,                                           // plain value (exposed)
    warmth:    { value: 0, min: -3, max: 3, expose: true }, // bounded + clamped
    turnCount: { value: 0, hidden: true },                  // withheld from the LLM
    // full spec: { value, min, max, expose|hidden, appraise, rubric }
  },

  characters: {
    host: {
      name: "IDN/OS",
      systemPrompt: "…",          // HIDDEN from the player; the persona used when this character speaks
      state: { mood: "neutral" }, // mutable per-character data the FSM/guards read/write
      // expose: false            // optional: hide this character's state from the LLM
    },
    // … more characters, each with their own hidden persona + state
  },

  // SIGNALS: categorical appraisals the LLM classifies (in the SAME call as
  // routing); each option maps to deterministic effects. Reference via `signal:`.
  signals: {
    tone: {
      question: "Classify the player's tone toward the listener",
      options: {
        warm:    { inc: { "world.warmth": 1 } },
        neutral: {},
        cold:    { inc: { "world.warmth": -1 } },
        hostile: { inc: { "world.warmth": -1 }, set: { "char.host.mood": "hurt" } },
      },
    },
  },

  // RULES: checked every turn in update(), after the move.  when → do.
  rules: [
    { when: { var: "world.warmth", lte: -3 }, do: { goto: "bad_end" }, once: true },
    { when: { var: "world.turnCount", gte: 16 }, do: { end: true } },
  ],

  // onUpdate(): arbitrary per-turn logic (dice, D&D checks). api members:
  //   roll(n) get(p) set(p,v) inc(p,n) goto(id) end() glitch(lvl) burst(o) log(m)
  onUpdate: function (engine, api) {
    if (api.get("world.warmth") < 0 && api.roll(6) === 1) api.burst({ level: 1.0 });
  },

  // PRESENTATION: bind the look + sound to the state machine (see "Presentation").
  presentation: {
    profiles: {                       // a named look+sound, selected by a node's `present`
      dread: { glitch: 0.85, burst: { level: 1.5, duration: 1500 }, preset: "haunted", sfx: 0.4 },
      calm:  { glitch: 0.2 },
    },
    bindings: [                       // map a world/char PARAM → a presentation TARGET, each turn
      { from: "world.warmth",    to: "ambient.level", map: "invert", in: [-3, 3], out: [0.03, 0.12] },
      { from: "char.host.mood",  to: "voice.preset",  cases: { hurt: "haunted", default: "crt" } },
    ],
  },

  nodes: {
    node_id: {
      title: "…",                 // optional, shown to the LLM as the scene label
      speaker: "host",            // which character re-voices this beat
      beat: "Authored facts/prose for this moment.",
      signal: "tone",             // optional: also classify this signal this turn
      improv: false,              // optional: loosen re-voicing into bounded freeform
      present: "dread",           // optional: a named presentation profile (see Presentation)
      onEnter: {                  // applied when the node is entered (overrides `present`)
        set: { "world.flag": true }, inc: { "world.trust": 1 },
        glitch: 0.6,                     // → window.IDN.glitch.set({level})
        burst:  { level: 1.2, duration: 900 }, // → window.IDN.glitch.burst()
        clock:  { date: "01-JAN-87", time: "01:44:00" }, // → window.IDN.clock.set()
        preset: "haunted", ambient: 0.06, sfx: 0.4       // → audio (voice rack / bed / blips)
      },
      transitions: [
        {
          id: "open_door",                 // the enum value the router may emit
          intent: "The player tries to open / go through the door", // NL description for the LLM
          examples: ["open the door", "go inside"],  // few-shot hints + offline keyword fallback
          when: { var: "world.hasKey", eq: true },   // GUARD (optional) — see below
          set: { "world.doorOpen": true }, inc: { "world.trust": 1 }, // effects when taken
          say: "Optional short fragment prepended to the destination beat.",
          to: "next_node_id"               // or "stay" to remain in place
        }
      ],
      fallback: { to: "stay", beat: "The terminal does not understand." } // when nothing matches
    }
  }
};
```

### State paths

- `world.x` → global world var
- `char.<id>.<field>` → that character's `state.<field>` (e.g. `char.other.mood`)
- `flags.x` → ad-hoc flags

### Guards (`when`) — safe, no `eval`

```js
{ var: "world.trust", gte: 2 }                 // ops: eq ne gt gte lt lte in truthy
{ all: [ {var:"world.knowsName",eq:true}, {var:"world.trust",gte:2} ] }
{ any: [ … ] }    { not: { … } }
```
A transition whose guard fails is **invisible to the router** — the LLM is only
ever offered currently-legal moves. (See the `deepen` transition in `story.js`:
it only unlocks at `trust >= 2`, so small talk is the way to earn the deep path.)

### Signals (categorical appraisal — the reliable "LLM adjusts state")

A node can ask the LLM to classify a **signal** (a small enum, e.g. tone) in the
*same* call as routing. Each option maps to deterministic effects you author:

```js
signals: { tone: { question: "…", options: {
  warm:    { inc: { "world.warmth": 1 } },
  hostile: { inc: { "world.warmth": -1 }, set: { "char.host.mood": "hurt" } },
} } }
```
The model only *labels* (its strength); your effects own the magnitude. Use this
instead of asking a small model for raw numbers — measured, the numeric form was
noise while labels were reliable.

### Rules + `update()` (the per-turn rules engine / GM adjudication)

After each move, `update()` mirrors the turn counter, fires `story.rules`
(`when` guard → `do`: `set`/`inc`/`glitch`/`burst`/`clock`/`goto`/`end`, optional
`once`), then calls `story.onUpdate(engine, api)` for arbitrary logic — **dice
rolls, D&D-style checks, end conditions**. A `goto` redirects the rendered beat;
`end` stops the game. Dice use a **seedable** RNG —
`new IDNEngineClass(story, { seed })` — so playtests are reproducible.

## Presentation — glitch & audio bound to state

The amber-CRT glitch and the audio (voice / ambient / SFX) are bound to the state
machine in ONE indexable place, `story.presentation`, instead of being scattered
through nodes. Two complementary mechanisms:

**Profiles (index by STATE).** A named bundle of presentation effects a node selects
with `present: "name"`:

```js
presentation: { profiles: {
  tense: { glitch: 0.70, burst: { level: 1.2, duration: 900 }, sfx: 0.35 },
} }
// …
nodes: { suspicion: { present: "tense", /* … */ } }
```

The vocabulary is the same as a node's `onEnter` (which still works and **overrides**
the profile): `glitch` (0..1 level), `burst`, `clock`, plus audio — `preset`
(`crt|haunted|clean|dry`), `ambient` (number = level, or boolean), `sfx` (same),
`voice` (boolean). Reuse one profile across many nodes; restyle a whole act in one spot.

**Bindings (index by PARAMETER).** Map a world/character value to a presentation
*target*, re-applied every turn:

```js
presentation: { bindings: [
  // numeric: scale the value's [in] range onto the target's [out] range (map: 'linear'|'invert')
  { from: "world.warmth",    to: "ambient.level", map: "invert", in: [-3, 3], out: [0.03, 0.12] },
  // categorical: pick a target by value
  { from: "char.other.mood", to: "voice.preset",  cases: { hurt: "haunted", default: "crt" } },
] }
```

Targets: `glitch.level` · `glitch.<bias>` (e.g. `chromaBias`) · `glitch.enabled` ·
`clock` · `voice.preset` · `voice.enabled` · `ambient.level` · `sfx.level`.

**Precedence.** Each turn: the node's `present` profile applies, then its inline
`onEnter`, then **bindings** — so a binding *wins* for any target it writes. Put
*discrete* per-scene looks in profiles; bind *continuous* params (warmth, a meter) to
targets the scenes don't set (ambient, preset, a glitch bias). The shipped `story.js`
does exactly that: profiles own each scene's glitch/burst/sfx, while `warmth →
ambient.level` and `the presence's mood → voice.preset` are bindings.

Both are optional and back-compatible: a node with a plain `onEnter` and no `present`,
in a story with no `presentation` block, behaves exactly as before.

## How the front end is wired

`CONFIG.backend = 'engine'` routes `queryBackend()` → `window.IDNEngine.takeTurn()`.
The original `'auto' | 'ollama' | 'mock'` modes are kept intact (plain-chatbot
demos / offline preview). Narrative state also reflects into the CRT via
`window.IDN.glitch` and `window.IDN.clock` from each node's `onEnter`.

Tuning knobs live in `CONFIG.engine`:
- `renderTemperature` — creativity of re-voicing (routing/appraisal is always temperature 0).
- `improv` — global default for bounded freeform (per-node `improv` overrides).
- `numericAppraisal` — let the LLM estimate raw numeric deltas. **Off by default**;
  small models do this poorly (measured). Prefer categorical `signals`.
- `showRouter` — `console.debug` the chosen transition, signals, and world each turn.

Inspect live state anytime in the console: `IDNEngine.state`.

## Voice / TTS sound design

The narrator isn't only printed — it's **spoken**, and the speech is treated as
**sound design**: rendered to raw PCM, then run through a **Web Audio effects
rack** before it reaches the speakers. So the voice lives *inside* the degraded-CRT
world (band-limited, bit-crushed, reverbed, reactive) instead of sitting on top of
it. It's in `engine/voice.js` and configured in `CONFIG.voice`.

**Why SAM, not the browser's `speechSynthesis`?** You *cannot* route
`speechSynthesis` through Web Audio — it goes straight to the output device with no
tap, so none of the processing below would be possible. SAM is a ~23 KB pure-JS
port of the C64-era *Software Automatic Mouth*; it renders to a `Float32Array` we
drop into an `AudioBuffer`, and its robotic timbre is ideal raw material.
(`engine: 'webspeech'` exists as an **unprocessed** fallback only.)

### Signal path (one reusable graph; presets just retune the nodes)

```
SAM ─▶ AudioBuffer(22050) ─▶ source(detune)
     ─▶ highpass ─▶ lowpass ─▶ bit-crusher ─▶ soft-drive
     ─▶ ( dry + convolver reverb )   ← reverb IR is synthesised in JS (no file)
     ─▶ ( dry + ring-mod )           ← opened only by the 'haunted' preset
     ─▶ master ─▶ analyser ─▶ output
```

Deliberately **file://-safe**: the bit-crusher is a `ScriptProcessorNode` (an
`AudioWorklet` needs `addModule(url)`, which Chrome blocks over `file://`) and the
reverb impulse is generated in JS — so there are **no assets to fetch**.

### Presets (`CONFIG.voice.preset`, or `/voice <preset>`)

| Preset | Character |
|---|---|
| `crt` *(default)* | Shortwave / intercom / dying CRT. Band-limit + 8-bit crush + drive + short verb. |
| `haunted` | Detuned, ring-modulated, long dark reverb. Uncanny. |
| `clean` | Light tone-shaping only; mostly intelligible. |
| `dry` | Bypass — SAM straight to the speakers. |

### Per-character voices

With `perCharacter` on, the speaking character (`node.speaker`) selects a SAM voice
profile (pitch/speed/mouth/throat) plus rack biases — `IDN/OS` is brighter and
drier; *the presence* is lower, hollow, wetter — and its **mood** nudges it further
(`hurt`/`wary` → colder and more crushed; `anchored` → warmer). Edit `PROFILES` in
`voice.js`; the keys are character ids from `story.js`.

### Text paced to the voice

When a paragraph is voiced, the typewriter reveals it over the **exact length of
its spoken audio** — `IDN.voice.speak()` returns the duration and
`typeOutParagraphs` spreads it across the characters (keeping the punctuation
rhythm), so text and speech land together, automatically per character voice.
`CONFIG.typeSpeed` (default `16` cps) is only the **fallback** for when the voice
is off (the loading screen unlocks audio before boot, so even the opener is
voiced). SAM speaks at ~13 cps — which is why the original 80 cps made the text
race the narration.

### Reactive (`reactive: true`)

While a line plays, its energy nudges `IDN.glitch.level`, so the screen **tears in
time with the voice**, then restores the baseline. The per-utterance degradation
(how hard the crush/lowpass bite) tracks the node's authored `glitch` level — the
more broken the signal, the more broken the voice.

### Glitch SFX (audio ⇆ visual sync)

The coupling runs both ways. *Reactive* (above) is **audio → visual**: the voice's
energy drives `IDN.glitch.level`. **Glitch SFX** is the reverse, **visual → audio**:
the instant the glitch scheduler fires an effect (`rollEvent` in the HTML) it calls
`IDN.voice.sfx.blip(kind)`, which plays a short procedural sound matched to that
effect — a bright pop for a `flash`, a downward zip for a `tear`, a metallic ring
for `chroma`, a low wobble for `skew`, ticks for `jitter`/`overlap`. The blips are
quiet, throttled, and scale with `glitch.level`. Since the voice also raises the
glitch level, speaking makes the screen tear *and* those tears click — picture and
sound break together. Configure with `CONFIG.voice.glitchSfx` (`enabled`, `level`),
toggle with `/voice sfx on|off`, tune live with `IDN.voice.sfx.setLevel(0.3)`.

### Ambient bed (background sound design)

A quiet, generative **"dead channel"** plays under everything: looped white noise
band-passed into soft hiss (with a slow LFO wandering the band for *shortwave*
movement) plus a low ~56 Hz carrier hum — all synthesised in Web Audio, **no
samples**. It starts on the first gesture-unlock and is gated by a master gain, so
it fades in/out click-free and the oscillators never restart.

It **swells with `IDN.glitch.level`**: as a tense node raises the glitch (or the
voice's reactivity does), the static grows louder, brighter and more resonant, then
recedes when things calm — so *"the static crowds in"* is literally audible.
Configure with `CONFIG.voice.ambient` (`enabled`, `level`), toggle with
`/voice ambient on|off`, tune live with `IDN.voice.ambient.setLevel(0.08)`. The bed
always comes up **before** the first spoken line: it starts on the unlocking
gesture, and `CONFIG.voice.leadInMs` (default 700 ms) holds the first utterance
back so the background establishes first.

### Control surface

```js
IDN.voice.setPreset('haunted');            // or  /voice haunted
IDN.voice.toggle();                        // or  /voice   (on/off)
IDN.voice.test();                          // speak a sample with current settings
IDN.voice.fx.lp.frequency.value = 2000;    // live-tweak any rack node
IDN.voice.profiles.other.sam.pitch = 90;   // retune a character voice (SAM: higher = lower)
IDN.voice.ambient.toggle();                // background bed on/off  (or /voice ambient off)
IDN.voice.ambient.setLevel(0.08);          // background bed loudness, 0..1
IDN.voice.sfx.toggle();                    // glitch blips on/off    (or /voice sfx off)
IDN.voice.sfx.setLevel(0.3);               // glitch-blip loudness, 0..1
```
Slash commands: `/voice` · `/voice on|off` · `/voice test` · `/voice crt|haunted|clean|dry` · `/voice ambient on|off` · `/voice sfx on|off`.

> **License note (matters if you redistribute this template).** SAM / `sam-js` is a
> reverse-engineering of 30-year-old commercial software; its own README says *"Use
> it at your own risk."* Fine for personal/experimental use; for commercial
> redistribution, consider swapping in a clearly-licensed engine. The TTS source is
> isolated behind `renderSAM()` in `voice.js`, so a swap (e.g. eSpeak-NG WASM)
> doesn't touch the rack.

## Voice input — speech-to-text (voice control)

The mirror image of the spoken narrator: the player can **talk instead of type**. A
recognised phrase is dropped into the prompt and submitted **exactly as if typed**, so
the same FSM + LLM appraisal runs — there is no separate "voice path" to maintain. It's
in `engine/speech.js` (`window.IDNSpeech`), configured in `CONFIG.speech`, and a **mic
button** appears at the right of the prompt whenever a recogniser is available (otherwise
the whole thing is a silent no-op and you just type). Like the LLM, the recogniser is a
**pluggable provider** chosen by one switch.

### Choosing the recogniser (easy switching)

```js
CONFIG.speech = { provider: 'webspeech' }   // 'webspeech' (default) | 'whisper'
```

| Provider | What it is | Download | No-cloud? | Works where |
|---|---|---|---|---|
| `webspeech` *(default)* | Browser **Web Speech API** (built into `engine/speech.js`). Zero deps. | none | **No** by default — see below | Chrome/Edge; Safari (partial) |
| `whisper` | **Offline Whisper** via transformers.js + WebGPU/WASM (`engine/providers/whisper-stt.js`). | model once, from the HF CDN (browser-cached) | **Yes** — audio never leaves the device | any modern Chromium (WASM without WebGPU) |

- **One-load override:** append **`?stt=whisper`** (or `?stt=webspeech`) to the URL to force a provider without editing — same idea as `?llm=`.
- Switching needs **no engine changes**: `engine/speech.js` owns the policy (tap-to-talk, auto-submit, anti-echo, the events); a provider only does raw recognition.

### Does it run with no cloud? — the honest answer

`webspeech` is **not** guaranteed no-cloud: historically Chrome streams your audio to
Google's servers. Two ways to guarantee local, both flagged with a **`· NO-CLOUD`** tag
on the boot screen:

- **`CONFIG.speech.localOnly: true`** — the webspeech provider *requires* on-device recognition and **never** falls back to the cloud (it errors with `local-unavailable` instead). Zero download, but only works where the browser has on-device speech installed (newer Chrome; OS/language-dependent).
- **`CONFIG.speech.provider: 'whisper'`** — fully offline on any modern Chromium; the model downloads once on first mic use, then nothing leaves the device.

### `CONFIG.speech` reference

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master on/off for the whole affordance (mic button + `/listen`). |
| `provider` | `'webspeech'` | `'webspeech'` \| `'whisper'` \| any you register. |
| `lang` | `'en-US'` | BCP-47 recognition language. |
| `continuous` | `false` | `false` = **tap-to-talk** (speak one line, auto-submit, stop). `true` = **hands-free** across turns. |
| `interimResults` | `true` | Stream partial words live into the prompt (webspeech). |
| `autoSubmit` | `true` | Submit the final transcript automatically (else park it in the prompt to edit + Enter). |
| `preferLocal` | `true` | *(webspeech)* prefer on-device, fall back to cloud if unavailable. |
| `localOnly` | `false` | *(webspeech)* require on-device, **never** cloud. |
| `muteWhileSpeaking` | `true` | *(continuous)* ignore the mic while the narrator's TTS talks, so it never transcribes itself. |
| `whisper.model` | `'Xenova/whisper-base.en'` | *(whisper)* any transformers.js ASR id; a `.en` suffix = English-only. Smaller: `Xenova/whisper-tiny.en`; best: `onnx-community/whisper-large-v3-turbo`. |
| `whisper.device` | `'auto'` | `'auto'` (WebGPU if present, else WASM) \| `'webgpu'` \| `'wasm'`. |

### Tap-to-talk vs hands-free, and the anti-echo

Default **tap-to-talk** is the robust path: click the mic (or `/listen`), say one line,
and it auto-submits and stops — recognition is over before the narrator replies, so the
mic can't hear the TTS. **Hands-free** (`continuous: true`) keeps listening across turns;
there, `muteWhileSpeaking` drops any mic input while `IDNVoice.isSpeaking()` is true, so
the narrator's own voice is never transcribed back into the game. (Whisper's tap-to-talk
uses a small energy-based endpointer — it submits a phrase after a short trailing silence.)

### Control surface

```js
IDN.speech.start();                 // begin listening   (or  /listen)
IDN.speech.stop();                  // stop              (or  /listen off)
IDN.speech.toggle();
IDN.speech.supported();             // is a recogniser available here?
IDN.speech.init();                  // pre-warm: download the Whisper model now
IDN.speech.on('final', t => …);     // a finished transcript
//   events: 'final' · 'interim' · 'status' · 'error' · 'start' · 'end' · 'state'
```
Slash commands: `/listen` · `/listen off` · `/listen continuous on|off` (aliases `/mic`, `/speech`).

### Adding a provider (built-in seam) + integrating elsewhere

A provider is a tiny object — implement the contract and register it, **no engine
changes**. This is exactly how `engine/providers/whisper-stt.js` is built, and the
template for a **Vosk** (WASM, ~50 MB self-hosted model) or a **cloud-API** provider:

```js
IDNSpeech.use('mystt', {
  supported()            { return true; },        // can it run in this browser?
  start(handlers, opts)  { /* …recognise… */ },   // drive the handlers below
  stop()                 { /* cancel now */ },
  init(onProgress)       { /* optional: pre-load a model */ },
});
// handlers: { onStart, onInterim(text), onFinal(text), onEnd, onError(code), onStatus(msg) }
// opts:     { lang, continuous, interimResults, maxAlternatives, preferLocal, localOnly }
```

Load it as a classic `<script>` after `engine/speech.js`, and add the path to `SHARED`
in `build.py` so it ships in both builds. (Heavy deps must be `import()`ed *only when the
provider is selected*, like WebLLM/Whisper, to keep the other builds `file://`-safe.)

**Wiring voice input into a different front end** is one call — the module is DOM-agnostic
and event-driven; `attach()` handles the common case, or drive the events yourself:

```js
IDNSpeech.attach({
  input:  inputEl,          // interim words preview here; cleared on submit
  submit: handleSubmit,     // called with the final transcript (when autoSubmit)
  button: micButtonEl,      // optional; click toggles, gets .listening / .available
});
// …or skip attach() entirely:
IDNSpeech.on('final', text => myGame.send(text));
```

### Caveats

- **The mic needs a secure context** (`getUserMedia`): localhost/https — i.e. the **served (web) build**, not a double-clicked `file://` page. If the mic is blocked the subsystem degrades cleanly (button hidden, type as normal) and prints a one-line nudge.
- **Whisper downloads on first mic use** (tens–hundreds of MB), browser-cached after; progress shows as a self-updating terminal line. The default model id is configurable — if it ever fails to resolve at runtime, swap `CONFIG.speech.whisper.model`.

## The CRT / glitch visual layer

The amber-CRT look is a stack of cheap, self-clearing CSS/JS effects layered over
the transcript. It all lives in `IDN Terminal.html`: the `<style>` block for the
static layers, the `5. GLITCH ENGINE` section of the inline `<script>` for the
animated ones. It is **purely cosmetic** — nothing here touches the narrative.

**Static layers (CSS):** the screen gradient + curvature/vignette (`.screen::after`),
the fine **scanline grating** (`.screen::before`), a single bright **scan bar** that
sweeps down the screen (`.scanbar` + `@keyframes scanbar`), the slow brightness
`sweep`, phosphor `flicker`, and corner `burn`-in. The screen edge is a clean static
rounded rectangle (`border-radius` on `.screen-wrap`).

**Glitch effects (JS, stochastic):** a scheduler (`rollEvent` / `scheduleNext`)
fires short, additive, auto-restoring effects whose frequency and intensity scale
with `glitch.level` — horizontal `tear`, white `flash`, `chroma`tic aberration,
`skew`, per-line `jitter`, character `overlap`, and mid-typing text corruption.
Each fired effect also triggers a matched audio blip — see *Glitch SFX* under Voice.

### Driving it at runtime — `IDN.glitch` / `IDN.clock`

A story sets the mood declaratively through a node's `onEnter` (the `glitch` /
`burst` / `clock` effects in the schema above), but you can also drive it live
from the console or game code:

```js
IDN.glitch.level = 0.85;                          // 0 = calm … 1 = chaotic (may exceed 1)
IDN.glitch.burst({ level: 1.2, duration: 900 });  // one-shot spike, auto-restores
IDN.glitch.set({ tearBias: 0, chromaBias: 2 });   // weight individual effects
IDN.glitch.enabled = false;                        // master off

IDN.clock.set({ date: '01-JAN-87', time: '01:44:00' }); // freeze a retro clock
IDN.clock.clear();                                       // back to live system time
```

The voice layer also nudges `IDN.glitch.level` while speaking (`CONFIG.voice.reactive`),
so the picture tears in time with the narration.

### Tuning

- **Scan-bar speed** — the `7s` in `.scanbar { animation: scanbar … }` (smaller =
  faster). This is the line you can actually track; raise the centre alpha in its
  gradient for a stronger beam.
- **Fine-grating drift** — the `1.6s` in `.screen::before { animation: scanroll … }`
  (a subtle shimmer, not the trackable line; delete it to freeze). Keep the `96px`
  travel a multiple of the `3px` line period so the loop stays seamless.
- **Calm vs. chaotic baseline** — the initial `glitch.level` (top of the GLITCH
  STATE block) and the per-effect `*Bias` weights.
- **Type speed** — `CONFIG.typeSpeed` (characters per second).
- **Edges** — `border-radius` on `.screen-wrap`. (The old per-1.8s ragged clip-path
  edge was removed because glitch bursts made it flash; the GLITCH ENGINE section
  notes how to add a *static* jagged mask if you want one.)

## Extending (built-in seams)

- **More characters / hidden personas / scenes** — add to `characters` and
  `nodes`. `speaker` selects whose hidden persona voices a beat.
- **New appraisals** — add a `signals` entry (any enum) and reference it from a
  node; map each option to effects. The model classifies; you own the magnitudes.
- **Rules / dice / endings** — add `rules` (data) or extend `onUpdate()` (code)
  for TTRPG-style adjudication; pass `{ seed }` for reproducible dice.
- **Locations / navigation** — already supported: a transition's `to` is a graph
  pointer. Add location nodes and move between them; gate with guards.
- **Bounded freeform** — set `improv: true` on a node (or `CONFIG.engine.improv`)
  to let the model add flourishes within grounding rules (`llm.js → render()`).
- **What the LLM knows** — `stateContext()` builds the summary; per-param
  `expose`/`hidden` controls it. Counters and graph pointers stay private.
- **Richer routing** — add `confidence` to the schema in `llm.js → appraise()`
  and treat low confidence as a `fallback`; or add multi-intent.
- **Complex / hierarchical FSM** — the single `state` object + structured guards
  are built to grow toward nested or parallel states.
- **Swap / add a TTS voice** — the rack is engine-agnostic. Replace `renderSAM()`
  in `engine/voice.js` (return an `AudioBuffer`) to drop in another engine (e.g.
  eSpeak-NG WASM) without touching the effects graph; add presets to `PRESETS` and
  character voices to `PROFILES`.
- **Port to another front end (e.g. Unity/C#)** — the narrative is plain data and
  the FSM is small; only `engine/llm.js`'s transport changes. (In Unity you'd skip
  this browser voice layer and pipe the same text through your FMOD/Wwise voice bus.)

## Shipping it: the two builds

`python3 build.py` (see *Two builds*) writes both deployables to `dist/`. Whether a
server is needed depends on the LLM provider:

- **Folder build (`dist/folder/`, `provider='ollama'`) — no web server.** Open
  `IDN Terminal.html` straight off disk (`file://`): every script is a classic
  `<script>`, SAM is pure JS, audio is Web Audio, and **nothing fetches a local
  asset at runtime**. Double-click and it runs. Two *optional* external pieces,
  neither a host for the page: **Ollama** (a local service on `localhost:11434`,
  started with `OLLAMA_ORIGINS='*'`; without it the offline fallback still plays)
  and **Google Fonts** (a `<link>`; offline it falls back to system monospace).
- **Web build (`dist/web/`, `provider='webllm'`) — needs http hosting.** Inference
  runs in-browser (no inference server), but module workers + WebGPU won't load
  from `file://`, so serve it statically (`python3 serve.py`, or any static host)
  in a WebGPU browser. Model weights download once from a CDN and are cached.

### Single-file `.html` (optional — folder build only)

The **folder** build can be collapsed into one portable `.html` if you want — it's
just **inlining** (nothing is fetched at runtime): paste the engine scripts into
inline `<script>` tags in load order (`llm → providers/ollama → samjs → story →
engine → voice`), and optionally base64-embed the two fonts as `@font-face` (else
keep the `<link>` and accept the system-font fallback). The **web** build can't be
a single self-contained file — WebLLM is loaded from a CDN and streams the model
weights at runtime. `build.py` packages the two *variants* today; a `--single`
inlining pass for the folder build is an easy add later.
