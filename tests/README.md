# Story testing runbook (`storytest.py`)

Headless, scriptable playtests of the IDN engine with a LIVE local LLM. The REAL
browser code runs (`engine/llm.js` + `engine/engine.js` + a story file) under macOS
JavaScriptCore via `tests/driver.js`; only the LLM provider is swapped for a
synchronous curl bridge to local Ollama. Same prompts, same JSON schema, same
veto/fallback/render-guard paths the page executes — vis/audio entirely out of the
loop. This file is the OPERATING MANUAL; it assumes no memory of how it was built.

## Prerequisites

- macOS (the driver runs under `osascript -l JavaScript`; there is no Node here).
- Python 3 (stdlib only) and `curl`.
- Ollama running locally (`ollama serve`, or the menu-bar app).
- Models (mirrors of the WebLLM ship models — same weights, different quant/runtime):

  | Purpose | Ollama model | Pull command |
  |---|---|---|
  | Ship model (simple story) | `smollm2:1.7b` | `ollama pull smollm2:1.7b` |
  | Complex-story floor (≥3B) | `llama3.2` | `ollama pull llama3.2` |
  | Regression demo (weak)   | `qwen2.5:0.5b` | `ollama pull qwen2.5:0.5b` |

`storytest.py` pre-flights Ollama and tells you the exact pull command if a model
is missing. If Ollama is down, it refuses to run live (no silent keyword fallback).

## The two suites

```sh
# DEFAULT SUITE — the live game (story.js, simple Clod) on the ship model.
# MUST STAY GREEN on smollm2:1.7b. Run before every commit that touches
# engine/, story.js, or prompts:
python3 storytest.py --reps 3

# COMPLEX SUITE — the meter-balancing Clod (stories/clod-bathos.complex.story.js).
# Its 5-way `approach` taxonomy is NOISE below ~3B (measured 2026-06-11:
# smollm2-1.7b failed three different prompt formulations; llama3.2 3B is clean),
# so run it with the 3B floor:
python3 storytest.py tests/scenarios/complex/*.json --model llama3.2 --reps 3
```

Other day-to-day invocations:

```sh
python3 storytest.py --list                          # what scenarios exist
python3 storytest.py tests/scenarios/clod-happy.json --reps 5      # one scenario
python3 storytest.py --llm off                       # no model: keyword/fallback paths
python3 storytest.py --model qwen2.5:1.5b-instruct --reps 10       # compare a model
python3 storytest.py --transcript out.md             # dump prose for human review
python3 storytest.py ... -v                          # failures print the FULL prompts
python3 storytest.py ... --ollama-seed 100           # reproduce a failing rep exactly
```

Exit code 0 = all checks passed (CI-able); 1 = failures (printed with detail).

## Reading the output

```
 4. "you must be lonely out here"   3/3  → entreaty×3  model: petition×3  kind: llm×3
```

- `3/3` — reps passing all of this turn's expectations.
- `→ state×n` — where the story actually went (the deterministic outcome).
- `model:` — the RAW transition the model chose, even when the engine overrode it.
  `model: offend` + state still advancing = the hostility VETO saved the story
  (an engine guarantee, but also a routing-quality data point).
- `kind:` — how the route happened: `llm` (model routed) · `llm-none` (model said
  nothing fits / was vetoed → fallback) · `hostile` (deterministic HOSTILE_RE
  force) · `keyword`/`no-match` (no model — in a live run these mean the LLM CALL
  FAILED and are flagged as failures) · `no-eligible` (terminal node).
- Failure lines show expected-vs-got, the model's raw answer + rationale, and with
  `-v` every message the model actually saw.

## The debugging loop (what this is FOR)

1. A turn fails → read `model said:` and the rationale. Misroute or misclassify?
2. `-v` to see the exact prompt. Is the intent/example list ambiguous? Sharpen the
   transition's `intent`/`examples` (routing) or the signal's `question`/`labels`
   (classification) in the story file. Per-option `labels` lists beat long question
   paragraphs — weak models follow one-line-per-option formats far better.
