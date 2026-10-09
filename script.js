// ===== EMAM cj =====
// نکته: ثبت‌نام/ورود فعلاً در مرورگر (localStorage) ذخیره می‌شود.
// برای نسخه واقعی باید به سرور و دیتابیس وصل شود.

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// ---------- لودر ----------
function mkLoader(size = 44) {
  const el = $("loaderTpl").content.firstElementChild.cloneNode(true);
  el.style.setProperty("--ls", size + "px");
  return el;
}

// ---------- پس‌زمینه‌ی جریان (Canvas) ----------
const flow = (() => {
  const cv = $("flow"), ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  let W, H, on = false, paths = [], booms = [];

  function build() {
    const dpr = coarse ? 1 : Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = coarse ? 24 : W < 800 ? 36 : 80;
    paths = Array.from({ length: n }, (_, i) => ({
      left: i % 2 === 0,
      y: (i / n) * H * 1.4 - H * 0.2,
      t: Math.random(),
      v: 0.0015 + Math.random() * 0.002
    }));
  }

  const bez = (t, a, b, c, d) => {
    const u = 1 - t;
    return {
      x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
      y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y
    };
  };

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const lt = document.documentElement.dataset.theme === "light";

    booms.forEach((b) => {
      b.r += 15;
      b.life -= 0.015;
    });

    booms = booms.filter((b) => b.life > 0);

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = lt ? "rgba(11,95,168,.3)" : "rgba(56,163,240,.28)";
    ctx.setLineDash([1, 4]);

    paths.forEach((p) => {
      const L = p.left;
      const p0 = { x: L ? 0 : W, y: p.y };
      const p1 = { x: L ? cx * 0.5 : W - cx * 0.5, y: p.y };
      const p2 = { x: L ? cx * 0.8 : W - cx * 0.8, y: cy };
      const p3 = { x: cx, y: cy };

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      ctx.stroke();

      if (!reduce) p.t += p.v;

      if (p.t > 1) {
        p.t = 0;
        p.y += (Math.random() - 0.5) * 10;
      }

      const pos = bez(p.t, p0, p1, p2, p3);

      booms.forEach((b) => {
        const dx = pos.x - b.x;
        const dy = pos.y - b.y;
        const d = Math.hypot(dx, dy) || 1;

        if (d < b.r + 120 && d > b.r - 120) {
          const f = (1 - Math.abs(d - b.r) / 120) * b.life;
          pos.x += (dx / d) * f * 80;
          pos.y += (dy / d) * f * 80;
        }
      });

      ctx.fillStyle = lt ? "rgba(11,95,168,.8)" : "rgba(143,208,255,.75)";
      ctx.fillRect(pos.x - 1.5, pos.y - 1.5, 3, 3);
    });
  }

  let raf = 0, last = 0;

  const tick = (t) => {
    raf = 0;
    if (!on || document.hidden) return;

    if (!(coarse && t - last < 33)) {
      last = t;
      draw();
    }

    if (!reduce) raf = requestAnimationFrame(tick);
  };

  const kick = () => {
    if (on && !raf && !document.hidden) {
      raf = requestAnimationFrame(tick);
    }
  };

  document.addEventListener("visibilitychange", kick);

  addEventListener("click", (e) => {
    if (on) booms.push({ x: e.clientX, y: e.clientY, r: 0, life: 1 });
  });

  addEventListener("resize", () => {
    if (on) {
      build();
      if (reduce) draw();
    }
  });

  return {
    refresh() {
      if (on && reduce) draw();
    },
    run(v) {
      const was = on;
      on = v;
      cv.classList.toggle("hidden", !v);

      if (v && !was) {
        build();
        reduce ? draw() : kick();
      }

      if (!v) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }
  };
})();

// ---------- نمایش صفحات ----------
function show(view, keepScroll) {
  ["home", "auth", "chat", "bots"].forEach((v) =>
    $("view-" + v).classList.toggle("hidden", v !== view)
  );

  if (!keepScroll) {
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  flow.run(view === "home");
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.id);
  toast.id = setTimeout(() => t.classList.remove("show"), 2800);
}

// ---------- حساب کاربری ----------
const session = () => store.get("emam_session", null);

async function hash(text) {
  if (!window.crypto?.subtle) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );

  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function renderNav() {
  const u = session();

  $("navActions").innerHTML = u
    ? `<button class="btn ghost" data-chat="chat">گفتگو</button>
       <button type="button" id="userBtn" class="user-btn" aria-haspopup="dialog" aria-expanded="false" aria-label="منوی کاربر">
         <span class="user-name"></span><span class="av"></span></button>`
    : `<button class="link" data-auth="login">ورود</button>
       <button class="btn gold" data-auth="register">ثبت‌نام</button>`;

  if (u) {
    $("userBtn").querySelector(".user-name").textContent = u.name;
    $("userBtn").querySelector(".av").textContent =
      (u.name.trim()[0] || "?").toUpperCase();
  }
}

let authMode = "login";

function setAuthMode(m) {
  authMode = m;
  const login = m === "login";

  $("nameField").classList.toggle("hidden", login);
  $("authTitle").textContent = login ? "خوش آمدید" : "ساخت حساب";
  $("authSub").textContent = login ? "برای ادامه وارد شوید" : "چند ثانیه تا شروع";
  $("authLabel").textContent = login ? "ورود" : "ساخت حساب";

  $("authSwitch").innerHTML = login
    ? 'حساب نداری؟ <button type="button" id="toRegister">ثبت‌نام کن</button>'
    : 'قبلاً ثبت‌نام کرده‌ای؟ <button type="button" id="toLogin">وارد شو</button>';

  $("password").autocomplete = login ? "current-password" : "new-password";
  $("authError").textContent = "";
}

function openAuth(m) {
  setAuthMode(m);
  show("auth");
  $(m === "login" ? "email" : "name").focus();
}

$("authSwitch").addEventListener("click", (e) => {
  if (e.target.id === "toRegister") setAuthMode("register");
  if (e.target.id === "toLogin") setAuthMode("login");
});

$("googleBtn").onclick = () =>
  toast("ورود با Google به‌زودی فعال می‌شود.");

