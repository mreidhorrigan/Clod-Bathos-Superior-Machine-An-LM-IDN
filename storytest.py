#!/usr/bin/env python3
"""
storytest.py — headless, scriptable playtests for the IDN engine with a LIVE local LLM.

Runs the REAL browser engine (engine/llm.js + engine/engine.js + a story file) under
macOS JavaScriptCore via tests/driver.js — no browser, no vis/audio — and points its
LLM calls at local Ollama. So you can script a playthrough, assert where the story
should go, and see exactly what the model answered when it doesn't.

    python3 storytest.py                          # run every tests/scenarios/*.json
    python3 storytest.py tests/scenarios/clod-happy.json --reps 5
    python3 storytest.py --llm off                # no model: keyword-fallback path only
    python3 storytest.py --model qwen2.5:1.5b-instruct --render off --reps 10
    python3 storytest.py --list                   # show available scenarios
    python3 storytest.py --transcript out.md      # also dump full playthroughs to read

No dependencies beyond the Python standard library (there is no Node here).

WebLLM ↔ Ollama model parity (same weights, different quantization/runtime — close,
not bit-identical; failures found here are almost always real story/prompt weaknesses):
    SmolLM2-1.7B-Instruct-q4f16_1-MLC   ->  ollama pull smollm2:1.7b      (default here)
    Qwen2.5-1.5B-Instruct-q4f16_1-MLC   ->  ollama pull qwen2.5:1.5b-instruct
    Qwen2.5-0.5B-Instruct-q4f16_1-MLC   ->  ollama pull qwen2.5:0.5b-instruct
    Llama-3.2-1B-Instruct-q4f16_1-MLC   ->  ollama pull llama3.2:1b

SCENARIO FILE (tests/scenarios/*.json):
{
  "name": "clod-happy-path",
  "story": "story.js",              // path relative to repo root (default story.js)
  "seed": 7,                        // engine dice seed (deterministic rolls)
  "opening": true,                  // also re-voice the opening beat (render check)
  "render": true,                   // false = authored beats verbatim (faster; routing still live)
  "llm": "live",                    // "off" = test the no-model keyword/fallback path
  "probe": false,                   // true = each turn runs on a FRESH engine (see "at")
  "at": "parley",                   // start node override (probe mode / late-game testing)
  "world": {"trust": 2},            // preset world params (stories that have them)
  "persona": {                      // regex checks applied to EVERY reply (incl. opening)
    "mustNot": ["(?i)\\bI am (a|an|the) abacus"],
    "must": []
  },
  "turns": [
    { "say": "hello",
      "expect": {                   // every key optional; values may be a string or a list
        "state": "parley",          //   node id after the turn
        "route": ["petition","fallback"],  // transition taken ('fallback' = node fallback)
        "kind": "llm",              //   llm|llm-none|keyword|no-match|hostile|no-eligible
        "model": "petition",        //   the RAW transition the model chose (routing accuracy,
                                    //   even when the engine vetoed/overrode it)
        "world": {"patience": 2},   //   world params AFTER the turn (subset match)
        "signals": {"approach": ["flattery","friendly"]},  // RAW signal classification
        "chars": {"host.mood": "thawing"},  //   character state after the turn
        "ended": false,
        "must": ["(?i)door"],       //   regexes the reply must match
        "mustNot": []               //   ... and must not
      },
      "at": "entreaty"              // (probe mode) per-turn start node
    }
  ]
}
"""

import argparse, glob, json, os, re, subprocess, sys, tempfile, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
DRIVER = os.path.join(ROOT, "tests", "driver.js")
SCENARIO_DIR = os.path.join(ROOT, "tests", "scenarios")
DEFAULT_MODEL = "smollm2:1.7b"  # ollama mirror of CONFIG.webllm.model (SmolLM2-1.7B-Instruct)
DEFAULT_ENDPOINT = "http://localhost:11434/api/chat"

