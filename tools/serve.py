#!/usr/bin/env python3
"""Local dev server for The Home with caching turned off (so edits show up on refresh).

    python tools/serve.py          # http://localhost:8080
    python tools/serve.py 3000
"""
import http.server, os, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', PORT), NoCache) as httpd:
    print(f'The Home is running at http://localhost:{PORT}  (Ctrl+C to stop)')
    httpd.serve_forever()
