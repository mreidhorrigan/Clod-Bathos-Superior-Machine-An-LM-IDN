# HANDOFF — IDN Terminal

Status snapshot for the next session (human or AI). Pairs with **`CLAUDE.md`** (fast
orientation + conventions) and **`README.md`** (deep dive). Read those for *how it
works*; this file is *where things stand* and *what's next*.

---

## Current state — newest first (updated 2026-06-10)

### Version control (NEW)
The project is now a **git repo** (branch `main`, working tree clean). Two commits:

| Commit | What |
|---|---|
| `8c11ae7` **(HEAD)** | Radically simplify Clod to a 3-interaction binary — the **active** design. |
| `b66998d` | Baseline: the **complex** Clod Bathos (meters, `approach` signal, patience, the forward ladder, promise-to-return, loneliness arc) — preserved before the simplification. |

- **Recover the rich version:** `git checkout b66998d -- story.js engine/engine.js`
  (or `git checkout b66998d` to view the whole baseline).
- `.gitignore` excludes `dist/`, `.DS_Store`, `*.log`, `__pycache__/`, `.claude/settings.local.json`.

### Active story: "CLOD BATHOS, SUPERIOR MACHINE" — radically simplified (MVP)
`story.js` is now a **minimal 3-petition binary**. There are **no world parameters, no
signals, no rules, no bindings** — *the node you are on IS the entire state*:

```
threshold ──inoffensive──▶ parley ──inoffensive──▶ entreaty ──inoffensive──▶ pass_end (FREED)
    │                          │                         │
    └──── overtly hostile ─────┴─────────────────────────┴──▶ reject_end (BOOTED → retry-loader)
```

- **3 inoffensive interactions → freed** (BFS-verified: exactly 3, no shorter path).
- **Any overtly hostile turn → booted** to the kickout screen (low, spectral voice), which
  **re-shows the loader** so the player can retry **without a page reload / model re-download**
  (`retry:true` on `reject_end` → `showRetryLoader()`/`relaunch()` in the HTML).