# ---- tiny ANSI helpers ------------------------------------------------------
def _tty(): return sys.stdout.isatty()
def green(s): return f"\033[32m{s}\033[0m" if _tty() else s
def red(s):   return f"\033[31m{s}\033[0m" if _tty() else s
def dim(s):   return f"\033[2m{s}\033[0m" if _tty() else s
def bold(s):  return f"\033[1m{s}\033[0m" if _tty() else s

def ellipsize(s, n=46):
    s = (s or "").replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"

# ---- preflight ---------------------------------------------------------------
def check_ollama(endpoint, model):
    """Fail fast with a useful message instead of letting every turn silently
    fall back to keyword routing (which would defeat the point of live testing)."""
    tags_url = re.sub(r"/api/.*$", "/api/tags", endpoint)
    try:
        with urllib.request.urlopen(tags_url, timeout=4) as r:
            tags = json.load(r)
    except Exception as e:
        sys.exit(f"Ollama is not reachable at {tags_url} ({e}).\n"
                 f"Start it with:  ollama serve   (then re-run)")
    names = [m.get("name", "") for m in tags.get("models", [])]
    if not any(n == model or n.split(":")[0] == model for n in names):
        sys.exit(f"Model '{model}' is not pulled (have: {', '.join(names) or 'none'}).\n"
                 f"Get it with:   ollama pull {model}")

# ---- driver invocation --------------------------------------------------------
def run_driver(config, timeout):
    """Spawn one osascript driver run; return (events, stderr)."""
    fd, cfg_path = tempfile.mkstemp(prefix="idn-storytest-", suffix=".json")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(config, f)
        env = dict(os.environ, IDN_TEST_CONFIG=cfg_path)
        proc = subprocess.run(
            ["osascript", "-l", "JavaScript", DRIVER],
            env=env, capture_output=True, text=True, timeout=timeout)
        events = []
        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try: events.append(json.loads(line))
                except json.JSONDecodeError: pass
        if not events:
            raise RuntimeError(f"driver produced no events (rc={proc.returncode})\n"
                               f"stderr: {proc.stderr.strip()[:2000]}")
        return events, proc.stderr
    finally:
        try: os.unlink(cfg_path)
        except OSError: pass

def base_config(scn, args):
    llm = args.llm or scn.get("llm", "live")
    render = scn.get("render", True)
    if args.render: render = (args.render == "on")
    story = args.story or scn.get("story", "story.js")
    story_path = story if os.path.isabs(story) else os.path.join(ROOT, story)
    return {
        "root": ROOT,
        "storyPath": story_path,
        "seed": args.seed if args.seed is not None else scn.get("seed", 1),
        "provider": "off" if llm == "off" else "live",
        "render": render,
        "opening": bool(scn.get("opening")),
        "at": scn.get("at"),
        "world": scn.get("world"),
        "engine": {"renderTemperature": 0.7, "renderMaxTokens": 150},  # mirrors page CONFIG.engine
        "ollama": {"endpoint": args.endpoint, "model": args.model,
                   "timeoutMs": args.timeout * 1000},
        "turns": [],
    }

# ---- expectation checking ------------------------------------------------------
def _want(fails, key, expected, got):
    if expected is None: return
    opts = expected if isinstance(expected, list) else [expected]
    if got not in opts:
        fails.append(f"{key}: expected {expected!r}, got {got!r}")

def _regexes(fails, label, patterns, text, negate):
    for pat in patterns or []:
        hit = re.search(pat, text or "")
        if negate and hit:
            fails.append(f"{label} matched forbidden /{pat}/: …{text[max(0,hit.start()-20):hit.end()+20]!r}…")
        if not negate and not hit:
            fails.append(f"{label} missing required /{pat}/")