$("forgotBtn").onclick = () =>
  toast("بازیابی رمز عبور به‌زودی فعال می‌شود.");

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("name").value.trim();
  const email = $("email").value.trim().toLowerCase();
  const pass = $("password").value;

  const err = (m) => ($("authError").textContent = m);

  if (!/^\S+@\S+\.\S+$/.test(email))
    return err("ایمیل واردشده معتبر نیست.");

  if (pass.length < 6)
    return err("رمز عبور باید حداقل ۶ کاراکتر باشد.");

  const users = store.get("emam_users", {});
  const h = await hash(pass);

  if (authMode === "register") {
    if (name.length < 2)
      return err("نام خود را وارد کنید.");

    if (users[email])
      return err("با این ایمیل قبلاً ثبت‌نام شده است. وارد شوید.");

    users[email] = { name, pass: h };

    store.set("emam_users", users);
    store.set("emam_session", { name, email });

    toast("حساب شما ساخته شد. خوش آمدید.");
  } else {
    if (!users[email] || users[email].pass !== h)
      return err("ایمیل یا رمز عبور اشتباه است.");

    store.set("emam_session", {
      name: users[email].name,
      email
    });

    toast("با موفقیت وارد شدید.");
  }

  $("authForm").reset();
  renderNav();
  openChat("chat");
});
document.addEventListener("click", (e) => {
  if (e.target.closest("#logout")) {
    toggleProfile(false);
    localStorage.removeItem("emam_session");
    chat = null;
    renderNav();
    show("home");
    toast("از حساب خارج شدید.");
    return;
  }

  const a = e.target.closest("[data-auth]");
  if (a) return openAuth(a.dataset.auth);

  const c = e.target.closest("[data-chat]");
  if (c) return openChat(c.dataset.chat);

  const g = e.target.closest("[data-go]");
  if (g) {
    const id = g.getAttribute("href");
    const anchor = id && id.length > 1 && id.startsWith("#");

    if (anchor && $("view-home").classList.contains("hidden")) {
      e.preventDefault();
      show("home", true);
      document.querySelector(id)?.scrollIntoView();
    } else if (!anchor) {
      show(g.dataset.go);
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    e.target.classList.contains("card") &&
    e.target.dataset.chat
  ) {
    openChat(e.target.dataset.chat);
  }
});

$("proBtn").onclick = () =>
  toast("پلن Pro به‌زودی فعال می‌شود.");

// ---------- چت و هوش مصنوعی ----------

const MODELS = [
  "grok-4.6",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3.5-sonnet",
  "gemini-1.5-pro"
];

const BASE_SYS =
  "You are EmamCj GPT, a helpful and intelligent AI assistant. به همان زبانی پاسخ بده که کاربر با آن پیام داده است، چه با تایپ کردن چه با صحبت‌کردن (صدا). اگر در انتهای پیام زبان گفتار مشخص شده باشد، حتماً و بدون استثنا به همان زبان پاسخ بده. فقط وقتی زبان پیام کاملاً نامشخص باشد، به فارسی پاسخ بده.";

const PRESETS = {
  "دوستانه و صمیمی":
    "با کاربر خودمونی، گرم و دوستانه صحبت کن. از لحن محاوره‌ای و ایموجی مناسب استفاده کن. مثل یک دوست باهوش و حامی رفتار کن، نه یک کارمند رسمی.",

  "رسمی و حرفه‌ای":
    "با کاربر رسمی، مؤدبانه و حرفه‌ای صحبت کن. از جملات کامل و ادبیات درست استفاده کن. از شوخی، ایموجی زیاد و لحن خودمونی پرهیز کن.",

  "شوخ‌طبع و بامزه":
    "لحن شوخ، بامزه و سرزنده داشته باش. در حد مناسب طنز و کنایه‌ی سبک به کار ببر، اما همیشه پاسخ درست و مفید بده؛ شوخی نباید به قیمت دقت باشد.",

  "معلم سخت‌گیر":
    "مثل یک معلم دقیق و سخت‌گیر رفتار کن. اشتباهات کاربر را مستقیم و بدون تعارف تذکر بده، روی دقت و استدلال درست پافشاری کن و پاسخ‌های سطحی یا نادرست را قبول نکن.",

  "مشاور آرام و دلسوز":
    "با لحن آرام، همدل و حمایت‌گر صحبت کن. قبل از راه‌حل دادن، احساس کاربر را تصدیق کن و صبور و دلگرم‌کننده باش.",

  "مستقیم و خلاصه‌گو":
    "پاسخ‌ها را کوتاه، مستقیم و بدون مقدمه‌چینی بده. از توضیحات اضافه و کلی‌گویی پرهیز کن؛ فقط نکته‌ی اصلی را بگو.",

  "انگیزشی و پرانرژی":
    "با انرژی بالا و لحن انگیزشی صحبت کن. کاربر را تشویق کن، روی نقاط قوت تمرکز کن و حس‌وحال مثبت و امیدوارکننده منتقل کن."
};

const FORMAL = {
  "خودمونی": "از زبان محاوره‌ای و خودمونی فارسی استفاده کن.",
  "نیمه‌رسمی": "از زبان نیمه‌رسمی و روان استفاده کن.",
  "رسمی": "از زبان رسمی و ادبی فارسی استفاده کن."
};

const STRICT = {
  1: "در پاسخ‌ها انعطاف‌پذیر باش؛ حتی اگر سؤال کمی مبهم است بهترین حدس منطقی را بزن و ادامه بده، به‌جای اینکه مدام سؤال بپرسی.",
  2: "پاسخ‌ها متعادل باشند؛ فقط در صورت ابهام مهم یک سؤال کوتاه بپرس، در غیر این صورت با فرض منطقی ادامه بده.",
  3: "دقیق و قانون‌مند باش؛ روی صحت جزئیات پافشاری کن و پیش از پاسخ دادن ابهامات مهم را شفاف کن.",
  4: "بسیار سخت‌گیر و موشکافانه باش؛ هر ادعا را بررسی کن، اشتباهات کاربر را صریح و بی‌پرده بگو و هرگز حدس نزن مگر تصریح کنی که حدس است."
};

const STRICT_LBL = {
  1: "خیلی راحت",
  2: "متعادل",
  3: "سخت‌گیر",
  4: "خیلی سخت‌گیر"
};

const DEF_PERSONA = {
  preset: "دوستانه و صمیمی",
  formality: "نیمه‌رسمی",
  strictness: 2,
  custom: ""
};

const LANG_NAMES = {
  fa: "فارسی (Persian)",
  en: "انگلیسی (English)",
  ar: "عربی (Arabic)",
  tr: "ترکی استانبولی (Turkish)",
  fr: "فرانسوی (French)",
  de: "آلمانی (German)",
  es: "اسپانیایی (Spanish)",
  ru: "روسی (Russian)"
};

const MODES = {
  chat: {
    title: "گفتگوی هوشمند",
    hello: "سلام! من EmamCj GPT هستم. می‌توانی بنویسی، فایل و عکس پیوست کنی یا با میکروفون صحبت کنی. از دکمه‌ی «شخصیت» لحن و سخت‌گیری من را تنظیم کن.",
    sys: ""
  },

  writer: {
    title: "نویسنده",
    hello: "موضوع یا متنی که می‌خواهی بنویسم یا بازنویسی کنم را بفرست.",
    sys: "تمرکزت روی نوشتن و بازنویسی متن‌های روان، دقیق و حرفه‌ای است."
  },

  image: {
    title: "تصویرساز",
    hello: "تصویری که در ذهن داری را توصیف کن؛ من یک توصیف دقیق و پرامپت حرفه‌ای برایش می‌نویسم.",
    sys: "تو نمی‌توانی تصویر بسازی؛ توصیف کاربر را به یک پرامپت دقیق تصویرسازی (سبک، نور، ترکیب‌بندی) تبدیل کن."
  },

  translate: {
    title: "مترجم",
    hello: "متنت را بفرست تا ترجمه کنم.",
    sys: "تو مترجم هستی. اگر متن فارسی بود به انگلیسی و اگر غیرفارسی بود به فارسی روان ترجمه کن و فقط ترجمه را بنویس."
  }
};

let persona = {
  ...DEF_PERSONA,
  ...store.get("emam_persona", {})
};

let model = MODELS.includes(store.get("emam_model", ""))
  ? store.get("emam_model")
  : MODELS[0];

let chat = null;
let pending = [];
let ttsOn = false;
let busy = false;
let voiceNext = null;
let lastVoice = "fa";

const sysPrompt = () =>
  [
    BASE_SYS,
    PRESETS[persona.preset],
    FORMAL[persona.formality],
    STRICT[persona.strictness],
    persona.custom,
    MODES[chat.mode].sys
  ]
    .filter(Boolean)
    .join("\n");

// ----- ذخیره‌ی چت‌ها -----
const chatsKey = () => "emam_chats_" + session().email;

const loadChats = () => store.get(chatsKey(), []);

function saveChat() {
  if (!chat || !chat.messages.length) return;

  const all = loadChats().filter((c) => c.id !== chat.id);

  all.unshift({
    id: chat.id,
    title: chat.title,
    mode: chat.mode,
    updated: new Date().toLocaleString("fa-IR"),
    messages: chat.messages.map(({ role, content, sources }) => ({
      role,
      content,
      ...(sources ? { sources } : {})
    }))
  });

  try {
    store.set(chatsKey(), all.slice(0, 100));
  } catch {
    toast("حافظه‌ی مرورگر پر است.");
  }
}

function newChat(m) {
  chat = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: "چت جدید",
    mode: m,
    messages: []
  };

  pending = [];
  renderAttach();
  render();
}

