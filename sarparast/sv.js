/* پروژه‌یار · نسخهٔ سرپرست کارگاه
   Loaded first on every page of /sarparast/. It
   1) keeps this app's data apart from the owner's app (every storage key and database name gets the "sv:" prefix),
   2) exposes window.SV (who the supervisor is, which project, deletions to report),
   3) hides what the supervisor may not use (staff, wages, invoices, other projects, the owner's signature),
   4) in the Android app, makes "save / send file" and "copy" work through the phone's share sheet. */
(function () {
  "use strict";
  var P = "sv:";

  /* ---------- 1. separate storage ---------- */
  try {
    var SP = Storage.prototype, g = SP.getItem, s = SP.setItem, r = SP.removeItem;
    if (!SP.__sv) {
      SP.getItem = function (k) { return g.call(this, P + k); };
      SP.setItem = function (k, v) { return s.call(this, P + k, v); };
      SP.removeItem = function (k) { return r.call(this, P + k); };
      SP.__sv = 1;
    }
  } catch (e) {}
  try {
    if (window.indexedDB && !indexedDB.__sv) {
      var op = indexedDB.open.bind(indexedDB), dl = indexedDB.deleteDatabase.bind(indexedDB);
      indexedDB.open = function (name, v) { return v === undefined ? op("sv-" + name) : op("sv-" + name, v); };
      indexedDB.deleteDatabase = function (name) { return dl("sv-" + name); };
      indexedDB.__sv = 1;
    }
  } catch (e) {}

  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var cfg = read("sv-cfg");
  var isApp = !!(window.Capacitor && (window.androidBridge || (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : window.Capacitor.platform && window.Capacitor.platform !== "web")));
  var book = (location.pathname.match(/\/(karkard|anbar|resid|notes)\/?(index\.html)?$/) || [])[1] || "home";

  /* a book opened before the phone is set up goes back to the start page */
  if (!cfg && book !== "home" && book !== "notes" && !/#v=/.test(location.hash)) { location.replace("../"); return; }

  window.SV = {
    app: isApp,
    book: book,
    cfg: cfg,
    code: (cfg && cfg.code) || "S",
    name: (cfg && cfg.name) || "سرپرست کارگاه",
    /* something the owner already has was deleted here: the next report tells the owner to delete it too */
    gone: function (kind, id) {
      var gn = read("sv-gone") || {};
      gn[kind] = gn[kind] || {}; gn[kind][id] = Date.now();
      write("sv-gone", gn);
    },
    read: read,
    write: write
  };

  /* ---------- 3. what this user does not see ---------- */
  var HIDE = {
    karkard: [
      '[data-tab="f"]',                 /* فاکتور دستمزد، گزارش عملکرد، فیش حقوقی */
      "#leaveCard",                     /* مرخصی و غیبت کارمندان */
      '#pfPay [data-pay="hourly"]',     /* تعریف کارمند */
      "#pfDailyBox", "#pfHourlyBox",    /* دستمزد و حقوق */
      ".card:has(#stTitle)",            /* تنظیمات پروژه */
      ".card:has(#bkSave)"              /* پشتیبان جداگانه (پشتیبان از صفحهٔ اول است) */
    ],
    anbar: ['[data-act="loc"][data-v="C"]'],
    resid: [],
    notes: [],
    home: []
  };
  var css = "[data-sgn]{display:none!important}" + (HIDE[book] || []).map(function (q) { return q + "{display:none!important}"; }).join("");
  css += '#saProj::after,.sa-proj::after{content:none!important}a.sa-proj,#saProj{pointer-events:none}';
  var st = document.createElement("style"); st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
  document.documentElement.classList.add("sv", "sv-" + book);

  /* ---------- 4. Android app: files and clipboard through native plugins ---------- */
  if (isApp) {
    var C = window.Capacitor;
    var call = function (plugin, method, args) {
      var p = C.Plugins && C.Plugins[plugin];
      if (p && typeof p[method] === "function") return p[method](args || {});
      return C.nativePromise(plugin, method, args || {});
    };
    var b64 = function (blob) {
      return new Promise(function (ok, no) {
        var fr = new FileReader();
        fr.onload = function () { ok(String(fr.result).split(",")[1] || ""); };
        fr.onerror = function () { no(fr.error); };
        fr.readAsDataURL(blob);
      });
    };
    var safeName = function (n) { return String(n || "file").replace(/[\\/:*?"<>|]+/g, "-"); };
    var share = async function (data) {
      data = data || {};
      var files = data.files || [], urls = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i], path = "share/" + Date.now() + "-" + safeName(f.name);
        var res = await call("Filesystem", "writeFile", { path: path, data: await b64(f), directory: "CACHE", recursive: true });
        urls.push(res.uri);
      }
      var opts = { dialogTitle: "ارسال یا ذخیره" };
      if (urls.length) opts.files = urls;
      if (data.text) opts.text = data.text;
      if (data.title) opts.title = data.title;
      if (data.url) opts.url = data.url;
      try { await call("Share", "share", opts); }
      catch (e) {
        var m = String((e && (e.message || e.errorMessage)) || e);
        if (/cancel/i.test(m)) { var ab = new Error("canceled"); ab.name = "AbortError"; throw ab; }
        throw e;
      }
    };
    try {
      Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
      Object.defineProperty(navigator, "canShare", { value: function () { return true; }, configurable: true, writable: true });
    } catch (e) {}
    try {
      var clip = { writeText: function (t) { return call("Clipboard", "write", { string: String(t) }); },
                   readText: function () { return call("Clipboard", "read", {}).then(function (r) { return r.value || ""; }); } };
      Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true });
    } catch (e) {}
    /* the app keeps everything on the phone already; no offline cache needed */
    try { if (navigator.serviceWorker) navigator.serviceWorker.register = function () { return Promise.reject(new Error("off")); }; } catch (e) {}
  }
})();