def check_turn(exp, persona, ev, live):
    fails = []
    _want(fails, "state", exp.get("state"), ev.get("state"))
    _want(fails, "route", exp.get("route"), ev.get("route"))
    _want(fails, "kind",  exp.get("kind"),  ev.get("kind"))
    if "ended" in exp and bool(ev.get("ended")) != bool(exp["ended"]):
        fails.append(f"ended: expected {exp['ended']}, got {ev.get('ended')}")
    raw = (ev.get("appraisal") or {}).get("transition")
    _want(fails, "model", exp.get("model"), raw)
    for key, want in (exp.get("world") or {}).items():            # world params after the turn
        _want(fails, f"world.{key}", want, (ev.get("world") or {}).get(key))
    for name, want in (exp.get("signals") or {}).items():         # the RAW signal the model chose
        _want(fails, f"signal.{name}", want,
              ((ev.get("appraisal") or {}).get("signals") or {}).get(name))
    for path, want in (exp.get("chars") or {}).items():           # "host.mood": "thawing"
        cid, _, field = path.partition(".")
        got = (((ev.get("chars") or {}).get(cid) or {}).get("state") or {}).get(field)
        _want(fails, f"char.{path}", want, got)
    _regexes(fails, "reply", exp.get("must"), ev.get("reply"), negate=False)
    _regexes(fails, "reply", exp.get("mustNot"), ev.get("reply"), negate=True)
    _regexes(fails, "persona", (persona or {}).get("must"), ev.get("reply"), negate=False)
    _regexes(fails, "persona", (persona or {}).get("mustNot"), ev.get("reply"), negate=True)
    # live mode: an unexpected silent fallback means the LLM call itself failed — say so loudly
    if live and ev.get("kind") in ("keyword", "no-match") and "kind" not in exp:
        errs = [c.get("error") for c in ev.get("llm", []) if c.get("error")]
        fails.append(f"LLM call failed → silent keyword fallback ({'; '.join(errs) or 'no model response'})")
    return fails

