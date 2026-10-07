"""EMAM cj - سرور محلی. اجرا:  python server.py
سپس باز کن:  http://localhost:8000
کلید API در فایل config.env است و هرگز به مرورگر فرستاده نمی‌شود.
چت و سایت فقط به پایتون ساده نیاز دارند؛ «جستجو در اسناد (RAG)» پکیج‌های requirements-rag.txt را می‌خواهد."""
import base64, json, os, urllib.request, urllib.error
from urllib.parse import urlparse, parse_qs, unquote
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

import rag

ROOT = os.path.dirname(os.path.abspath(__file__))
# هر مسیری که شامل یکی از این نام‌ها باشد (حتی داخل پوشه) از مرورگر در دسترس نیست
BLOCKED = {"config.env", "server.py", "rag.py", ".env", "_env", "rag_data", "__pycache__", "venv"}
CHAT_LIMIT = 60 * 1024 * 1024
UPLOAD_LIMIT = int(rag.MAX_FILE_MB * 1024 * 1024 * 1.4) + 4096  # base64 حدود ۳۳٪ بزرگ‌تر است


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


class TooBig(Exception):
    pass


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _blocked(self):
        parts = unquote(self.path.split("?")[0]).replace("\\", "/").split("/")
        return any(p.lower() in BLOCKED for p in parts)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/rag/status":
            user = (parse_qs(url.query).get("user") or [""])[0]
            return self._json(200, rag.status(user))
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
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self, limit):
        n = int(self.headers.get("Content-Length", 0))
        if n > limit:
            raise TooBig()
        return json.loads(self.rfile.read(n))

    # ---------- مسیرهای RAG ----------
    def _rag_upload(self):
        try:
            body = self._read_json(UPLOAD_LIMIT)
            uid = rag.uid_of(body.get("user"))
            data = base64.b64decode(body["data"], validate=False)
            name = str(body["name"])
        except TooBig:
            return self._json(413, {"error": "حجم فایل بیشتر از %d مگابایت است." % rag.MAX_FILE_MB})
        except Exception:
            return self._json(400, {"error": "درخواست نامعتبر است."})
        if not uid:
            return self._json(400, {"error": "ابتدا وارد حساب شو."})
        try:
            self._json(200, rag.add_document(uid, name, data))
        except rag.RagError as e:
            self._json(400, {"error": str(e)})
        except Exception as e:
            print("[RAG] خطا در افزودن سند:", repr(e))
            self._json(500, {"error": "پردازش سند ناموفق بود: %s" % str(e)[:200]})

    def _rag_delete(self):
        try:
            body = self._read_json(1024 * 64)
            uid = rag.uid_of(body.get("user"))
        except Exception:
            return self._json(400, {"error": "درخواست نامعتبر است."})
        if not uid:
            return self._json(400, {"error": "ابتدا وارد حساب شو."})
        try:
            rag.delete_document(uid, None if body.get("all") else str(body.get("name", "")))
            self._json(200, {"ok": True})
        except rag.RagError as e:
            self._json(400, {"error": str(e)})
        except Exception as e:
            print("[RAG] خطا در حذف:", repr(e))
            self._json(500, {"error": "حذف ناموفق بود."})

    # ---------- چت ----------
    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/rag/upload":
            return self._rag_upload()
        if path == "/api/rag/delete":
            return self._rag_delete()
        if path != "/api/chat":
            return self.send_error(404)
        if not API_KEY:
            return self._json(500, {"error": "کلید API در config.env تنظیم نشده است."})
        try:
            body = self._read_json(CHAT_LIMIT)
            messages = list(body["messages"])
            model = body["model"]
        except Exception:
            return self._json(400, {"error": "درخواست نامعتبر است."})

        # اگر کاربر «جستجو در اسناد» را روشن کرده باشد، متن‌های مرتبط به پرامپت سیستمی اضافه می‌شود
        rag_meta = None
        if body.get("rag"):
            rag_meta = {"used": False}
            uid = rag.uid_of(body.get("user"))
            question = str(body.get("rag_query") or "").strip()[:1000]
            try:
                res = rag.retrieve(uid, question) if (uid and question) else None
                if res:
                    block = rag.system_block(res["context"])
                    first = messages[0] if messages else None
                    if first and first.get("role") == "system" and isinstance(first.get("content"), str):
                        messages[0] = {**first, "content": first["content"] + "\n\n" + block}
                    else:
                        messages.insert(0, {"role": "system", "content": block})
                    rag_meta = {"used": True, "sources": res["sources"]}
                elif uid and question:
                    rag_meta["reason"] = "جستجو در اسناد روشن است ولی سندی پیدا نشد؛ از دانش عمومی پاسخ داده شد."
            except rag.RagError as e:
                rag_meta["reason"] = "جستجو در اسناد انجام نشد: %s" % e
            except Exception as e:
                print("[RAG] خطا در بازیابی:", repr(e))
                rag_meta["reason"] = "جستجو در اسناد با خطا روبه‌رو شد؛ بدون اسناد پاسخ داده شد."

        payload = json.dumps({"model": model, "messages": messages}).encode("utf-8")
        req = urllib.request.Request(
            API_BASE + "/chat/completions", data=payload, method="POST",
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + API_KEY,
                     "User-Agent": "Mozilla/5.0 EMAMcj"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                out = json.loads(r.read())
                if rag_meta is not None and isinstance(out, dict):
                    out["rag"] = rag_meta
                self._json(r.status, out)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "ignore")
            try:
                err = json.loads(raw).get("error", raw)
                detail = err.get("message", raw) if isinstance(err, dict) else str(err)
            except Exception:
                detail = raw[:300]
            hints = {400: "درخواست یا نام مدل پذیرفته نشد.", 401: "کلید API نامعتبر است یا باطل شده.",
                     403: "دسترسی با این کلید یا از این شبکه مجاز نیست.", 405: "آدرس API اشتباه است (روش درخواست پذیرفته نشد)؛ مقدار EMAMCJ_API_BASE در config.env را بررسی کن.",
                     404: "مدل یا آدرس API پیدا نشد؛ مدل دیگری را از بالای چت انتخاب کن.",
                     429: "تعداد درخواست‌ها زیاد است یا اعتبار حساب تمام شده."}
            hint = hints.get(e.code, "سرویس هوش مصنوعی خطا داد." if e.code >= 500 else "خطای ناشناخته.")
            print("[API] وضعیت %d | مدل: %s | %s" % (e.code, model, detail[:300]))
            self._json(e.code, {"error": "%s (کد %d)\nجزئیات: %s" % (hint, e.code, detail[:300])})
        except Exception as e:
            print("[API] خطای اتصال:", e)
            self._json(502, {"error": "اتصال به سرویس هوش مصنوعی برقرار نشد. اینترنت یا فیلترشکن را بررسی کن.\nجزئیات: %s" % e})


if __name__ == "__main__":
    miss = rag.missing_packages()
    print("EMAM cj روی http://localhost:8000 اجرا شد (برای توقف: Ctrl+C)")
    print("جستجو در اسناد (RAG):", "آماده" if not miss else "غیرفعال - نصب نیست: " + ", ".join(miss))
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
