"""EMAM cj - سرور محلی. فقط پایتون (بدون نصب پکیج). اجرا:  python server.py
سپس باز کن:  http://localhost:8000
کلید API در فایل config.env است و هرگز به مرورگر فرستاده نمی‌شود."""
import json, os, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
BLOCKED = {"config.env", "server.py", ".env"}


def load_env():
    path = os.path.join(ROOT, "config.env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


load_env()
API_KEY = os.environ.get("EMAMCJ_API_KEY", "")
API_BASE = os.environ.get("EMAMCJ_API_BASE", "https://platform.doona.ai/v1").rstrip("/")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _blocked(self):
        return os.path.basename(self.path.split("?")[0]) in BLOCKED

    def do_GET(self):
        if self._blocked():
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if self._blocked():
            return self.send_error(404)
        super().do_HEAD()

    def _json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/chat":
            return self.send_error(404)
        if not API_KEY:
            return self._json(500, {"error": "کلید API در config.env تنظیم نشده است."})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            payload = json.dumps({"model": body["model"], "messages": body["messages"]}).encode("utf-8")
        except Exception:
            return self._json(400, {"error": "درخواست نامعتبر است."})
        req = urllib.request.Request(
            API_BASE + "/chat/completions", data=payload, method="POST",
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + API_KEY,
                     "User-Agent": "Mozilla/5.0 EMAMcj"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                self._json(r.status, json.loads(r.read()))
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read())
            except Exception:
                err = {"error": "خطای سرویس هوش مصنوعی (کد %d)" % e.code}
            self._json(e.code, err)
        except Exception as e:
            self._json(502, {"error": "ارتباط با سرویس هوش مصنوعی برقرار نشد: %s" % e})


if __name__ == "__main__":
    print("EMAM cj روی http://localhost:8000 اجرا شد (برای توقف: Ctrl+C)")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