# ---- one scenario ----------------------------------------------------------------
def run_scenario(scn, args, transcript):
    name = scn.get("name") or "?"
    turns = scn.get("turns", [])
    persona = scn.get("persona")
    live = (args.llm or scn.get("llm", "live")) != "off"
    cfg0 = base_config(scn, args)

    print(bold(f"=== {name} ") + dim(f"({os.path.relpath(cfg0['storyPath'], ROOT)} · "
          f"{'llm ' + args.model if live else 'NO MODEL'} · render {'on' if cfg0['render'] else 'off'}"
          f" · reps {args.reps}{' · probe' if scn.get('probe') else ''})"))

    # tallies[i] = {"ok": n, "fails": [(rep, [msgs], ev)], "states": {..}, "models": {..}, "kinds": {..}}
    tallies = [dict(ok=0, fails=[], states={}, models={}, kinds={}) for _ in turns]
    opening_fails, fatal = [], None

    for rep in range(1, args.reps + 1):
        if args.ollama_seed is not None:  # reproducible sampling, distinct per rep
            cfg0["ollama"]["options"] = {"seed": args.ollama_seed + rep}
        try:
            if scn.get("probe"):
                events, stderrs = [], []
                for t in turns:
                    c = dict(cfg0, turns=[t["say"]], at=t.get("at", scn.get("at")), opening=False)
                    evs, errtxt = run_driver(c, args.timeout)
                    stderrs.append(errtxt)
                    events.append(next((e for e in evs if e["type"] == "turn"), None)
                                  or next((e for e in evs if e["type"] == "fatal"), None))
                opening_ev = None
            else:
                c = dict(cfg0, turns=[t["say"] for t in turns])
                evs, errtxt = run_driver(c, args.timeout)
                stderrs = [errtxt]
                f = next((e for e in evs if e["type"] == "fatal"), None)
                if f: raise RuntimeError(f"driver fatal: {f['error']}\n{f.get('stack') or ''}")
                opening_ev = next((e for e in evs if e["type"] == "opening"), None)
                by_i = {e["i"]: e for e in evs if e["type"] == "turn"}
                events = [by_i.get(i + 1) for i in range(len(turns))]
        except (RuntimeError, subprocess.TimeoutExpired) as e:
            fatal = str(e); break

        if opening_ev is not None:
            ofails = []
            _regexes(ofails, "persona", (persona or {}).get("must"), opening_ev.get("reply"), False)
            _regexes(ofails, "persona", (persona or {}).get("mustNot"), opening_ev.get("reply"), True)
            if ofails: opening_fails.append((rep, ofails, opening_ev))
            if transcript: transcript.write(f"\n### {name} · rep {rep}\n\n**OPENING:** {opening_ev.get('reply','')}\n\n")
        elif transcript:
            transcript.write(f"\n### {name} · rep {rep}\n\n")

        for i, (t, ev) in enumerate(zip(turns, events)):
            tl = tallies[i]
            if ev is None or ev.get("type") == "fatal":
                why = ev["error"] if ev else "no turn event (story ended early, or driver error)"
                tl["fails"].append((rep, [why], ev or {}))
                continue
            raw = (ev.get("appraisal") or {}).get("transition")
            for key, val in (("states", ev.get("state")), ("models", raw), ("kinds", ev.get("kind"))):
                if val is not None: tl[key][val] = tl[key].get(val, 0) + 1
            fails = check_turn(t.get("expect", {}), persona, ev, live)
            if fails: tl["fails"].append((rep, fails, ev))
            else: tl["ok"] += 1
            if transcript:
                transcript.write(f"> **{ev.get('input','')}**\n\n{ev.get('reply','')}\n\n"
                                 f"<sub>{ev.get('route')} [{ev.get('kind')}] → {ev.get('state')}</sub>\n\n")

    # ---- report ----
    n_fail = 0
    if fatal:
        print(red(f"  FATAL: {fatal}"))
        return 1, len(turns)
    if scn.get("opening") and not scn.get("probe"):
        ok = args.reps - len(opening_fails)
        line = f"  opening re-voice{'':<36} {ok}/{args.reps}"
        print(green(line) if not opening_fails else red(line))
        n_fail += 1 if opening_fails else 0
    for i, (t, tl) in enumerate(zip(turns, tallies)):
        okc = tl["ok"]; tot = okc + len(tl["fails"])
        states = " ".join(f"{k}×{v}" for k, v in tl["states"].items())
        models = " ".join(f"{k}×{v}" for k, v in tl["models"].items())
        kinds  = " ".join(f"{k}×{v}" for k, v in tl["kinds"].items())
        line = (f"  {i+1:>2}. \"{ellipsize(t['say'])}\""
                f"{'':<{max(1, 50 - len(ellipsize(t['say'])))}}{okc}/{tot}"
                f"   → {states or '-'}" + (f"   model: {models}" if models and live else "")
                + (f"   kind: {kinds}" if kinds else ""))
        print(green(line) if not tl["fails"] else red(line))
        if tl["fails"]: n_fail += 1
    # failure detail
    shown = 0
    for rep, ofails, ev in opening_fails[:3]:
        print(red(f"    ✗ opening rep {rep}: " + "; ".join(ofails)))
        print(dim(f"      reply: {ellipsize(ev.get('reply'), 160)}"))
    for i, tl in enumerate(tallies):
        for rep, fails, ev in tl["fails"]:
            if shown >= args.max_failures: break
            shown += 1
            print(red(f"    ✗ turn {i+1} rep {rep}: " + "; ".join(fails)))
            if ev:
                appr = ev.get("appraisal") or {}
                print(dim(f"      input: {ev.get('input')!r}   reply: {ellipsize(ev.get('reply'), 120)!r}"))
                print(dim(f"      taken: {ev.get('route')} [{ev.get('kind')}] → {ev.get('state')}"
                          f"   model said: {appr.get('transition')!r}"
                          + (f"   rationale: {ellipsize(appr.get('rationale'), 90)}" if appr.get("rationale") else "")))
                if args.verbose:
                    for call in ev.get("llm", []):
                        print(dim(f"      [{call.get('kind')}] {call.get('ms')}ms "
                                  f"{'ERROR ' + str(call.get('error')) if call.get('error') else ''}"))
                        for msg in call.get("messages", []):
                            print(dim(f"        --- {msg['role']} ---"))
                            for ln in msg["content"].splitlines():
                                print(dim(f"        {ln}"))
                        if call.get("response") is not None:
                            print(dim(f"        --- response ---\n        {call['response']}"))
    return n_fail, len(turns) + (1 if scn.get("opening") else 0)

