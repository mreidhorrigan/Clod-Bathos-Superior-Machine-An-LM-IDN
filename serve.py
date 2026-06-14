#!/usr/bin/env python3
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
print("\n  OPEN THIS in Chrome/Edge (WebGPU):  " + url + "\n")
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