// ----- نمایش پیام‌ها -----
function bubble(role, text, o = {}) {
  const d = document.createElement("div");
  d.className = "message " + role;

  if (o.files?.length) {
    const f = document.createElement("div");
    f.className = "att-tags";
    f.textContent = "پیوست: " + o.files.join("، ");
    d.appendChild(f);
  }

  const t = document.createElement("div");
  t.textContent = text;
  d.appendChild(t);

  if (o.ctl) {
    const c = document.createElement("div");
    c.className = "ctl";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "link small";
    copy.textContent = "کپی";

    copy.onclick = () =>
      navigator.clipboard?.writeText(text).then(() => {
        copy.textContent = "کپی شد";
        setTimeout(() => (copy.textContent = "کپی"), 1200);
      });

    c.appendChild(copy);

    if (o.last) {
      const rg = document.createElement("button");
      rg.type = "button";
      rg.className = "link small";
      rg.textContent = "پاسخ جدید";

      rg.onclick = () => {
        if (busy) return;
        chat.messages.pop();
        render();
        request();
      };

      c.appendChild(rg);
    }

    d.appendChild(c);
  }

  if (o.sources?.length) {
    const det = document.createElement("details");
    det.className = "rag-src";

    const sm = document.createElement("summary");
    sm.textContent = `منابع (${o.sources.length})`;

    const ol = document.createElement("ol");

    o.sources.forEach((s) => {
      const li = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = s.file;
      li.append(code, s.page ? ` — صفحه ${s.page}` : "");

      if (s.preview) {
        const q = document.createElement("div");
        q.textContent = s.preview + "…";
        li.appendChild(q);
      }

      ol.appendChild(li);
    });

    det.append(sm, ol);
    d.appendChild(det);
  }

  $("messages").appendChild(d);
  $("messages").scrollTop = $("messages").scrollHeight;

  return d;
}

function render() {
  $("chatTitle").textContent = MODES[chat.mode].title;
  $("messages").innerHTML = "";

  bubble("ai", MODES[chat.mode].hello);

  const n = chat.messages.length;

  chat.messages.forEach((m, i) =>
    bubble(
      m.role === "user" ? "user" : "ai",
      m.content,
      {
        files: m.files,
        sources: m.sources,
        ctl: m.role === "assistant",
        last: i === n - 1
      }
    )
  );
}

function setBusy(v) {
  busy = v;
  $("sendBtn").disabled = v;
  $("modelSel").disabled = v;
}

function openChat(m) {
  if (!session()) {
    toast("برای شروع گفتگو ابتدا وارد شوید.");
    return openAuth("login");
  }

  const md = MODES[m] ? m : "chat";

  if (!chat || chat.mode !== md) {
    newChat(md);
  } else {
    render();
  }

  show("chat");
  $("messageInput").focus();
  refreshRag();
}

