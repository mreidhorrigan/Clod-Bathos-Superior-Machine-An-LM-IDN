#!/usr/bin/env python3
"""
Serve IDN Terminal over http so the DEFAULT in-browser model (WebLLM) can run —
no Ollama needed.   Usage:  python3 serve.py [port]   (default 8000)

- Serves THIS script's folder no matter where you launch it from (can't 404 on the entry).
- If the port is busy, automatically tries the next free one (no "address already in use").
- Sends no-cache headers so edits to story.js / engine/*.js show up on a plain reload.

WebLLM needs http + a WebGPU browser (Chrome/Edge, recent Safari); it will NOT run from a
double-clicked file:// page. First run downloads the model (cached after).
No-server / file:// alternative: CONFIG.llm.provider='ollama' + `OLLAMA_ORIGINS='*' ollama serve`.
"""
import http.server, socketserver, sys, os, webbrowser, urllib.parse
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))   # serve this folder, ignore cwd
ENTRY = "IDN Terminal.html"
START_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True


def open_server():
    last = None
    for port in range(START_PORT, START_PORT + 20):
        try:
            return socketserver.TCPServer(("", port), partial(Handler, directory=ROOT)), port
        except OSError as e:
            last = e
    raise SystemExit("No free port in %d..%d (%s).\nClose other servers or pass one: python3 serve.py 9000"
                     % (START_PORT, START_PORT + 19, last))


httpd, port = open_server()
url = "http://localhost:%d/%s" % (port, urllib.parse.quote(ENTRY))
print("Serving folder:  " + ROOT)
if port != START_PORT:
    print("(port %d was busy — using %d instead)" % (START_PORT, port))
if not os.path.exists(os.path.join(ROOT, ENTRY)):
    print("WARNING: '%s' is not in that folder — keep serve.py next to IDN Terminal.html." % ENTRY)
print("\n  OPEN THIS in Chrome/Edge (WebGPU):  " + url + "\n")
print("First run downloads the model. No Ollama required.   Ctrl-C to stop.")
try:
    webbrowser.open(url)
except Exception:
    pass
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    httpd.server_close()   # release the port cleanly so the next run isn't blocked
