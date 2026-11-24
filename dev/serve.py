#!/usr/bin/env python3
"""Local server that reproduces the GitHub Pages layout of the three sites on one origin:

    http://127.0.0.1:8800/bhg_iAMSmart/                -> this repository
    http://127.0.0.1:8800/BHG/                         -> ../BHG_Homepage
    http://127.0.0.1:8800/bhg_Immigration_Department/  -> ../bhg_Immigration_Department

Because all three share one origin (as on lshdev7.github.io), the local backend (IndexedDB) is shared and
"Login with iAM Smart" works between them. localhost is a secure context, so camera and WebAuthn work too.
    python3 dev/serve.py [port]
"""
import functools
import http.server
import os
import socketserver
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
HOME = os.path.dirname(REPO)


def site(name):
    """Prefer the local-only "iamsmart" worktree (git worktree add ../<name>-iamsmart iamsmart) when it exists."""
    wt = os.path.join(HOME, name + "-iamsmart")
    return wt if os.path.isdir(wt) else os.path.join(HOME, name)


MOUNTS = {
    "/bhg_iAMSmart/": REPO,
    "/BHG/": site("BHG_Homepage"),
    "/bhg_Immigration_Department/": site("bhg_Immigration_Department"),
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        for prefix, base in MOUNTS.items():
            if clean.startswith(prefix):
                sub = clean[len(prefix):]
                full = os.path.normpath(os.path.join(base, *[p for p in sub.split("/") if p and p != ".."]))
                return full if full.startswith(base) else base
        return os.path.join(REPO, "dev", "_none_")

    def do_GET(self):
        if self.path in ("/", ""):
            self.send_response(302)
            self.send_header("Location", "/bhg_iAMSmart/")
            self.end_headers()
            return
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8800
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", port), functools.partial(Handler)) as httpd:
        print("iAM Smart     http://127.0.0.1:%d/bhg_iAMSmart/" % port)
        print("iAM Smart app http://127.0.0.1:%d/bhg_iAMSmart/app/" % port)
        print("GovBHG        http://127.0.0.1:%d/BHG/" % port)
        print("ImmD          http://127.0.0.1:%d/bhg_Immigration_Department/" % port)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