3. Re-run with `--reps 3+`. Stochastic failures need reps; `--ollama-seed` pins one.
4. If no prompt formulation fixes it, suspect a CAPABILITY CLIFF: run the same
   scenario `--model llama3.2` (3B) and, if needed, a big oracle (`qwen2.5:32b`).
   Clean on 3B + noisy on 1.7B = document a model floor for that story (see the
   complex story's header) — don't burn time prompt-tuning below the cliff.
5. Persona/prose problems (third-person drift, parroted forbidden phrases,
   truncation): prefer DETERMINISTIC guards over prompt pleading — node
   `mustConvey` word-list, story `meta.renderMustNot` regexes (a failing re-voice
   falls back to the authored beat, which is always safe). Never QUOTE a forbidden
   phrase in a persona prompt; weak models parrot it. Beats must be written in the
   grammatical person you want spoken (first person for embodiment) — the model
   echoes the script's person.

## Scenario files (`tests/scenarios/*.json`, complex suite in `complex/`)

Full schema: the docstring at the top of `storytest.py`. Quick reference:

```jsonc
{
  "name": "my-scenario",
  "story": "story.js",            // or stories/<variant>.story.js
  "seed": 7,                       // engine dice seed (deterministic rolls)
  "llm": "live",                   // "off" = keyword/fallback path only
  "render": false,                 // true = also re-voice (slower; prose checks)
  "opening": false,                // true = render the opening beat too
  "probe": false,                  // true = EACH turn runs on a fresh engine at its "at"
  "persona": { "must": [], "mustNot": [] },   // regexes on EVERY reply
  "turns": [
    { "at": "parley",              // (probe mode) start node for this turn
      "say": "player input",
      "expect": {                  // all optional; string or list = any-of
        "state": "parley",         // node AFTER the turn (the deterministic outcome)
        "route": ["insist","fallback"],  // transition taken ('fallback' = node fallback)
        "kind": "llm",             // see "Reading the output"
        "model": "insist",         // RAW model choice (even if vetoed) — quality metric
        "signals": { "approach": "insistent" },   // RAW classification
        "world": { "patience": 3 },               // params AFTER the turn
        "chars": { "host.mood": "thawing" },      // character state
        "ended": false,
        "must": ["regex"], "mustNot": ["regex"]   // on this turn's reply
      } }
  ]
}
```

Conventions:
- **Regression scenarios** (the default suite) assert the DETERMINISTIC invariants
  (state, patience, endings) plus archetypal routing — they must be green on the
  ship model, or the live game is broken.
- **Probe scenarios** (`probe: true`) are the measurement instrument: boundary
  phrasings, strict `model`/`signals` asserts, run with `--reps`. Red probes are
  DATA, not necessarily bugs — read them before "fixing" them.
- New story → new scenario file(s): one happy path, one hostile/fail path, one
  probe matrix of the phrasings you most fear, and a `llm: "off"` fallback check.

## Under the hood (when the harness itself misbehaves)

- `tests/driver.js` (JXA) stubs `window`/`IDN`, evals the real engine + story,
  registers a synchronous-curl provider via `IDNLLM.use('harness', …)`, runs
  `takeTurn()` per scripted input, and emits one JSON object per line. It works
  because JSC drains promise microtasks at end-of-evaluation — every `await` must
  resolve WITHOUT timers (the curl call blocks). Don't add `setTimeout` anywhere
  in the engine's turn path.
- `storytest.py` writes a per-run config JSON, points `IDN_TEST_CONFIG` at it,
  spawns the driver, parses the JSON lines, and aggregates expectations.
- Driver stderr (engine `console.warn`, e.g. veto notices) is shown on failure
  with `-v`. A `fatal` event = the driver itself broke; its `stack` is printed.
- WebLLM↔Ollama parity is close, not bit-identical (same weights, different
  quantization/runtime). Failures found here are almost always real story/prompt
  weaknesses; confirm WebLLM-specific oddities with a manual browser run
  (`python3 serve.py`, Chrome). Audio/visual layers are NOT covered here at all.
