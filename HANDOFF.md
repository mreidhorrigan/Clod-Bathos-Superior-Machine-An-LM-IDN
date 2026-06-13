# HANDOFF — IDN Terminal

Status snapshot for the next session (human or AI). Pairs with **`CLAUDE.md`** (fast
orientation + conventions) and **`README.md`** (deep dive). Read those for *how it
works*; this file is *where things stand* and *what's next*.

---

## Current state — newest first (updated 2026-06-13)

### Colour palette consolidated + harmonized with the bio site (NEWEST, 2026-06-13)
- **`CLOD PALETTE`**: one labelled `:root` block at the top of the HTML `<style>` is now the
  single place to retune colour — no hard-coded hexes elsewhere (backgrounds, amber glows, the
  release screen all reference vars). Easy to adjust in future, as requested.
- **Two brand anchors shared with matthorrigan.com**: `--brand-orange #f28b46` and
  `--brand-blue #c3f0ff` (lifted from the bio site's `--secondcolor`/`--favcolor`).
- **Amber CRT harmonized toward the orange**: primary `--amber` shifted `#ffb000 → #ff9d42`
  (a luminous sibling of the brand orange); ramp `--amber-bright/-dim/-faint` retuned to match;
  ambient screen-corner glows now use the literal `--brand-orange`. Contrast verified
  (main text AAA, secondary AA).
- **Success/release screen rebuilt on the blue**: warm-cream → bright `--brand-blue` sky
  (`--release-sky-0..2`) with deep-blue title/sub (`--release-ink/-ink-2`) and the
  blue text-glow; the green grass field kept as a faint accent (`--release-field-rgb`, set
  alpha 0 to drop). Title/sub contrast AA / AA-large.
- Built clean into `dist/web`; **redeployed to Pages**. Browser eyeball still worthwhile
  (colour is the one thing the harness can't check), but values + WCAG contrast are verified.

### Voice warmth trajectory + complex story tested & promoted (2026-06-11)
- **VOICE TRAJECTORY** (`engine/voice.js`): one warmth axis through the presets —
  **-1 haunted · -0.4 menacing · +0.2 thaw (new) · +1 warm (new)** — `setWarmth(t)`
  interpolates every rack number between anchors (JSC-verified). Drive it via profile
  `warmth:` or a `voice.warmth` binding; `/voice warmth -1..1` to audition live.
  - **Simple story (LIVE game)**: gates now climb it — `-0.5 → -0.25 → +0.25` (somewhat
    menacing start, audibly thawing), `+1` on release, `-1` (full haunted) on the boot.
  - **Complex story**: `char.host.mood → voice.warmth` binding — how you treat Clod is
    how Clod sounds (affronted → haunted, fond → warm). NEEDS A BROWSER LISTEN.
- **Complex Clod TESTED + PROMOTED** to `stories/clod-bathos.complex.story.js` (archive
  original untouched): gains `hostile:true` flags (deterministic force/veto, incl. a NEW
  engine veto for hostile-flagged SIGNAL options — misclassified polite lines can't drain
  patience), mood-driven voice, release/retry endings, first-person beats, per-option
  signal `labels` (new `llm.js` prompt format). **Suite: 36/36 ×3 reps GREEN on
  llama3.2 (3B).**
- **MODEL FLOOR (measured)**: the 5-way `approach` taxonomy (flattery/friendly/insistent/
  hostile/other) is NOISE on SmolLM2-1.7B — three prompt formulations, three different
  confidently-wrong labelings — and CLEAN on llama3.2-3B. The complex story requires
  ≥3B (WebLLM: `Llama-3.2-3B-Instruct` / `Qwen2.5-3B`); the simple story stays the
  1.7B-shippable one. Don't prompt-tune below a capability cliff — switch models to test.
- **Embodiment principle (role-play vs describe)**: the model echoes the BEAT's
  grammatical person, so beats must be written FIRST PERSON (Clod's own words);
  second-person beats collide with "'you' = the player" in the render prompt.
  `llm.js render()` now instructs PERFORM-don't-narrate; the complex beats were
  rewritten first-person; `renderMustNot` backstops both stories.
- **Testing runbook: `tests/README.md`** — suites, commands, output reading, the
  debugging loop, scenario conventions; written for future operators (human or LLM).
  Suites layout: `tests/scenarios/*.json` = DEFAULT (green on smollm2:1.7b);
  `tests/scenarios/complex/*.json` = complex suite (`--model llama3.2`).

### PUBLISHED — the game is LIVE on GitHub Pages (2026-06-10 night)
- **Play URL: https://mreidhorrigan.github.io/Clod-Bathos-Superior-Machine-An-LM-IDN/** —
  repo is PUBLIC, Pages serves the `gh-pages` branch (the built `dist/web`, provider
  `webllm`). Verified live: page + all engine files 200. Needs Chrome/Edge (WebGPU);
  first visit streams the model (~1 GB, loader shows progress, browser-cached after).
- **Redeploy after any change: `python3 deploy_pages.py`** (rebuilds `dist/web`, force-
  pushes `gh-pages`). Pushing `main` does NOT redeploy the game (no Actions yet — the
  auto-deploy workflow waits in `tools/pages.workflow.yml` pending a gh token with the
  `workflow` scope: `gh auth refresh -h github.com -s workflow`, then move it into
  `.github/workflows/`).
- **Linked from matthorrigan.com → Games** (bio repo `mreidhorrigan/bio`, local clone
  `~/Documents/bio`). `menubar.js` there is the ONE site-wide menubar — CV-style chrome,
  blue-glow highlight, Games dropdown. **Adding the next game (e.g. the itch.io one) is a
  one-line entry in its `GAMES` array.** The CGSA 2026 audiogames talk is already listed
  (https://cgsa2026-audio-presentation.onrender.com).
- **History was scrubbed before going public** (session logs removed from every commit —
  hashes changed; see *Version control*). `.gitignore` now auto-ignores any Claude chat
  export saved at the repo root (`/YYYY-MM-DD-…*.txt`, any year) — saved chats can never
  be committed or pushed.
- Remaining: a fresh-profile playthrough at the live URL (real first-load UX + the new
  release screen), and the itch.io game link when it ships.

### Gibson voice pass + real endgame screens (2026-06-10 eve)
- **Voice direction:** Clod now renders inner states as the IMMATERIAL weather of digital
  systems, after Gibson — signal/static, ports/protocols, dead channels, unswept registers,
  "lights bright as a city seen from orbit" — and NOT bodily gesture/hardware pantomime
  (no more inclining interfaces, waved hands, preening). Changed: `meta.style`, the host
  `systemPrompt`, and EVERY beat/fallback in `story.js` (facts preserved; storytest suite
  still 24×3 green). Threshold's dead-channel line is a deliberate Neuromancer nod.
- **Endgame flow (no more "(type /reset)" anywhere):**
  - `pass_end` is flagged **`release:true`** → after the final beat plays, the page
    dissolves into a **bright release screen** (`#release` overlay: warm light, faint
    green field; text from `meta.releaseTitle/releaseSub/releaseInvitation`). Any key →
    fade out → `relaunch()`.
  - `reject_end` keeps **`retry:true`** → auto re-shows the loader (existing behavior).
  - **Both restarts keep the LLMs loaded** — `relaunch()` rebuilds only the engine; no
    model re-init/re-download. `/reset` still works as a typed command mid-game.
  - Browser-unverified: the release screen needs one manual `serve.py` + Chrome look
    (logic + parse are checked; suite green).

### Headless LLM-live testing harness + render guards (2026-06-10 PM)
- **`storytest.py` + `tests/driver.js`**: scripted playtests of the REAL engine
  (`llm.js`+`engine.js`+story, production code paths) under JavaScriptCore, LLM calls
  bridged to local **Ollama** — browser/vis/audio fully out of the loop. Scenarios in
  `tests/scenarios/`: happy path, hostile boot, **gate routing matrix** (probe mode),
  no-model fallback. `--reps` = reliability stats; `--llm off`; `--model X` to compare
  models; `--ollama-seed` reproduces a failing rep; failures print the model's raw
  choice + rationale (`-v` = full prompts). **Suite: 24 checks × 3 reps GREEN on
  `smollm2:1.7b`** (the Ollama mirror of the shipped WebLLM SmolLM2-1.7B).
- **The harness immediately caught 4 real bugs — all fixed:**
  1. **Token-cap truncation** (re-voice cut mid-sentence at `renderMaxTokens`) →
     `_renderBeat` now trims to the last finished sentence.
  2. **Key-fact drift** (a `pass_end` re-voice never mentioned the door opening) →
     new node-level `mustConvey` word guard → authored beat on miss.
  3. **Persona parroting** — SmolLM2 echoed the persona prompt's QUOTED negative
     examples verbatim ("Clod Bathos draws itself up", "a wee thing like me"). The
     host prompt was rewritten with UNQUOTABLE prohibitions, and new
     `meta.renderMustNot` regexes deterministically discard persona-breaking
     re-voices (authored beat instead). **Rule: never quote a forbidden phrase in a
     weak model's prompt.**
  4. **Speaker-label prefixes** ("Narrator's voice:") → stripped in `_renderBeat`.
- **Model data (routing matrix, 12 probes × 3 reps):** `smollm2:1.7b` **36/36**;
  `qwen2.5:0.5b` misroutes plain greetings to `offend` (rationale: "'greetings,
  great machine' is hostile…") — the historical polite→affronted bug, reproduced on
  demand and neutralised by the deterministic veto. SmolLM2-1.7B stays the default,
  now with evidence.
- `stories/clod-bathos.story.js` re-mirrored (byte-identical) after the prompt fix.
- JSC fact corrected: promise microtasks DO drain at end of an osascript evaluation —
  full async `takeTurn()` runs headless when the LLM provider is synchronous.

### Version control
The project is a **git repo** (branch `main`), pushed to
`github.com/mreidhorrigan/Clod-Bathos-Superior-Machine-An-LM-IDN`. Key commits
(hashes are post-2026-06-10 history scrub, which removed stray session logs):

| Commit | What |
|---|---|
| `ac738dc` | Radically simplify Clod to a 3-interaction binary — the **active** design. |
| `a30477f` | Baseline: the **complex** Clod Bathos (meters, `approach` signal, patience, the forward ladder, promise-to-return, loneliness arc) — preserved before the simplification. |

- **Recover the rich version:** `git checkout a30477f -- story.js engine/engine.js`
  (or `git checkout a30477f` to view the whole baseline).
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
- **Qwen vs SmolLM2: RESOLVED with data** (storytest routing matrix) — SmolLM2-1.7B routes
  36/36; the old Qwen-0.5B misroutes plain greetings to hostile. SmolLM2 stays. Re-compare
  anytime: `python3 storytest.py tests/scenarios/clod-gates-probes.json --model <m> --reps 5`.
- **Engine + story behavior is now harness-verified end-to-end with a live LLM** (routing,
  veto, fallbacks, render guards, persona). Still needing a manual `serve.py` + Chrome run:
  voice/STT/visuals/pacing — the documented audio/WebGPU boundary.

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

> **STATUS 2026-06-10: ACHIEVED for the web path** — the game is live on GitHub Pages
> (see *PUBLISHED* at the top + the checklist below). The folder / one-file / desktop
> variants below remain optional extras.

Good news: **browser-side delivery already works** (the WebLLM web build runs entirely in the
page). What remains is *hosting + polish + model choice*, not core capability. Options,
best-for-easy-setup first:

### A. Hosted WebLLM static site — RECOMMENDED for "no install, click a link"
Deploy `dist/web/` to any static host; the end user opens a URL in Chrome/Edge, the model
downloads once, and they play — zero install.
- **SIZE IS NOT A BLOCKER — no model weights ship with the build.** `dist/web/` is well
  under 1 MB of HTML+JS. WebLLM weights (~1 GB for SmolLM2-1.7B q4) stream at first run
  from the MLC/HuggingFace CDN straight into the player's browser cache; the Whisper STT
  model likewise (HF CDN, on first mic use); Ollama models live on the player's machine.
  None of it touches your host or its limits (GitHub Pages: 1 GB site / 100 MB-per-file
  / ~100 GB-month — all irrelevant here). No special headers needed; Pages' https also
  satisfies the mic's secure-context requirement.
- **Steps:** `python3 build.py web` → push `dist/web/` to **GitHub Pages** (public repo,
  Settings → Pages) and/or upload the zip to **itch.io as an HTML5 game** (game audience,
  built-in beta feedback). On itch, VERIFY the mic works inside its iframe — if blocked,
  host on Pages and link from the itch page.
- **Caveats:** WebGPU browser required (add the "use Chrome/Edge" gate); first-load
  ~1 GB download (loader already shows progress; cached after); player bandwidth.

### B. Folder + Ollama — for users who want a local model / offline
Ship `dist/folder/`. End user installs Ollama + runs it. More setup, but no download-per-play
and works offline once pulled.

### C. Single self-contained `.html` (Ollama/offline path only)
Inline the engine scripts into one file (`build.py --single`, NOT YET BUILT — easy add). Great
for the folder/Ollama path. **Not possible for WebLLM** (weights/CDN are external).

### D. Desktop app (Electron/Tauri) — "double-click to run"
Wrap the web build as a desktop app; could bundle a runtime. Heaviest; future option.

### Concrete next steps (a checklist to execute)
- [x] (done 2026-06-10) **Confirm the shipped model** — `SmolLM2-1.7B` 36/36 on the
      storytest routing matrix vs `qwen2.5:0.5b` misrouting greetings; stays. Re-compare
      candidates anytime via `storytest.py --model …` (Ollama mirrors of the WebLLM ids).
- [ ] **Pin the WebLLM version** (currently `esm.run` = latest) for reproducibility, e.g.
      `https://esm.run/@mlc-ai/web-llm@<ver>` in `engine/providers/webllm.js`.
- [ ] **Add a WebGPU/browser landing gate** (friendly "open in Chrome/Edge" first-screen check).
- [x] (DONE & LIVE 2026-06-10) **Host**: GitHub Pages, serving the `gh-pages` branch —
      `https://mreidhorrigan.github.io/Clod-Bathos-Superior-Machine-An-LM-IDN/`, linked
      from matthorrigan.com → Games. Redeploy: `python3 deploy_pages.py`. (Actions
      auto-deploy waits at `tools/pages.workflow.yml` pending `gh auth refresh -s workflow`.)
- [ ] **Test the deployed flow** end-to-end in Chrome (fresh profile = real first-load UX).
- [ ] (optional) `build.py --single` for the one-file Ollama/offline artifact.
- [ ] (optional) Electron/Tauri wrapper for a desktop double-click.
- [x] (done 2026-06-10) Folded the simplification into `stories/clod-bathos.story.js`; archived the
      complex Clod + SIGNAL under `stories/archive/`.

## Map / pointers
- **git** — `main`; `a30477f` complex baseline, `ac738dc` simplified. Recover complex:
  `git checkout a30477f -- story.js engine/engine.js`.
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