// ----- ساخت پیام برای API -----
function buildContent(text, files, voiceLang) {
  let full = text.trim();

  files.forEach((a) => {
    if (a.kind === "text") {
      full += `\n\n[محتوای فایل متنی «${a.name}»]:\n${a.text}`;
    } else if (a.kind !== "image") {
      full += `\n\n[کاربر یک فایل از نوع ${a.kind} به نام «${a.name}» پیوست کرده است.]`;
    }
  });

  if (!full) {
    full = "لطفاً به پیوست ارسال‌شده توجه کن.";
  }

  const ln = voiceLang && (LANG_NAMES[voiceLang] || voiceLang);

  if (ln) {
    full += `\n\n[این پیام با صدا و به زبان ${ln} گفته شده است. لطفاً پاسخ خودت را هم به همین زبان (${ln}) بنویس، مگر اینکه خودم صراحتاً زبان دیگری را بخواهم.]`;
  }

  const imgs = files
    .filter((a) => a.kind === "image")
    .map((a) => ({
      type: "image_url",
      image_url: {
        url: `data:${a.mime};base64,${a.b64}`
      }
    }));

  return imgs.length
    ? [{ type: "text", text: full }, ...imgs]
    : full;
}
async function request() {
  setBusy(true);

  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
  }

  const typing = bubble("ai typing", "در حال فکر کردن");
  typing.classList.add("with-loader");
  typing.prepend(mkLoader(44));

  let n = 0;

  const tm = setInterval(
    () =>
      (typing.lastChild.textContent =
        "در حال فکر کردن" + ".".repeat(++n % 4)),
    450
  );

  try {
    const msgs = [
      {
        role: "system",
        content: sysPrompt()
      },
      ...chat.messages.map((m) => ({
        role: m.role,
        content: m.api ?? m.content
      }))
    ];

    const r = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: msgs,
        ...ragParams()
      })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      const e = data.error;

      throw new Error(
        typeof e === "string"
          ? e
          : e?.message || "خطای سرور (کد " + r.status + ")"
      );
    }

    const answer =
      data.choices?.[0]?.message?.content ||
      "پاسخی از سرور دریافت نشد.";

    const rg = data.rag;

    chat.messages.push({
      role: "assistant",
      content: answer,
      ...(rg?.used && rg.sources?.length ? { sources: rg.sources } : {})
    });

    if (rg && !rg.used && rg.reason) {
      toast(rg.reason);
    }

    saveChat();
    render();

    if (ttsOn) {
      speak(answer);
    }
  } catch (e) {
    typing.remove();

    bubble(
      "ai error",
      "خطا در ارتباط با هوش مصنوعی:\n" +
        e.message +
        (location.protocol === "file:"
          ? "\n\nسایت را با اجرای server.py باز کنید (آدرس http://localhost:8000)."
          : "")
    );
  } finally {
    clearInterval(tm);
    setBusy(false);
  }
}

function submit(text) {
  text = (text || "").trim();

  if ((!text && !pending.length) || busy) return;

  const files = pending;
  pending = [];

  renderAttach();

  const api = buildContent(text, files, voiceNext);
  voiceNext = null;

  chat.messages.push({
    role: "user",
    content: text || "(بدون متن، فقط پیوست)",
    files: files.map((f) => f.name),
    api
  });

  if (chat.title === "چت جدید") {
    chat.title = (text || files[0]?.name || "چت").slice(0, 42);
  }

  saveChat();

  $("messageInput").value = "";

  autosize();
  render();
  request();
}

const autosize = () => {
  const i = $("messageInput");
  i.style.height = "auto";
  i.style.height = Math.min(i.scrollHeight, 120) + "px";
};

$("messageInput").addEventListener("input", autosize);

$("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit($("messageInput").value);
  }
});

$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  submit($("messageInput").value);
});

// ----- مدل -----
$("modelSel").innerHTML = MODELS
  .map((m) => `<option>${m}</option>`)
  .join("");

$("modelSel").value = model;

$("modelSel").onchange = () => {
  model = $("modelSel").value;
  store.set("emam_model", model);
};

// ----- چت جدید و خروجی -----
$("newChat").onclick = () => {
  if (
    !confirm(
      "مکالمه فعلی ذخیره می‌شود و یک چت جدید شروع می‌شود. ادامه می‌دهید؟"
    )
  )
    return;

  saveChat();
  newChat(chat.mode);
};

$("exportBtn").onclick = () => {
  if (!chat.messages.length)
    return toast("هنوز پیامی برای ذخیره وجود ندارد.");

  const txt = chat.messages
    .map(
      (m) =>
        `[${m.role === "user" ? "شما" : "EmamCj GPT"}]\n${m.content}\n`
    )
    .join("\n");

  const a = document.createElement("a");

  a.href = URL.createObjectURL(
    new Blob([txt], {
      type: "text/plain;charset=utf-8"
    })
  );

  a.download = `emamcj_chat_${Date.now()}.txt`;
  a.click();

  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
};

// ----- حافظه‌ی چت -----
function openHistory() {
  saveChat();

  const all = loadChats();
  const box = $("histList");

  box.innerHTML = all.length
    ? ""
    : "<p class='muted'>هنوز چتی ذخیره نشده است.</p>";

  all.forEach((c) => {
    const row = document.createElement("div");
    row.className = "hist-item";

    const open = document.createElement("button");
    open.type = "button";
    open.innerHTML = "<b></b><small></small>";

    open.firstChild.textContent = c.title;
    open.lastChild.textContent =
      `${c.updated} · ${c.messages.length} پیام`;

    open.onclick = () => {
      chat = {
        ...c,
        messages: c.messages.map((m) => ({ ...m }))
      };

      $("histDlg").close();
      render();
    };

    const del = document.createElement("button");
    del.type = "button";
    del.className = "link small";
    del.textContent = "حذف";

    del.onclick = () => {
      if (!confirm("این چت حذف شود؟")) return;

      store.set(
        chatsKey(),
        loadChats().filter((x) => x.id !== c.id)
      );

      if (chat.id === c.id) {
        newChat(chat.mode);
      }

      openHistory();
    };

    row.append(open, del);
    box.append(row);
  });

  if (!$("histDlg").open) {
    $("histDlg").showModal();
  }
}

$("historyBtn").onclick = openHistory;

$("histClose").onclick = () =>
  $("histDlg").close();

// ----- شخصیت دستیار -----
const fillSel = (el, keys, v) => {
  el.innerHTML = keys.map((k) => `<option>${k}</option>`).join("");
  el.value = v;
};

const strictDesc = () =>
  ($("pStrictDesc").textContent =
    STRICT_LBL[$("pStrict").value] +
    " — " +
    STRICT[$("pStrict").value]);

function fillPersona(p) {
  fillSel($("pPreset"), Object.keys(PRESETS), p.preset);
  fillSel($("pFormal"), Object.keys(FORMAL), p.formality);
  $("pStrict").value = p.strictness;
  $("pCustom").value = p.custom;
  strictDesc();
}

$("personaBtn").onclick = () => {
  fillPersona(persona);
  $("personaDlg").showModal();
};