# ---- main -------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="Headless playtests for the IDN engine against live local Ollama.",
        epilog="Scenario schema: see the docstring at the top of this file.",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("scenarios", nargs="*", help="scenario .json files (default: tests/scenarios/*.json)")
    ap.add_argument("--reps", type=int, default=1, help="repetitions per scenario (reliability stats)")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"ollama model (default {DEFAULT_MODEL})")
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    ap.add_argument("--llm", choices=["live", "off"], default=None,
                    help="override scenarios: off = no model (keyword/fallback path)")
    ap.add_argument("--render", choices=["on", "off"], default=None,
                    help="override scenarios: off = authored beats verbatim (faster)")
    ap.add_argument("--story", default=None, help="override the story file for all scenarios")
    ap.add_argument("--seed", type=int, default=None, help="override the dice seed")
    ap.add_argument("--timeout", type=int, default=600, help="seconds per driver run (default 600)")
    ap.add_argument("--ollama-seed", type=int, default=None,
                    help="fix Ollama's sampling seed (per rep: seed+rep) — reproduce a failing rep exactly")
    ap.add_argument("--max-failures", type=int, default=8, help="failure details to print per scenario")
    ap.add_argument("--transcript", default=None, help="append full playthroughs to this markdown file")
    ap.add_argument("--list", action="store_true", help="list scenarios and exit")
    ap.add_argument("-v", "--verbose", action="store_true", help="on failure, dump the full LLM prompts")
    args = ap.parse_args()

    if sys.platform != "darwin":
        sys.exit("storytest.py drives the engine via macOS JavaScriptCore (osascript); macOS only.")
    if not os.path.exists(DRIVER):
        sys.exit(f"missing driver: {DRIVER}")

    files = args.scenarios or sorted(glob.glob(os.path.join(SCENARIO_DIR, "*.json")))
    if not files:
        sys.exit(f"no scenarios found in {SCENARIO_DIR} (or pass files explicitly)")
    scns = []
    for fp in files:
        with open(fp, encoding="utf-8") as f:
            scn = json.load(f)
        scn.setdefault("name", os.path.splitext(os.path.basename(fp))[0])
        scns.append(scn)

    if args.list:
        for s in scns:
            print(f"  {s['name']:<28} {len(s.get('turns', []))} turns"
                  f"{' · probe' if s.get('probe') else ''}{' · llm off' if s.get('llm') == 'off' else ''}")
        return

    if any((args.llm or s.get("llm", "live")) != "off" for s in scns):
        check_ollama(args.endpoint, args.model)

    transcript = None
    if args.transcript:
        transcript = open(args.transcript, "a", encoding="utf-8")
        transcript.write(f"\n## storytest run · model {args.model} · reps {args.reps}\n")

    total_fail = total_checks = 0
    try:
        for scn in scns:
            nf, nc = run_scenario(scn, args, transcript)
            total_fail += nf; total_checks += nc
    finally:
        if transcript: transcript.close()

    print()
    if total_fail:
        print(red(bold(f"FAIL — {total_fail}/{total_checks} checks had failures")))
        sys.exit(1)
    print(green(bold(f"OK — all {total_checks} checks passed")))

if __name__ == "__main__":
    main()
