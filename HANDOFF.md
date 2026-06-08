# HANDOFF — IDN Terminal

Status snapshot for the next session (human or AI). Pairs with **`CLAUDE.md`** (fast
orientation + conventions) and **`README.md`** (deep dive). Read those for *how it
works*; this file is *where things stand* and *what's next*.

## Where it stands (works today)

- **Runs fully browser-side via WebLLM** (no server, no Ollama) — confirmed working in
  **Chrome** on 2026-06-01. The whole stack (FSM engine + LLM routing/re-voicing + SAM
  voice + Web-Audio rack + CRT glitch + presentation index) runs in the page.
- **Three LLM modes, one switch** (`CONFIG.llm.provider`, default `webllm`):
  - `webllm` — in-browser model via WebGPU (`engine/providers/webllm.js`).
  - `ollama` — local Ollama over HTTP (`engine/providers/ollama.js`); works from `file://`.
  - …else the engine **falls back to keyword routing + authored beats** so it always plays.
  - **`?llm=ollama` / `?llm=webllm` URL override** forces a provider for one load (no edit).
- **Two ship builds** via `python3 build.py` → `dist/folder` (Ollama, `file://`) and
  `dist/web` (WebLLM, http; includes a robust `serve.py`).
- **Model-resilient narrative**: progressing fallbacks + word-overlap offline router mean
  the story advances even with a weak/absent model (a bare name no longer dead-ends).
- **Two stories**: `story.js` (SIGNAL) live; `stories/clod-bathos.story.js` ready to swap.
- **Voice input / speech-to-text (NEW this session)** — the player can **speak**; the
  transcript enters the prompt like typed text (same FSM + LLM path, no separate voice path).
  Pluggable like the LLM via `CONFIG.speech.provider`: **`webspeech`** (browser Web Speech API,
  default) and a fully-**offline `whisper`** provider (transformers.js, WebGPU/WASM — no cloud).
  Mic button + `/listen`; tap-to-talk by default, opt-in hands-free; `?stt=` overrides per load.
  *Status:* code complete + headless-tested; the **mic + model download need a manual browser
  run** — see *Voice input* below.

## How to run (canonical)

- **WebLLM (browser-side):** `python3 serve.py` → open the printed
  `http://localhost:PORT/IDN%20Terminal.html` in **Chrome/Edge**. First load downloads the
  model. `serve.py` is robust now: serves its own folder from any cwd, auto-picks a free
  port, sends no-cache headers.
- **Ollama (reliable, no WebGPU):** `OLLAMA_ORIGINS='*' ollama serve`, then open the page
  with **`?llm=ollama`** (works over http or `file://`).

## Known issues / hard-won facts (don't rediscover these)