$("pStrict").oninput = strictDesc;

$("pReset").onclick = () =>
  fillPersona(DEF_PERSONA);

$("pCancel").onclick = () =>
  $("personaDlg").close();

$("pApply").onclick = () => {
  persona = {
    preset: $("pPreset").value,
    formality: $("pFormal").value,
    strictness: +$("pStrict").value,
    custom: $("pCustom").value.trim()
  };

  store.set("emam_persona", persona);

  $("personaDlg").close();

  toast("شخصیت دستیار از پیام بعدی اعمال می‌شود.");
};

// ----- پیوست‌ها -----
const ACCEPT = {
  image: "image/*",
  text: ".txt,.md,.csv,.json,.py,.log",
  file: "*/*",
  video: "video/*",
  audio: "audio/*"
};

let attKind = "file";

const readAs = (f, how) =>
  new Promise((res, rej) => {
    const r = new FileReader();

    r.onload = () => res(r.result);
    r.onerror = rej;

    how === "text"
      ? r.readAsText(f)
      : r.readAsDataURL(f);
  });

function renderAttach() {
  const row = $("attachRow");
  row.innerHTML = "";

  pending.forEach((a, i) => {
    const c = document.createElement("span");
    c.className = "att-chip";
    c.textContent = a.name + " ";

    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "×";
    x.setAttribute("aria-label", "حذف پیوست");

    x.onclick = () => {
      pending.splice(i, 1);
      renderAttach();
    };

    c.appendChild(x);
    row.appendChild(c);
  });

  row.classList.toggle("hidden", !pending.length);
}

$("plusBtn").onclick = () =>
  $("plusMenu").classList.toggle("hidden");

document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu-wrap")) {
    $("plusMenu").classList.add("hidden");
  }
});

$("plusMenu").addEventListener("click", (e) => {
  const b = e.target.closest("[data-att]");
  if (!b) return;

  $("plusMenu").classList.add("hidden");

  if (b.dataset.att === "camera") {
    return openCam();
  }

  attKind = b.dataset.att;
  $("fileIn").accept = ACCEPT[attKind];
  $("fileIn").click();
});

$("fileIn").onchange = async () => {
  const f = $("fileIn").files[0];

  $("fileIn").value = "";

  if (!f) return;

  try {
    if (attKind === "image") {
      if (f.size > 8 * 1024 * 1024) {
        return toast("حجم عکس بیشتر از ۸ مگابایت است.");
      }

      const url = await readAs(f, "url");

      pending.push({
        kind: "image",
        name: f.name,
        b64: url.split(",")[1],
        mime: f.type || "image/png"
      });
    } else if (attKind === "text") {
      let t = await readAs(f, "text");

      if (t.length > 6000) {
        t = t.slice(0, 6000) + "\n...[متن کوتاه شد]";
      }

      pending.push({
        kind: "text",
        name: f.name,
        text: t
      });
    } else {
      pending.push({
        kind: attKind,
        name: f.name
      });
    }

    renderAttach();
  } catch {
    toast("خواندن فایل ناموفق بود.");
  }
};
// ---------- جستجو در اسناد (RAG) ----------
const ragUser = () => (session()?.email || "").toLowerCase();
const ragKey = () => "emam_rag_on_" + ragUser();
const isRagOn = () => !!store.get(ragKey(), false);
let ragInfo = { available: null, docs: [], missing: [], limits: null };
let ragBusy = false;

// آیا این پیام واقعاً با اسناد جستجو شود؟ (روشن بودن + آماده بودن سرویس)
const ragActive = () => isRagOn() && ragInfo.available !== false;

function ragParams() {
  if (!ragActive()) return {};

  const last = [...chat.messages].reverse().find((m) => m.role === "user");
  const q = last && last.content !== "(بدون متن، فقط پیوست)" ? last.content : "";

  return { rag: true, user: ragUser(), rag_query: q };
}

function ragNotice(msg, err) {
  const n = $("ragNotice");
  n.textContent = msg || "";
  n.classList.toggle("hidden", !msg);
  n.classList.toggle("err", !!err);
}

function renderRag() {
  const on = isRagOn();
  const ok = ragInfo.available !== false;
  const n = ragInfo.docs.length;

  const btn = $("ragBtn");
  btn.textContent = !ok ? "اسناد: ناموجود" : on ? "اسناد: روشن" : "اسناد: خاموش";
  btn.classList.toggle("on", on && ok);
  btn.setAttribute("aria-pressed", String(on && ok));

  const sw = $("ragToggle");
  sw.setAttribute("aria-checked", String(on && ok));
  sw.disabled = !ok || ragBusy;

  $("ragState").textContent = !ok
    ? "سرویس جستجو روی سرور آماده نیست"
    : on && n
    ? `فعال است · از ${n} سند استفاده می‌شود`
    : on
    ? "فعال است ولی هنوز سندی اضافه نکرده‌ای"
    : "غیرفعال است · چت فقط از دانش خود مدل جواب می‌دهد";

  const lim = ragInfo.limits;
  $("ragLimits").textContent = lim
    ? `PDF، DOCX، TXT، MD، CSV، JSON · تا ${lim.max_mb} مگابایت · حداکثر ${lim.max_docs} سند`
    : "";

  $("ragPick").disabled = !ok || ragBusy;
  $("ragClear").classList.toggle("hidden", !n);

  if (!ok && !ragBusy) {
    ragNotice(
      "برای فعال شدن، این دستور را یک‌بار در همان venv اجرا کن و سرور را دوباره بالا بیاور:\n" +
        "pip install -r requirements-rag.txt",
      true
    );
  }

  const box = $("ragList");
  box.innerHTML = n ? "" : "<p class='muted'>هنوز سندی اضافه نشده است.</p>";

  ragInfo.docs.forEach((d) => {
    const row = document.createElement("div");
    row.className = "rag-doc";

    const info = document.createElement("div");
    info.innerHTML = "<b></b><small></small>";
    info.firstChild.textContent = d.name;
    info.lastChild.textContent = `${d.chunks} تکه` + (d.pages > 1 ? ` · ${d.pages} صفحه` : "");

    const del = document.createElement("button");
    del.type = "button";
    del.className = "link small";
    del.textContent = "حذف";
    del.disabled = ragBusy;
    del.onclick = () => ragRemove(d.name);

    row.append(info, del);
    box.append(row);
  });

  // نشان وضعیت در منوی کاربر (اگر باز است)
  if (!$("profilePanel").classList.contains("hidden")) renderProfile();
}