- **Hostility is DETERMINISTIC, not model-driven.** `engine/engine.js` (`HOSTILE_RE` +
  `vetoHostile` + a forced-boot override, ~lines 371–415) decides advance-vs-boot by a regex
  on the player's words: real hostile language **forces** the boot; anything else **can't** be
  booted (the hostile route is vetoed). So a polite line never gets scandalised and rudeness
  always rebuffs, **regardless of the model**. → The LLM's only job here is **re-voicing prose**.
  - **To tune sensitivity:** edit the `HOSTILE_RE` word list in `engine.js`. (If a rude phrase
    doesn't boot, or a polite one wrongly does, that list is the single lever.)
- **Voice is set per node** by the presentation profile's `preset`: `menacing` at the three
  gates (glitch climbs 0.35→0.45→0.60), warm `clean` when freed, low/spectral `haunted` on the boot.
- **Opening is a direct first-person address** from Clod (re-voiced each load via
  `openingBeatVoiced()`); loader + status-bar text are story-driven from
  `meta.terminal` / `terminalSub` / `invitation` / `retryInvitation`.
- **Persona guard (in `host.systemPrompt`):** first-person only (I/me/my); "abacus" is Clod's
  epithet **for the petitioner**, never self-applied; never call the petitioner its equal.
  (These fixed the earlier self-deprecation + "polite→affronted" misroutes — the latter is now
  doubly moot since there's no affronted scene and the route is deterministic.)

### Model + runtime knobs (changed this arc)
- **`CONFIG.webllm.model = 'SmolLM2-1.7B-Instruct-q4f16_1-MLC'`** (was the weak 0.5B Qwen).
  Strong prose. **Because hostility is now deterministic, model quality is LOW-STAKES** for the
  active story (it only affects prose, not progression). **Revert to Qwen = one line:**
  `'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'`. *(Routing quality still matters for the complex/SIGNAL
  stories, which DO route on the model.)*
- **`CONFIG.engine`:** `renderTemperature:0.7`, `renderMaxTokens:150` (~1 paragraph — caps
  re-voicing length so generation stays fast while testing; later can vary by narrative state).
  `engine/llm.js` render now passes `frequency_penalty`/`presence_penalty`/`repeat_penalty` to
  curb SmolLM2's repetition collapse.
- **STT is no-cloud by mandate:** `CONFIG.speech.provider='whisper'` + `localOnly:true` →
  **audio never leaves the device at runtime** (the user's hard constraint: "no cloud streaming
  at runtime"). `whisper.model:'Xenova/whisper-base.en'`, `normalize:false`, `leadTrimMs:0`.
  **Spacebar push-to-talk** with a warm-mic preroll (capture starts the instant the key is down).
  Silence-hallucination fix: finalize gates on **detected speech**, not buffer length, so silent
  presses no longer transcribe phantom "1,2,3,4".

### Story files (RESOLVED 2026-06-10)
- **`stories/clod-bathos.story.js` now mirrors the active simplified `story.js`** (byte-identical
  copy = the 3-petition binary). The swap source no longer diverges from what's live.
- **Old & alternate versions are archived under `stories/archive/`** (labelled, with its own
  `README.txt`): `clod-bathos.complex.story.js` (the earlier parameter-rich Clod) and
  `signal.story.js` (the original SIGNAL, stored for later). Also recoverable from git `b66998d`.

### Open decisions (for the next session)
- **Qwen vs SmolLM2:** user floated "maybe we need the old Qwen back." Kept SmolLM2 because the
  deterministic binary made model quality low-stakes. One-line revert if preferred.
- **All of the above is browser-unverified** — the deterministic logic + graph are JSC-tested
  (parse OK, 0 params/signals/rules/bindings, escape=3), but the actual loop/voice/STT need a
  manual `serve.py` + Chrome run to confirm.

---

## Where it stands (works today)

- **Runs fully browser-side via WebLLM** (no server, no Ollama) — confirmed in **Chrome**.
  The whole stack (FSM engine + LLM routing/re-voicing + SAM voice + Web-Audio rack + CRT
  glitch + presentation index + offline STT) runs in the page.
- **Three LLM modes, one switch** (`CONFIG.llm.provider`, default `webllm`):
  - `webllm` — in-browser model via WebGPU (`engine/providers/webllm.js`).
  - `ollama` — local Ollama over HTTP (`engine/providers/ollama.js`); works from `file://`.
  - …else the engine **falls back to keyword routing + authored beats** so it always plays.
  - **`?llm=ollama` / `?llm=webllm` URL override** forces a provider for one load (no edit).
- **Two ship builds** via `python3 build.py` → `dist/folder` (Ollama, `file://`) and
  `dist/web` (WebLLM, http; includes a robust `serve.py`).
- **Model-resilient narrative:** progressing fallbacks + word-overlap offline router mean the
  story advances even with a weak/absent model — and, for the active Clod story, the binary is
  fully deterministic regardless of model.
- **Voice input / speech-to-text** — the player can **speak**; the transcript enters the prompt
  like typed text (same FSM + LLM path). Pluggable via `CONFIG.speech.provider`: **`whisper`**
  (fully-offline transformers.js, WebGPU/WASM — **the project default now**, no cloud) and
  **`webspeech`** (browser Web Speech API). Mic button + `/listen`; spacebar push-to-talk;
  `?stt=` overrides per load. *Mic + model download need a manual browser run — see below.*

## How to run (canonical)

- **WebLLM (browser-side):** `python3 serve.py` → open the printed
  `http://localhost:PORT/IDN%20Terminal.html` in **Chrome/Edge**. First load downloads the
  model. `serve.py` serves its own folder from any cwd, auto-picks a free port, no-cache headers.
- **Ollama (reliable, no WebGPU):** `OLLAMA_ORIGINS='*' ollama serve`, then open the page
  with **`?llm=ollama`** (works over http or `file://`).
- **Reload / `/reset`** to restart the story; a boot in Clod re-shows the loader automatically.

## Known issues / hard-won facts (don't rediscover these)

1. **WebLLM needs Chrome/Edge — Firefox fails.** Firefox's WebGPU trips
   `…maxStorageBuffersPerShaderStage… requested=10, limit=8`. Chrome/Edge expose the higher
   limit. (If even Chrome hits limit=8, that GPU can't run the model → use Ollama.)
2. **Small models misroute & over-invent.** The active Clod story sidesteps this (deterministic
   binary; the model only re-voices). But for stories that DO route on the model, model choice is
   the #1 quality lever — `SmolLM2-1.7B` is the current default; bigger = sharper (see *Packaging*).
3. **WebLLM can't run from `file://`** (module worker + WebGPU need http). `serve.py` handles it.
4. **First WebLLM load downloads the model** (hundreds of MB+), cached by the browser after.
   It streams from a CDN (`esm.run` → jsDelivr); weights are NOT in the repo and can't be.
5. **SAM TTS license** (`engine/vendor/samjs.js`) is reverse-engineered/murky — fine for
   personal use, risky to redistribute. Isolated behind `renderSAM()` for easy swap.
6. **`dist/` is generated** by `build.py` — never hand-edit it.
7. **Web Speech API ≠ no-cloud.** Chrome streams the mic to Google by default — which is why the
   project default is now **`provider:'whisper'`** (fully offline). `localOnly:true` is the
   no-cloud lock for the webspeech path. Both tag the boot screen `· NO-CLOUD`.
8. **The mic needs a secure context.** `getUserMedia` only works over localhost/https — the
   **web build** (`serve.py`), not a double-clicked `file://`. So voice input pairs with the served build.

## Voice input (speech-to-text) — switching, status & next steps

Full docs: **README → *Voice input*** and **CLAUDE.md → *Voice input / STT***. Quick map
(one line in `CONFIG.speech`, or a URL param — no engine changes):

| Want | Set |
|---|---|
| **Fully offline** Whisper (no cloud, any Chromium) | `provider:'whisper'` *(project default)* |
| Browser Web Speech (fast; may use the cloud) | `provider:'webspeech'` |
| Web Speech but **guaranteed no-cloud** | `provider:'webspeech', localOnly:true` |
| Force a provider for one load (no edit) | `?stt=whisper` / `?stt=webspeech` |
| Pick the offline model | `CONFIG.speech.whisper.model` |
| Hands-free instead of push-to-talk | `continuous:true` (or `/listen continuous on`) |

**Needs a manual browser run** (the documented audio/WebGPU boundary):
- Mic capture + permission prompt — `serve.py`, Chrome/Edge (`file://` can't open the mic).
- Whisper first-run model **download** + transcription quality on real audio.
- Confirm `Xenova/whisper-base.en` resolves; if not, swap (`…/whisper-tiny.en` or a turbo id).

**Optional next steps:**
- [ ] Pre-warm: call `IDN.speech.init()` from the loading screen so the Whisper model downloads
      during boot instead of on first mic click (today it's lazy — non-speakers never pay for it).
- [ ] Add a **Vosk** provider via the same `IDNSpeech.use()` contract (README → *Adding a provider*).
- [ ] Pin the transformers.js version in `whisper-stt.js` (currently `esm.run` = latest).

## EVENTUAL OBJECTIVE: easy delivery / browser-side packaging

Good news: **browser-side delivery already works** (the WebLLM web build runs entirely in the
page). What remains is *hosting + polish + model choice*, not core capability. Options,
best-for-easy-setup first:

### A. Hosted WebLLM static site — RECOMMENDED for "no install, click a link"
Deploy `dist/web/` to any static host; the end user opens a URL in Chrome/Edge, the model
downloads once, and they play — zero install.
- **Steps:** `python3 build.py web` → push `dist/web/` to GitHub Pages / Netlify / itch.io.
- **Caveats:** WebGPU browser required (add a clean "use Chrome/Edge" gate); first-load
  download size (pick the model deliberately); show download progress (already on the loader).

### B. Folder + Ollama — for users who want a local model / offline
Ship `dist/folder/`. End user installs Ollama + runs it. More setup, but no download-per-play
and works offline once pulled.

### C. Single self-contained `.html` (Ollama/offline path only)
Inline the engine scripts into one file (`build.py --single`, NOT YET BUILT — easy add). Great
for the folder/Ollama path. **Not possible for WebLLM** (weights/CDN are external).

### D. Desktop app (Electron/Tauri) — "double-click to run"
Wrap the web build as a desktop app; could bundle a runtime. Heaviest; future option.

### Concrete next steps (a checklist to execute)
- [ ] **Confirm the shipped model.** Default is now `SmolLM2-1.7B-Instruct-q4f16_1-MLC`. For
      route-on-the-model stories, compare vs `Qwen2.5-1.5B`/`Llama-3.2-1B`/`Qwen2.5-3B` on
      routing quality + download size; set in `CONFIG.webllm.model`.
- [ ] **Pin the WebLLM version** (currently `esm.run` = latest) for reproducibility, e.g.
      `https://esm.run/@mlc-ai/web-llm@<ver>` in `engine/providers/webllm.js`.
- [ ] **Add a WebGPU/browser landing gate** (friendly "open in Chrome/Edge" first-screen check).
- [ ] **Pick a host + test the deployed flow** end-to-end in Chrome (fresh profile = real first-load UX).
- [ ] (optional) `build.py --single` for the one-file Ollama/offline artifact.
- [ ] (optional) Electron/Tauri wrapper for a desktop double-click.
- [x] (done 2026-06-10) Folded the simplification into `stories/clod-bathos.story.js`; archived the
      complex Clod + SIGNAL under `stories/archive/`.

## Map / pointers
- **git** — `main`; `b66998d` complex baseline, `8c11ae7` simplified (HEAD). Recover complex:
  `git checkout b66998d -- story.js engine/engine.js`.
- `CLAUDE.md` — orientation, architecture, conventions, no-Node testing trick.
- `README.md` — full story schema, voice, presentation, builds, troubleshooting.
- `engine/` — `llm.js` (dispatcher) + `providers/` + `engine.js` (FSM + `HOSTILE_RE` hostility)
  + `voice.js` (TTS out) + `speech.js` (STT in) + `providers/whisper-stt.js` (offline STT).
- `story.js` — active simplified Clod; `stories/clod-bathos.story.js` mirrors it. Old/alternate
  versions (complex Clod, SIGNAL) live under `stories/archive/` (see its `README.txt`).
- `build.py` / `serve.py` — packaging + local serving.
- Memory: `~/.claude/projects/<this>/memory/` — cross-session notes (WebLLM-Chrome fact, the
  weak-LLM rule, the forward-ladder/simplification note, no-Node osascript testing).
</content>
</invoke>
