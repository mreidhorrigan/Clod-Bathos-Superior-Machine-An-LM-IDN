#!/usr/bin/env python3
"""
build.py — emit the two ship variants of IDN Terminal from this one source.

    python3 build.py            # build both
    python3 build.py folder     # just the file:// + Ollama folder build
    python3 build.py web        # just the http + WebLLM (in-browser) build

No dependencies beyond the Python standard library (there is no Node here).

Both builds share ALL the same source files. The ONLY differences are:
  - the value of CONFIG.llm.provider  (the `// BUILD_PROVIDER` line in the HTML)
  - the entry filename                 (folder: "IDN Terminal.html" / web: "index.html")
  - a couple of helper text files (and serve.py for the web build)

  dist/folder/  -> provider='ollama', opens from file://. Zip it and ship it.
  dist/web/     -> provider='webllm', serve over http. Deploy it to any static host.
"""

import os, re, sys, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
HTML_SRC = "IDN Terminal.html"

# Every file both builds need (paths relative to ROOT, structure preserved).
SHARED = [
    "engine/engine.js",
    "engine/llm.js",
    "engine/providers/ollama.js",
    "engine/providers/webllm.js",   # inert in the folder build (only imports when selected)
    "engine/voice.js",
    "engine/speech.js",                  # speech-to-text / voice control (built-in Web Speech provider)
    "engine/providers/whisper-stt.js",   # OFFLINE STT provider (transformers.js Whisper; inert unless selected)
    "engine/vendor/samjs.js",
    "story.js",
]

# Rewrite the single CONFIG.llm.provider line (tagged with `// BUILD_PROVIDER`).
PROVIDER_RE = re.compile(r"(llm:\s*\{\s*provider:\s*)'[^']*'(\s*\}[^\n]*BUILD_PROVIDER)")

def set_provider(html, provider):
    new, n = PROVIDER_RE.subn(lambda m: m.group(1) + "'" + provider + "'" + m.group(2), html)
    if n != 1:
        sys.exit("build.py: expected exactly one `// BUILD_PROVIDER` marker in %s (found %d)" % (HTML_SRC, n))
    return new

def copy_shared(out_dir):
    for rel in SHARED:
        src = os.path.join(ROOT, rel)
        dst = os.path.join(out_dir, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)

def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)

def fresh(out_dir):
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir, exist_ok=True)

FOLDER_README = """IDN TERMINAL - FOLDER (Ollama) BUILD
====================================
Runs locally from file:// - no web server needed.

1. Install Ollama (https://ollama.com) and pull a small model:
       ollama pull llama3.2
2. Start Ollama so this page is allowed to call it:
       OLLAMA_ORIGINS='*' ollama serve
3. Double-click "IDN Terminal.html".

No Ollama running? It STILL works - your input is keyword-routed to the story and
beats are shown as authored text (just not adaptively re-voiced). Change the model
in CONFIG.ollama.model inside the HTML.
"""

WEB_README = """IDN TERMINAL - WEB (WebLLM) BUILD
=================================
Runs a language model IN YOUR BROWSER via WebGPU. No server, no Ollama.

Requirements:
  - a WebGPU browser (Chrome/Edge, or recent Safari)
  - served over http (it will NOT run from file:// - module workers + WebGPU need it)

Quick local test:
    python3 serve.py
  (serves http://localhost:8000 and opens it). The FIRST run downloads the model
  weights, cached by the browser afterwards - watch the loading screen for progress.

Deploy: upload this whole folder to any static host (GitHub Pages, Netlify, S3, ...).
A plain static host is enough; no special headers are required for the WebGPU path.
Pick the model in CONFIG.webllm.model inside index.html.
"""

SERVE_PY = '''#!/usr/bin/env python3
"""Static server for the WebLLM build. Serves THIS folder (ignores cwd), auto-picks a
   free port if one is busy, no-cache headers.  Usage: python3 serve.py [port]"""
import http.server, socketserver, sys, os, webbrowser
from functools import partial
ROOT = os.path.dirname(os.path.abspath(__file__))
START = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate"); super().end_headers()
socketserver.TCPServer.allow_reuse_address = True
httpd = port = None
for p in range(START, START + 20):
    try:
        httpd, port = socketserver.TCPServer(("", p), partial(Handler, directory=ROOT)), p; break
    except OSError:
        continue
if not httpd:
    raise SystemExit("No free port near %d. Try: python3 serve.py 9000" % START)
url = "http://localhost:%d/" % port
print("Serving folder: " + ROOT + ("" if port == START else "  (port %d busy -> %d)" % (START, port)))
print("\\n  OPEN THIS in Chrome/Edge (WebGPU):  " + url + "\\n")
print("First run downloads the model. Ctrl-C to stop.")
try:
    webbrowser.open(url)
except Exception:
    pass
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    httpd.server_close()
'''

def build_folder():
    out = os.path.join(DIST, "folder")
    fresh(out)
    copy_shared(out)
    html = open(os.path.join(ROOT, HTML_SRC), encoding="utf-8").read()
    write(os.path.join(out, "IDN Terminal.html"), set_provider(html, "ollama"))
    write(os.path.join(out, "READ-ME-FIRST.txt"), FOLDER_README)
    print("  dist/folder/  -> provider=ollama, entry 'IDN Terminal.html' (open from file://)")

def build_web():
    out = os.path.join(DIST, "web")
    fresh(out)
    copy_shared(out)
    html = open(os.path.join(ROOT, HTML_SRC), encoding="utf-8").read()
    write(os.path.join(out, "index.html"), set_provider(html, "webllm"))
    write(os.path.join(out, "serve.py"), SERVE_PY)
    write(os.path.join(out, "READ-ME-FIRST.txt"), WEB_README)
    print("  dist/web/     -> provider=webllm, entry 'index.html' (serve over http)")

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    if target not in ("all", "folder", "web"):
        sys.exit("usage: python3 build.py [all|folder|web]")
    print("Building IDN Terminal -> dist/")
    if target in ("all", "folder"): build_folder()
    if target in ("all", "web"):    build_web()
    print("Done.")

if __name__ == "__main__":
    main()