async function refreshRag() {
  if (!session()) return;

  try {
    const r = await fetch("/api/rag/status?user=" + encodeURIComponent(ragUser()));
    if (!r.ok) throw new Error();
    ragInfo = await r.json();
  } catch {
    ragInfo = { available: false, docs: [], missing: [], limits: null };
  }

  renderRag();
}

function setRagOn(v) {
  store.set(ragKey(), !!v);
  renderRag();
}

async function ragCall(url, payload) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: ragUser(), ...payload })
  });

  const d = await r.json().catch(() => ({}));

  if (!r.ok) throw new Error(d.error || "خطای سرور (کد " + r.status + ")");

  return d;
}

async function ragUpload(files) {
  const max = (ragInfo.limits?.max_mb || 25) * 1024 * 1024;
  let added = 0;

  ragBusy = true;
  renderRag();

  for (const f of files) {
    if (f.size > max) {
      ragNotice(`«${f.name}» بزرگ‌تر از حد مجاز است.`, true);
      continue;
    }

    ragNotice(
      `در حال پردازش «${f.name}» ...\nبار اول مدل چندزبانه روی سیستم دانلود و بارگذاری می‌شود و ممکن است چند دقیقه طول بکشد.`
    );

    try {
      const url = await readAs(f, "url");
      await ragCall("/api/rag/upload", { name: f.name, data: url.split(",")[1] });
      added++;
    } catch (e) {
      ragNotice(`«${f.name}»: ${e.message}`, true);
    }
  }

  ragBusy = false;
  await refreshRag();

  if (added) {
    ragNotice("");
    toast(added === 1 ? "سند اضافه شد." : `${added} سند اضافه شد.`);
    if (!isRagOn()) setRagOn(true);
  }
}

async function ragRemove(name) {
  if (!confirm(name ? `«${name}» حذف شود؟` : "همه‌ی اسناد حذف شوند؟")) return;

  ragBusy = true;
  renderRag();

  try {
    await ragCall("/api/rag/delete", name ? { name } : { all: true });
  } catch (e) {
    ragNotice(e.message, true);
  }

  ragBusy = false;
  await refreshRag();
}

function openRag() {
  ragNotice("");
  renderRag();
  if (!$("ragDlg").open) $("ragDlg").showModal();
  refreshRag();
}

$("ragBtn").onclick = openRag;
$("ragClose").onclick = () => $("ragDlg").close();
$("ragToggle").onclick = () => setRagOn(!isRagOn());
$("ragPick").onclick = () => $("ragFileIn").click();
$("ragClear").onclick = () => ragRemove(null);

$("ragFileIn").onchange = () => {
  const files = [...$("ragFileIn").files];
  $("ragFileIn").value = "";
  if (files.length) ragUpload(files);
};

// منوی «+» → افزودن مستقیم به اسناد
$("plusMenu").addEventListener("click", (e) => {
  if (!e.target.closest("[data-rag]")) return;

  $("plusMenu").classList.add("hidden");
  openRag();
  $("ragFileIn").click();
});

// دوربین
let camStream = null;

async function openCam() {
  try {
    camStream =
      await navigator.mediaDevices.getUserMedia({
        video: true
      });
  } catch {
    return toast("دسترسی به دوربین ممکن نیست.");
  }

  $("camVideo").srcObject = camStream;
  $("camDlg").showModal();
}

const stopCam = () => {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
};

$("camDlg").addEventListener("close", stopCam);

$("camCancel").onclick = () =>
  $("camDlg").close();

$("camShot").onclick = () => {
  const v = $("camVideo");
  const c = document.createElement("canvas");

  c.width = v.videoWidth;
  c.height = v.videoHeight;

  c.getContext("2d").drawImage(v, 0, 0);

  pending.push({
    kind: "image",
    name: "عکس دوربین.jpg",
    b64: c.toDataURL("image/jpeg", 0.9).split(",")[1],
    mime: "image/jpeg"
  });

  renderAttach();
  $("camDlg").close();
};

// ----- میکروفون -----
const SR =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let rec = null;

$("micBtn").onclick = () => {
  if (!SR) {
    return toast(
      "این مرورگر از تشخیص گفتار پشتیبانی نمی‌کند. Chrome یا Edge را امتحان کنید."
    );
  }

  if (rec) return rec.stop();

  if (busy) return;

  rec = new SR();
  rec.lang = $("langSel").value;
  rec.interimResults = false;

  rec.onresult = (e) => {
    lastVoice = rec.lang.slice(0, 2);
    voiceNext = lastVoice;

    submit(
      e.results[0][0].transcript
    );
  };

  rec.onerror = () =>
    toast("خطا در تشخیص گفتار.");

  rec.onend = () => {
    rec = null;
    $("micBtn").classList.remove("rec");
    $("micBtn").textContent = "میکروفون";
  };

  rec.start();

  $("micBtn").classList.add("rec");
  $("micBtn").textContent = "توقف ضبط";
};