1. **WebLLM needs Chrome/Edge — Firefox fails.** Firefox's WebGPU trips
   `Cannot initialize runtime because of requested maxStorageBuffersPerShaderStage exceeds
   limit. requested=10, limit=8`. Chrome/Edge expose the higher limit. (If even Chrome hits
   limit=8, that GPU can't run the model → use Ollama.)
2. **The default model (`Qwen2.5-0.5B-Instruct-q4f16_1-MLC`) is WEAK.** Observed live: it
   **misroutes** (read "I'm Matt" as a threat → ran to the purge ending) and **over-invents**
   in re-voicing. This is the #1 lever for delivery quality — see *Packaging* step 1.
3. **WebLLM can't run from `file://`** (module worker + WebGPU need http). `serve.py` handles it.
4. **First WebLLM load downloads the model** (hundreds of MB+), cached by the browser after.
   It streams from a CDN (`esm.run` → jsDelivr); the weights are NOT in the repo and can't be.
5. **SAM TTS license** (`engine/vendor/samjs.js`) is reverse-engineered/murky — fine for
   personal use, risky to redistribute. Isolated behind `renderSAM()` for easy swap.
6. **`dist/` is generated** by `build.py` — never hand-edit it.
7. **Web Speech API ≠ no-cloud.** Chrome streams the mic audio to Google by default;
   `CONFIG.speech.localOnly:true` (on-device webspeech) or `provider:'whisper'` (offline) are
   the no-cloud paths. Both tag the boot screen `· NO-CLOUD`.
8. **The mic needs a secure context.** `getUserMedia` only works over localhost/https — the
   **web build**, not a double-clicked `file://`. So voice input pairs with `serve.py`, and the
   offline-Whisper path is a web-build feature.

## Voice input (speech-to-text) — switching, status & next steps

Full docs: **README → *Voice input*** and **CLAUDE.md → *Voice input / STT***. Quick map:

**Switch approaches** (one line in `CONFIG.speech`, or a URL param — no engine changes):

| Want | Set |
|---|---|
| Browser Web Speech (fast; may use the cloud) | `provider:'webspeech'` *(default)* |
| Web Speech but **guaranteed no-cloud** | `provider:'webspeech', localOnly:true` |
| **Fully offline** Whisper (no cloud, any Chromium) | `provider:'whisper'` |
| Force a provider for one load (no edit) | `?stt=whisper` / `?stt=webspeech` |
| Pick the offline model | `CONFIG.speech.whisper.model` |
| Hands-free instead of tap-to-talk | `continuous:true` (or `/listen continuous on`) |

**Verified (headless, no browser):** module + provider logic parses; subsystem events,
`attach()`, auto-submit, anti-echo gate; webspeech on-device→cloud fallback *and* the
`localOnly` no-cloud lock; Whisper provider registration + English-only model detection;
`build.py` ships `engine/speech.js` + `engine/providers/whisper-stt.js` into both builds.

**Needs a manual browser run** (the documented audio/WebGPU boundary — verify like WebLLM):
- Mic capture + permission prompt — `python3 serve.py`, Chrome/Edge (a `file://` page can't open the mic).
- Whisper first-run model **download** + transcription quality on real audio.
- Confirm the default model id `Xenova/whisper-base.en` resolves; if not, swap it (`…/whisper-tiny.en` or `onnx-community/whisper-large-v3-turbo`).

**Optional next steps:**
- [ ] Confirm/choose the Whisper model id + measure first-load size (mirrors the WebLLM model-choice TODO).
- [ ] Pre-warm: call `IDN.speech.init()` from the loading screen so the Whisper model downloads
      during boot instead of on first mic click (today it's lazy on first use — deliberately, so
      non-speakers never pay for it).
- [ ] Add a **Vosk** provider (smaller model, but you self-host the model file) via the same
      `IDNSpeech.use()` contract — see README → *Adding a provider*.
- [ ] Pin the transformers.js version in `whisper-stt.js` (currently `esm.run` = latest), mirroring
      the WebLLM pin TODO above.

## EVENTUAL OBJECTIVE: easy delivery / browser-side packaging

Good news: **browser-side delivery already works** (the WebLLM web build runs entirely in
the page). What remains is *hosting + polish + model choice*, not core capability. Options,
best-for-easy-setup first:

### A. Hosted WebLLM static site — RECOMMENDED for "no install, click a link"
Deploy `dist/web/` to any static host; the end user just opens a URL in Chrome/Edge, the
model downloads once, and they play — zero install.
- **Steps:** `python3 build.py web` → push `dist/web/` to GitHub Pages / Netlify / itch.io
  (all serve static files; no special headers needed for the WebGPU path).
- **Caveats to handle:** WebGPU browser required (add a clean "use Chrome/Edge" landing gate);
  first-load download size (pick the model deliberately — step 1); show download progress
  (already on the loading screen).

### B. Folder + Ollama — for users who want a local model / offline
Ship `dist/folder/` (or a single file, option C). End user installs Ollama + runs it. More
setup, but no download-per-play and works offline once pulled.

### C. Single self-contained `.html` (Ollama/offline path only)
Inline the engine scripts into one file (`build.py --single`, NOT YET BUILT — easy add).
Great for the folder/Ollama path. **Not possible for WebLLM** (weights/CDN are external).

### D. Desktop app (Electron/Tauri) — "double-click to run"
Wrap the web build as a desktop app; could bundle a runtime. Heaviest; future option.

### Concrete next steps (a checklist to execute)
- [ ] **Pick the shipped model** (biggest quality win). Try `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`
      or `Llama-3.2-1B-Instruct-q4f16_1-MLC` (sharper routing/prose, larger download) vs the
      0.5B default; set in `CONFIG.webllm.model`. Measure download size + routing quality.
- [ ] **Pin the WebLLM version** (currently `esm.run` = latest) for reproducibility, e.g.
      `https://esm.run/@mlc-ai/web-llm@<ver>` in `engine/providers/webllm.js`.
- [ ] **Add a WebGPU/browser landing gate** (friendly "open in Chrome/Edge" page when WebGPU
      is absent) — partial today via the in-terminal OFFLINE warning; make it a first-screen check.
- [ ] **Tighten weak-model behavior**: lower `CONFIG.engine.renderTemperature`, keep
      `improv:false`, consider trimming transitions/sharpening `intent`+`examples` so a small
      model routes better; the progressing fallbacks already prevent dead-ends.
- [ ] **Pick a host + test the deployed flow** end-to-end in Chrome (and a fresh profile, to
      see the real first-load download UX).
- [ ] (optional) Implement `build.py --single` for the one-file Ollama/offline artifact.
- [ ] (optional) Electron/Tauri wrapper for a desktop double-click.

## Map / pointers
- `CLAUDE.md` — orientation, architecture, conventions, no-Node testing trick.
- `README.md` — full story schema, voice, presentation, builds, troubleshooting.
- `engine/` — `llm.js` (dispatcher) + `providers/` + `engine.js` (FSM) + `voice.js` (TTS out)
  + `speech.js` (STT in) + `providers/whisper-stt.js` (offline STT).
- `stories/` — alternate stories (swap over `story.js`).
- `build.py` / `serve.py` — packaging + local serving.
- Memory: `~/.claude/projects/<this>/memory/` — cross-session notes (incl. the WebLLM-Chrome
  fact and the no-Node osascript testing technique).
