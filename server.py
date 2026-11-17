"""KITA-Q OVERRIDE ローカル開発サーバー
使い方:  python server.py [port]   (既定 5173)

セキュリティ方針:
- 127.0.0.1 のみで待ち受け（LAN や外部からは接続不可）
- Host ヘッダーを localhost / 127.0.0.1 に限定（DNS リバインディング対策）
- ゲームに必要なファイル（index.html, css/, src/）だけを配信し、
  .git/ やサーバー自身などそれ以外は 404
- ディレクトリ一覧は表示しない
- 読み取り専用（GET/HEAD のみ）
"""
import http.server
import os
import posixpath
import sys
from urllib.parse import unquote, urlsplit

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
ROOT = os.path.dirname(os.path.abspath(__file__))
ALLOWED_HOSTS = {f"localhost:{PORT}", f"127.0.0.1:{PORT}", "localhost", "127.0.0.1"}
ALLOWED_FILES = {"index.html"}
ALLOWED_DIRS = ("css/", "src/")
ALLOWED_EXT = {".html", ".js", ".css"}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _allowed(self):
        host = (self.headers.get("Host") or "").lower()
        if host not in ALLOWED_HOSTS:
            return False
        path = posixpath.normpath(unquote(urlsplit(self.path).path)).lstrip("/")
        if path in ("", "."):
            path = "index.html"
        if any(part.startswith(".") for part in path.split("/")):
            return False
        if os.path.splitext(path)[1].lower() not in ALLOWED_EXT:
            return False
        return path in ALLOWED_FILES or path.startswith(ALLOWED_DIRS)

    def do_GET(self):
        if not self._allowed():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._allowed():
            self.send_error(404)
            return
        super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"KITA-Q OVERRIDE  ->  http://localhost:{PORT}/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