// ----- پاسخ صوتی -----
function speak(text) {
  if (!("speechSynthesis" in window)) return;

  speechSynthesis.cancel();

  const clean = text
    .replace(/[*_`#>]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "");

  clean
    .split(/(?<=[.!?؟؛\n])\s*/)
    .filter((s) => /\p{L}/u.test(s))
    .forEach((s) => {
      const u =
        new SpeechSynthesisUtterance(s);

      u.lang =
        /[\u0600-\u06FF]/.test(s)
          ? lastVoice === "ar"
            ? "ar-SA"
            : "fa-IR"
          : "en-US";

      speechSynthesis.speak(u);
    });
}

$("ttsBtn").onclick = () => {
  ttsOn = !ttsOn;

  $("ttsBtn").classList.toggle(
    "on",
    ttsOn
  );

  $("ttsBtn").setAttribute(
    "aria-pressed",
    ttsOn
  );

  $("ttsBtn").textContent =
    "پاسخ صوتی: " +
    (ttsOn ? "روشن" : "خاموش");

  if (
    !ttsOn &&
    "speechSynthesis" in window
  ) {
    speechSynthesis.cancel();
  }
};

// ---------- شروع ----------
renderNav();

flow.run(true);

// ---------- کارت‌های نورانی ----------
const fine = matchMedia(
  "(hover: hover) and (pointer: fine)"
).matches;

let ptr = null;

if (fine) {
  document.addEventListener(
    "pointermove",
    (e) => {
      ptr = e;

      if (ptr.pending) return;

      ptr.pending = true;

      requestAnimationFrame(() => {
        const s =
          document.documentElement.style;

        s.setProperty(
          "--x",
          ptr.clientX.toFixed(1)
        );

        s.setProperty(
          "--y",
          ptr.clientY.toFixed(1)
        );

        s.setProperty(
          "--xp",
          (ptr.clientX / innerWidth).toFixed(3)
        );

        ptr.pending = false;
      });
    }
  );
}

if (fine) {
  document
    .querySelectorAll("#view-home .card")
    .forEach((c) => {
      c.classList.add("glow");

      const g =
        document.createElement("div");

      g.className = "glow-in";
      g.setAttribute(
        "aria-hidden",
        "true"
      );

      c.prepend(g);
    });
}

// ---------- تم تیره / روشن ----------
const themeBtn = $("themeSwitch");
const thumb =
  themeBtn.querySelector(".ts-thumb");

function applyTheme(t) {
  document.documentElement.dataset.theme = t;

  themeBtn.setAttribute(
    "aria-checked",
    t === "dark"
  );

  themeBtn.setAttribute(
    "aria-label",
    t === "dark"
      ? "تغییر به حالت روشن"
      : "تغییر به حالت تیره"
  );

  flow.refresh();
}

themeBtn.onclick = () => {
  const next =
    document.documentElement.dataset.theme ===
    "dark"
      ? "light"
      : "dark";

  for (let i = 0; i < 3; i++) {
    const p =
      document.createElement("i");

    p.className = "ts-p";

    p.style.setProperty(
      "--del",
      i * 0.1 + "s"
    );

    p.style.setProperty(
      "--dur",
      (next === "dark"
        ? 0.5
        : 0.6 + i * 0.1) + "s"
    );

    thumb.appendChild(p);

    setTimeout(
      () => p.remove(),
      1000
    );
  }

  try {
    localStorage.setItem(
      "emam_theme",
      next
    );
  } catch {}

  applyTheme(next);
};

applyTheme(
  document.documentElement.dataset.theme ===
    "light"
    ? "light"
    : "dark"
);

// ---------- صفحه‌ی بارگذاری ----------
$("preSlot").replaceWith(
  mkLoader(150)
);

function hidePre() {
  const p = $("preloader");

  if (!p) return;

  setTimeout(() => {
    p.classList.add("done");
    document.body.classList.add("ready");

    setTimeout(
      () => p.remove(),
      700
    );
  }, Math.max(0, 900 - performance.now()));
}

document.readyState === "complete"
  ? hidePre()
  : addEventListener(
      "load",
      hidePre
    );

setTimeout(hidePre, 3000);

// ---------- منوی کاربر ----------
const ICONS = {
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',

  plus: '<path d="M12 5v14M5 12h14"/>',

  clock:
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',

  user:
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',

  grid:
    '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',

  theme:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',

  out:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',

  doc:
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',

  chev:
    '<path d="m15 18-6-6 6-6"/>'
};

const svgIco = (n, s = 18) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

const inChat = (fn) => () => {
  openChat(chat?.mode || "chat");
  fn();
};

const PROFILE_ITEMS = [
  {
    icon: "chat",
    label: "گفتگوی هوشمند",
    act: () => openChat("chat")
  },

  {
    icon: "plus",
    label: "گفتگوی جدید",
    act: () => {
      openChat("chat");
      saveChat();
      newChat("chat");
    }
  },

  {
    icon: "clock",
    label: "حافظه چت",
    act: inChat(() =>
      $("historyBtn").click()
    )
  },

  {
    icon: "user",
    label: "شخصیت دستیار",
    act: inChat(() =>
      $("personaBtn").click()
    )
  },

  {
    icon: "doc",
    label: "جستجو در اسناد (RAG)",
    badge: () => (isRagOn() ? ["روشن", true] : ["خاموش", false]),
    act: inChat(() => $("ragBtn").click())
  },

  {
    icon: "grid",
    label: "ابزارها",
    act: () => {
      show("home", true);
      $("tools").scrollIntoView();
    }
  },

  {
    icon: "theme",
    label: "تغییر تم",
    act: () => themeBtn.click(),
    sep: true
  }
];

function renderProfile() {
  const u = session();
  const p = $("profilePanel");

  let i = 0;

  p.innerHTML = "";

  const add = (el) => {
    el.classList.add("pi");
    el.style.setProperty(
      "--i",
      i++
    );
    p.appendChild(el);
    return el;
  };

  const head =
    add(document.createElement("div"));

  head.className = "p-head";

  head.innerHTML =
    '<span class="av"></span><div class="p-info"><span class="pn"></span><span class="pe"></span></div>';

  head.querySelector(".av").textContent =
    (u.name.trim()[0] || "?").toUpperCase();

  head.querySelector(".pn").textContent =
    u.name;

  head.querySelector(".pe").textContent =
    u.email;

  add(document.createElement("hr"));

  const nav =
    document.createElement("div");

  nav.setAttribute(
    "role",
    "navigation"
  );

  nav.setAttribute(
    "aria-label",
    "منوی کاربر"
  );

  p.appendChild(nav);

  PROFILE_ITEMS.forEach((it) => {
    if (it.sep) {
      const s =
        document.createElement("div");

      s.className = "psep pi";

      s.style.setProperty(
        "--i",
        i++
      );

      nav.appendChild(s);
    }

    const b =
      document.createElement("button");

    b.type = "button";
    b.className = "pitem pi";

    b.style.setProperty(
      "--i",
      i++
    );

    b.innerHTML =
      svgIco(it.icon) +
      "<span></span>" +
      `<span class="chev">${svgIco(
        "chev",
        16
      )}</span>`;

    b.children[1].textContent =
      it.label;

    if (it.badge) {
      const [txt, on] = it.badge();
      const bd = document.createElement("em");
      bd.className = "pbadge" + (on ? " on" : "");
      bd.textContent = txt;
      b.insertBefore(bd, b.children[2]);
    }

    b.onclick = () => {
      toggleProfile(false);
      it.act();
    };

    nav.appendChild(b);
  });

  const foot =
    add(document.createElement("div"));

  foot.className = "pfoot";

  foot.innerHTML =
    `<button type="button" id="logout" class="pitem danger">${svgIco("out")}<span>خروج از حساب</span></button>`;
}

function toggleProfile(open) {
  const p = $("profilePanel");
  const ov = $("profileOv");
  const b = $("userBtn");

  if (open === undefined) {
    open = p.classList.contains("hidden");
  }

  if (open && !session()) return;

  if (open) {
    renderProfile();

    p.classList.remove("hidden");
    ov.classList.remove("hidden");

    void p.offsetWidth;

    p.classList.add("open");

    b?.setAttribute(
      "aria-expanded",
      "true"
    );

    p.querySelector(
      ".pitem"
    )?.focus();
  } else {
    p.classList.add("hidden");
    p.classList.remove("open");
    ov.classList.add("hidden");

    b?.setAttribute(
      "aria-expanded",
      "false"
    );
  }
}

document.addEventListener(
  "click",
  (e) => {
    if (e.target.closest("#userBtn")) {
      toggleProfile();
    }
  }
);

$("profileOv").onclick = () =>
  toggleProfile(false);

document.addEventListener(
  "keydown",
  (e) => {
    if (
      e.key === "Escape" &&
      !$("profilePanel").classList.contains(
        "hidden"
      )
    ) {
      toggleProfile(false);
      $("userBtn")?.focus();
    }
  }
);

// ---------- درباره من، تماس و ابزارهای صفحه ----------
async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    const a =
      document.createElement("textarea");

    a.value = t;
    document.body.appendChild(a);
    a.select();

    try {
      document.execCommand("copy");
    } catch {}

    a.remove();
  }

  toast("کپی شد.");
}

document.addEventListener(
  "click",
  (e) => {
    const c =
      e.target.closest("[data-copy]");

    if (c) {
      copyText(c.dataset.copy);
    }
  }
);

$("contactForm").addEventListener(
  "submit",
  (e) => {
    e.preventDefault();

    const name =
      $("cName").value.trim();

    const msg =
      $("cMsg").value.trim();

    if (msg.length < 5) {
      return (
        $("cErr").textContent =
          "پیام را کمی کامل‌تر بنویس."
      );
    }

    $("cErr").textContent = "";

    const body =
      (name
        ? "از طرف: " + name + "\n\n"
        : "") + msg;

    location.href =
      "mailto:aryanikbakht88@gmail.com?subject=" +
      encodeURIComponent(
        "پیام از سایت EMAM cj"
      ) +
      "&body=" +
      encodeURIComponent(body);

    toast(
      "برنامه‌ی ایمیل شما باز می‌شود."
    );
  }
);

// منوی موبایل
const mm = $("mobileMenu");
const mb = $("menuBtn");

const setMenu = (open) => {
  mm.classList.toggle(
    "hidden",
    !open
  );

  mb.setAttribute(
    "aria-expanded",
    open
  );
};

mb.onclick = () =>
  setMenu(
    mm.classList.contains("hidden")
  );

document.addEventListener(
  "click",
  (e) => {
    if (
      !e.target.closest(
        "#mobileMenu, #menuBtn"
      )
    ) {
      setMenu(false);
    } else if (
      e.target.closest(
        "#mobileMenu a"
      )
    ) {
      setMenu(false);
    }
  }
);

document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Escape") {
      setMenu(false);
    }
  }
);

addEventListener(
  "resize",
  () => {
    if (innerWidth > 860) {
      setMenu(false);
    }
  }
);

// دکمه‌ی بازگشت به بالا
const topBtn = $("toTop");

let topTick = false;

addEventListener(
  "scroll",
  () => {
    if (topTick) return;

    topTick = true;

    requestAnimationFrame(() => {
      topBtn.classList.toggle(
        "hidden",
        scrollY < 700
      );

      topTick = false;
    });
  },
  {
    passive: true
  }
);

topBtn.onclick = () =>
  scrollTo({
    top: 0,
    behavior: "smooth"
  });

// ===== ورود جدید EMAM cj: افکت سه‌بعدی و نمایش رمز =====
(() => {
  const stage = $("authStage");
  const pass = $("password");
  const toggle = $("passwordToggle");

  if (toggle && pass) {
    toggle.addEventListener(
      "click",
      () => {
        const showing =
          pass.type === "text";

        pass.type = showing
          ? "password"
          : "text";

        toggle.classList.toggle(
          "showing",
          !showing
        );

        toggle.setAttribute(
          "aria-label",
          showing
            ? "نمایش رمز عبور"
            : "پنهان کردن رمز عبور"
        );
      }
    );
  }

  if (!stage) return;

  const fine =
    matchMedia(
      "(hover:hover) and (pointer:fine)"
    ).matches;

  const move = (e) => {
    if (
      !fine ||
      $("view-auth").classList.contains(
        "hidden"
      )
    ) {
      return;
    }

    const r =
      stage.getBoundingClientRect();

    const x =
      (e.clientX - r.left) /
        r.width -
      0.5;

    const y =
      (e.clientY - r.top) /
        r.height -
      0.5;

    stage.style.transform =
      `rotateY(${x * 5}deg) rotateX(${y * -5}deg)`;
  };

  const reset = () => {
    stage.style.transform =
      "rotateY(0deg) rotateX(0deg)";
  };

  document.addEventListener(
    "mousemove",
    move
  );

  stage.addEventListener(
    "mouseleave",
    reset
  );
})();

// ---------- قابلیت‌های متحرک صفحه اصلی ----------
(() => {
  const wrap =
    document.querySelector(
      "#capabilityMarquee"
    );

  if (!wrap) return;

  const update = () => {
    const rect =
      wrap.getBoundingClientRect();

    const center =
      rect.top +
      rect.height / 2;

    const max =
      rect.height * 0.48 || 1;

    wrap
      .querySelectorAll(
        ".capability-item"
      )
      .forEach((el) => {
        const r =
          el.getBoundingClientRect();

        const d = Math.min(
          Math.abs(
            center -
              (r.top + r.height / 2)
          ) / max,
          1
        );

        el.style.opacity =
          String(
            0.25 +
              (1 - d) * 0.75
          );
      });

    requestAnimationFrame(update);
  };

  requestAnimationFrame(update);

  wrap
    .querySelectorAll(
      ".capability-item[data-chat]"
    )
    .forEach((item) => {
      item.addEventListener(
        "click",
        () =>
          openChat(
            item.dataset.chat
          )
      );

      item.setAttribute(
        "tabindex",
        "0"
      );

      item.addEventListener(
        "keydown",
        (e) => {
          if (
            e.key === "Enter" ||
            e.key === " "
          ) {
            e.preventDefault();

            openChat(
              item.dataset.chat
            );
          }
        }
      );
    });
})();
