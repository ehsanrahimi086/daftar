/* Project Super App — "امضای من": the owner's handwritten signature, stamped onto forms after a 4-digit PIN.
   Nothing here leaves the phone: the signature image and the PIN hash live in this app's localStorage only
   (never in the public site), and travel only inside the home page's backup file.
     sa-sign-img  : PNG data URL of the signature (transparent background)
     sa-sign-pin  : { s: salt, h: sha256(salt + pin) }
     sa-signs     : { [docKey]: { h: contentHash, ts } }   — a signature is shown only while the document still matches
     sa-sign-lock : { n: wrong tries, until: ms }
   API (window.SIGN): ready(), status(key, content), rec(key, content), sign(key, content, title) → Promise<rec|null>,
   unsign(key), image() → Promise<Image|null>, src(), when(ts), draw(ctx, box, rec, img, opts), setup(), html(key, content, opts) */
(function () {
  "use strict";
  var K_IMG = "sa-sign-img", K_PIN = "sa-sign-pin", K_RECS = "sa-signs", K_LOCK = "sa-sign-lock";
  var PD = "۰۱۲۳۴۵۶۷۸۹";
  function fa(s) { return String(s).replace(/\d/g, function (d) { return PD[+d]; }); }
  function lat(s) { return String(s == null ? "" : s).replace(/[۰-۹]/g, function (d) { return PD.indexOf(d); }).replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); }); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function getJ(k) { try { return JSON.parse(get(k) || "null"); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); return true; } catch (e) { return false; } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function g2j(gy, gm, gd) {
    var gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var jy = gy > 1600 ? 979 : 0; gy -= gy > 1600 ? 1600 : 621;
    var gy2 = gm > 2 ? gy + 1 : gy;
    var days = 365 * gy + ~~((gy2 + 3) / 4) - ~~((gy2 + 99) / 100) + ~~((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
    jy += 33 * ~~(days / 12053); days %= 12053;
    jy += 4 * ~~(days / 1461); days %= 1461;
    if (days > 365) { jy += ~~((days - 1) / 365); days = (days - 1) % 365; }
    var jm = days < 186 ? 1 + ~~(days / 31) : 7 + ~~((days - 186) / 30);
    var jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }
  function when(ts) { var t = new Date(ts), j = g2j(t.getFullYear(), t.getMonth() + 1, t.getDate()); return fa(j[0] + "/" + p2(j[1]) + "/" + p2(j[2])) + "، ساعت " + fa(p2(t.getHours()) + ":" + p2(t.getMinutes())); }

  /* content fingerprint (not a secret, just "has this document changed since it was signed") */
  function hashOf(content) {
    var s = typeof content === "string" ? content : JSON.stringify(content == null ? "" : content);
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
  }
  async function sha(s) {
    var b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
    return Array.from(b).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
  }

  function ready() { return !!(get(K_IMG) && getJ(K_PIN)); }
  function recs() { return getJ(K_RECS) || {}; }
  function status(key, content) { var r = recs()[key]; if (!r) return "none"; return r.h === hashOf(content) ? "ok" : "stale"; }
  function rec(key, content) { var r = recs()[key]; return r && r.h === hashOf(content) && get(K_IMG) ? r : null; }
  function unsign(key) { var r = recs(); delete r[key]; put(K_RECS, r); }
  var imgCache = null, imgSrc = null;
  function src() { return get(K_IMG); }
  function image() {
    var s = src(); if (!s) return Promise.resolve(null);
    if (imgCache && imgSrc === s) return Promise.resolve(imgCache);
    return new Promise(function (ok) { var im = new Image(); im.onload = function () { imgCache = im; imgSrc = s; ok(im); }; im.onerror = function () { ok(null); }; im.src = s; });
  }
  /* signature fitted into a box (canvas), with the signing time underneath */
  function draw(x, box, r, im, o) {
    if (!r || !im) return;
    o = o || {};
    var foot = o.foot == null ? 30 : o.foot, top = o.top == null ? 50 : o.top;
    var aw = box.w - 24, ah = box.h - top - foot;
    var sc = Math.min(aw / im.naturalWidth, ah / im.naturalHeight);
    var w = im.naturalWidth * sc, h = im.naturalHeight * sc;
    var ix = box.x + (box.w - w) / 2, iy = box.y + top + (ah - h) / 2;
    /* a pen line shrunk this much turns hairline-thin; a few offset copies give it back its weight */
    var t = sc < 0.35 ? 0.9 : sc < 0.6 ? 0.5 : 0;
    var offs = t ? [[0, 0], [t, 0], [-t, 0], [0, t], [0, -t]] : [[0, 0]];
    offs.forEach(function (o2) { x.drawImage(im, ix + o2[0], iy + o2[1], w, h); });
    if (foot) {
      x.save(); x.direction = "rtl"; x.textAlign = "center"; x.textBaseline = "alphabetic";
      x.fillStyle = o.muted || "#6B7388"; x.font = "500 " + (o.size || 18) + 'px "Vazirmatn", Tahoma, sans-serif';
      x.fillText("امضا شده " + when(r.ts), box.x + box.w / 2, box.y + box.h - 10);
      x.restore();
    }
  }

  // ---------- sheet ----------
  var css = '#sgnBack{position:fixed;inset:0;z-index:9999;background:rgba(3,6,14,.6);display:flex;align-items:flex-end;justify-content:center}' +
    '#sgnBox{direction:rtl;width:100%;max-width:520px;max-height:92vh;overflow:auto;background:#121B2F;color:#EDF0F7;border-radius:22px 22px 0 0;padding:20px 18px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -10px 30px rgba(0,0,0,.55);font-family:"Vazirmatn",Tahoma,sans-serif;border-top:1px solid rgba(255,255,255,.12)}' +
    '#sgnBox h2{margin:0 0 6px;font-size:19px;color:#E6CD94}#sgnBox p{margin:0 0 12px;color:#8F9AB2;font-size:14px;line-height:1.9}' +
    '#sgnBox .sg-pv{background:#FBFAF6;border-radius:14px;height:150px;display:flex;align-items:center;justify-content:center;margin:0 0 12px;overflow:hidden}#sgnBox .sg-pv img{max-width:88%;max-height:130px}' +
    '#sgnBox .sg-pv span{color:#8a8576;font-size:14px}' +
    '#sgnBox .sg-pin{display:block;width:100%;box-sizing:border-box;text-align:center;letter-spacing:14px;font-size:30px;padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#EDF0F7;margin:4px 0 8px;direction:ltr;font-family:inherit}' +
    '#sgnBox .sg-pin:focus{outline:2px solid #CFAE6A;outline-offset:1px}' +
    '#sgnBox .sg-err{color:#F2877C;font-size:14px;min-height:22px;margin:0 0 6px}' +
    '#sgnBox .sg-row{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap}' +
    '#sgnBox button{flex:1 1 0;min-height:48px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#EDF0F7;font:600 15px "Vazirmatn",Tahoma,sans-serif;padding:0 14px;cursor:pointer}' +
    '#sgnBox button.pri{background:#CFAE6A;border-color:#CFAE6A;color:#17110A}#sgnBox button.dng{color:#F2877C}#sgnBox button:disabled{opacity:.5}' +
    '#sgnBox label.pick{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:14px;border:1px dashed #CFAE6A;color:#E6CD94;cursor:pointer;font-weight:600;margin-bottom:6px}' +
    '.sg-slot{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%}.sg-slot img{max-width:100%;max-height:96px;box-sizing:border-box;background:#FBFAF6;border-radius:10px;padding:6px 10px}.sg-slot small{color:var(--sa-muted,#8F9AB2);font-size:12px}' +
    '.sg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:0 16px;border-radius:12px;border:1px solid var(--sa-gold,#CFAE6A);background:var(--sa-gold-soft,rgba(207,174,106,.14));color:var(--sa-gold-2,#E6CD94);font:600 14px "Vazirmatn",Tahoma,sans-serif;cursor:pointer}' +
    '.sg-btn svg{width:18px;height:18px}.sg-btn.ghost{border-color:rgba(255,255,255,.16);background:transparent;color:var(--sa-muted,#8F9AB2)}';
  function ensureCss() { if (document.getElementById("sgnCss")) return; var s = document.createElement("style"); s.id = "sgnCss"; s.textContent = css; document.head.appendChild(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21c3-1 5-3.5 6.5-6.5M14.5 4.5l5 5L10 19l-6 2 2-6z"/></svg>';
  var back = null, onClose = null;
  function open(html) {
    ensureCss(); close(true);
    back = document.createElement("div"); back.id = "sgnBack";
    back.innerHTML = '<div id="sgnBox" role="dialog" aria-modal="true">' + html + '</div>';
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.body.appendChild(back);
    return back.querySelector("#sgnBox");
  }
  function close(silent) { if (back) { back.remove(); back = null; } var f = onClose; onClose = null; if (f && !silent) f(); }
  function q(sel) { return back ? back.querySelector(sel) : null; }
  function pinField(id) { return '<input class="sg-pin" id="' + id + '" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="رمز چهاررقمی">'; }
  function pinVal(id) { var el = q("#" + id); return el ? lat(el.value).replace(/\D/g, "") : ""; }
  function focusPin(id) { var el = q("#" + id); if (el) setTimeout(function () { el.focus(); }, 60); }

  function lockLeft() { var l = getJ(K_LOCK); return l && l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 1000) : 0; }
  async function checkPin(pin) {
    var p = getJ(K_PIN); if (!p) return false;
    var ok = (await sha(p.s + pin)) === p.h, l = getJ(K_LOCK) || { n: 0, until: 0 };
    if (ok) { del(K_LOCK); return true; }
    l.n = (l.n || 0) + 1; if (l.n >= 5) { l.until = Date.now() + 60000; l.n = 0; }
    put(K_LOCK, l); return false;
  }
  async function setPin(pin) { var s = Math.random().toString(36).slice(2) + Date.now().toString(36); return put(K_PIN, { s: s, h: await sha(s + pin) }); }

  /* ask the PIN; resolves true/false */
  function askPin(title, hint) {
    return new Promise(function (done) {
      var finished = false;
      function end(v) { if (finished) return; finished = true; onClose = null; close(true); done(v); }
      open('<h2>' + esc(title) + '</h2><p>' + esc(hint || "رمز چهاررقمی امضا را وارد کنید.") + '</p>' +
        '<div class="sg-pv"><img alt="امضای شما" src="' + src() + '"></div>' + pinField("sgP") + '<div class="sg-err" id="sgE"></div>' +
        '<div class="sg-row"><button class="pri" type="button" id="sgOk">امضا کن</button><button type="button" id="sgNo">انصراف</button></div>');
      onClose = function () { if (!finished) { finished = true; done(false); } };
      async function go() {
        var left = lockLeft(); if (left) { q("#sgE").textContent = "چند بار رمز اشتباه زده شد؛ " + fa(left) + " ثانیه دیگر دوباره امتحان کنید."; return; }
        var v = pinVal("sgP"); if (v.length !== 4) { q("#sgE").textContent = "رمز چهار رقم است."; return; }
        q("#sgOk").disabled = true;
        var ok = await checkPin(v);
        if (!back) return;
        q("#sgOk").disabled = false;
        if (ok) end(true);
        else { q("#sgE").textContent = lockLeft() ? "پنج بار اشتباه شد؛ یک دقیقه صبر کنید." : "رمز درست نیست."; q("#sgP").value = ""; focusPin("sgP"); }
      }
      q("#sgOk").addEventListener("click", go);
      q("#sgP").addEventListener("input", function () { if (pinVal("sgP").length === 4) go(); });
      q("#sgNo").addEventListener("click", function () { end(false); });
      focusPin("sgP");
    });
  }

  /* picked image → transparent signature PNG. A ready-made transparent PNG is kept as is (only resized);
     a plain photo of a signature on paper gets its background removed. */
  function cleanImage(file) {
    return new Promise(function (ok, no) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(u);
        var sc = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight));
        var w = Math.max(1, Math.round(im.naturalWidth * sc)), h = Math.max(1, Math.round(im.naturalHeight * sc));
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        var x = c.getContext("2d"); x.drawImage(im, 0, 0, w, h);
        var d = x.getImageData(0, 0, w, h), a = d.data, n = w * h, i, transparent = 0;
        for (i = 0; i < n; i += 7) if (a[i * 4 + 3] < 200) transparent++;
        if (transparent < n / 7 * 0.2) {
          /* photo: background = bright paper, ink = what is clearly darker */
          var lum = new Float32Array(n), hist = new Uint32Array(256);
          for (i = 0; i < n; i++) { var L = 0.3 * a[i * 4] + 0.59 * a[i * 4 + 1] + 0.11 * a[i * 4 + 2]; lum[i] = L; hist[L | 0]++; }
          var acc = 0, paper = 255; for (var v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.5) { paper = v; break; } }
          var lo = paper - 45, hi = paper - 120;
          var R = 0, G = 0, B = 0, cnt = 0;
          for (i = 0; i < n; i++) if (lum[i] < hi) { R += a[i * 4]; G += a[i * 4 + 1]; B += a[i * 4 + 2]; cnt++; }
          var ink = cnt ? [R / cnt * 0.7, G / cnt * 0.7, B / cnt * 0.85] : [22, 36, 120];
          var minx = w, miny = h, maxx = 0, maxy = 0;
          for (i = 0; i < n; i++) {
            var al = Math.max(0, Math.min(1, (lo - lum[i]) / (lo - hi)));
            a[i * 4] = ink[0]; a[i * 4 + 1] = ink[1]; a[i * 4 + 2] = ink[2]; a[i * 4 + 3] = Math.round(al * 255);
            if (al > 0.2) { var px = i % w, py = (i / w) | 0; if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py; }
          }
          x.putImageData(d, 0, 0);
          if (maxx > minx && maxy > miny) {
            var pad = 12, cx = Math.max(0, minx - pad), cy = Math.max(0, miny - pad), cw = Math.min(w, maxx + pad) - cx, ch = Math.min(h, maxy + pad) - cy;
            var c2 = document.createElement("canvas"); c2.width = cw; c2.height = ch; c2.getContext("2d").drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch); c = c2;
          }
        }
        ok(c.toDataURL("image/png"));
      };
      im.onerror = function () { URL.revokeObjectURL(u); no(new Error("img")); };
      im.src = u;
    });
  }

  /* first-time setup and settings: signature image + PIN */
  function setup() {
    return new Promise(function (done) {
      var has = ready(), img = src(), step = "img";
      function finish(v) { onClose = null; close(true); done(v); }
      onClose = function () { done(ready()); };
      function viewImg() {
        open('<h2>امضای من</h2><p>' + (has ? "این امضا روی فرم‌ها می‌نشیند. برای عوض کردنش عکس تازه انتخاب کنید." : "فایل امضای تمیزشده (sign.png) را که Claude برایتان ساخته انتخاب کنید. اگر بعداً امضای تازه خواستید، عکسش را برای Claude بفرستید تا تمیزش کند.") + '</p>' +
          '<div class="sg-pv" id="sgPv">' + (img ? '<img alt="امضای شما" src="' + img + '">' : '<span>هنوز امضایی انتخاب نشده</span>') + '</div>' +
          '<label class="pick" for="sgFile">' + (img ? "انتخاب عکس دیگر" : "انتخاب عکس امضا") + '</label><input type="file" id="sgFile" accept="image/*" hidden>' +
          '<div class="sg-err" id="sgE"></div>' +
          '<div class="sg-row"><button class="pri" type="button" id="sgNext"' + (img ? "" : " disabled") + '>' + (has ? "ذخیره" : "ادامه: تعیین رمز") + '</button><button type="button" id="sgNo">بستن</button></div>' +
          (has ? '<div class="sg-row"><button type="button" id="sgChPin">عوض کردن رمز</button><button type="button" class="dng" id="sgRm">پاک کردن امضا از این گوشی</button></div>' : ''));
        onClose = function () { done(ready()); };
        q("#sgFile").addEventListener("change", async function (e) {
          var f = e.target.files && e.target.files[0]; if (!f) return;
          q("#sgE").textContent = "";
          try { img = await cleanImage(f); q("#sgPv").innerHTML = '<img alt="امضای شما" src="' + img + '">'; q("#sgNext").disabled = false; }
          catch (err) { q("#sgE").textContent = "این عکس باز نشد؛ عکس دیگری انتخاب کنید."; }
        });
        q("#sgNo").addEventListener("click", function () { finish(ready()); });
        q("#sgNext").addEventListener("click", async function () {
          if (!img) return;
          if (has) {
            if (img === src()) { finish(true); return; }
            var ok = await askPin("تأیید عوض کردن امضا", "برای عوض کردن امضا، رمز فعلی را وارد کنید.");
            if (!ok) { done(ready()); return; }
            if (!put(K_IMG, img)) { alert("حافظهٔ گوشی پر است؛ امضا ذخیره نشد."); done(ready()); return; }
            imgCache = null; done(true); return;
          }
          viewPin();
        });
        if (has) {
          q("#sgChPin").addEventListener("click", async function () {
            var ok = await askPin("عوض کردن رمز", "اول رمز فعلی را وارد کنید.");
            if (!ok) { done(ready()); return; }
            viewPin(true);
          });
          q("#sgRm").addEventListener("click", async function () {
            var ok = await askPin("پاک کردن امضا", "با پاک کردن، امضا از این گوشی برداشته می‌شود و فرم‌های امضاشده بدون امضا نشان داده می‌شوند. رمز را وارد کنید.");
            if (!ok) { done(ready()); return; }
            del(K_IMG); del(K_PIN); imgCache = null; done(false);
          });
        }
      }
      function viewPin(changing) {
        var first = "";
        open('<h2>' + (changing ? "رمز تازه" : "رمز امضا") + '</h2><p>یک رمز چهاررقمی انتخاب کنید. هر بار که دکمهٔ امضا را بزنید این رمز پرسیده می‌شود تا کس دیگری با گوشی شما امضا نزند.</p>' +
          '<div id="sgLbl" style="color:#E6CD94;font-size:14px;margin-bottom:4px">رمز را وارد کنید</div>' + pinField("sgP") + '<div class="sg-err" id="sgE"></div>' +
          '<div class="sg-row"><button class="pri" type="button" id="sgOk">ادامه</button><button type="button" id="sgNo">انصراف</button></div>');
        onClose = function () { done(ready()); };
        async function go() {
          var v = pinVal("sgP");
          if (v.length !== 4) { q("#sgE").textContent = "رمز باید چهار رقم باشد."; return; }
          if (!first) {
            if (/^(\d)\1{3}$/.test(v) || v === "1234" || v === "4321") { q("#sgE").textContent = "این رمز خیلی ساده است؛ رمز دیگری بزنید."; q("#sgP").value = ""; return; }
            first = v; q("#sgP").value = ""; q("#sgE").textContent = ""; q("#sgLbl").textContent = "یک بار دیگر همان رمز را بزنید"; q("#sgOk").textContent = "ذخیره"; focusPin("sgP"); return;
          }
          if (v !== first) { first = ""; q("#sgP").value = ""; q("#sgLbl").textContent = "رمز را وارد کنید"; q("#sgOk").textContent = "ادامه"; q("#sgE").textContent = "دو رمز یکی نبود؛ از اول بزنید."; focusPin("sgP"); return; }
          if (!changing && !put(K_IMG, img)) { q("#sgE").textContent = "حافظهٔ گوشی پر است؛ امضا ذخیره نشد."; return; }
          imgCache = null;
          await setPin(v); del(K_LOCK);
          finish(true);
        }
        q("#sgOk").addEventListener("click", go);
        q("#sgP").addEventListener("input", function () { if (pinVal("sgP").length === 4) go(); });
        q("#sgNo").addEventListener("click", function () { finish(ready()); });
        focusPin("sgP");
      }
      viewImg();
    });
  }

  /* sign a document: setup if needed, then PIN, then record */
  async function sign(key, content, title) {
    if (!ready()) { var ok0 = await setup(); if (!ok0) return null; }
    var ok = await askPin(title || "امضای فرم", "رمز چهاررقمی را بزنید تا امضای شما روی این فرم بنشیند.");
    if (!ok) return null;
    var r = recs(), rc = { h: hashOf(content), ts: Date.now() };
    r[key] = rc;
    if (!put(K_RECS, r)) { alert("حافظهٔ گوشی پر است؛ امضا ثبت نشد."); return null; }
    return rc;
  }
  async function unsignAsk(key) {
    var ok = await askPin("برداشتن امضا", "برای برداشتن امضا از این فرم رمز را وارد کنید.");
    if (ok) unsign(key);
    return ok;
  }

  /* on-screen slot for HTML views: signature (+time) when signed, otherwise a sign button.
     Buttons carry data-sgn="sign|unsign" and data-sgk=key for the page to wire up. */
  function html(key, content, o) {
    ensureCss(); o = o || {};
    var st = status(key, content), r = rec(key, content);
    if (r) return '<div class="sg-slot"><img alt="امضای شما" src="' + src() + '"><small>امضا شده ' + when(r.ts) + '</small>' +
      (o.noUnsign ? '' : '<button class="sg-btn ghost" type="button" data-sgn="unsign" data-sgk="' + esc(key) + '">برداشتن امضا</button>') + '</div>';
    return '<div class="sg-slot">' + (st === "stale" ? '<small style="color:var(--sa-amber,#F0A766)">بعد از امضا تغییر کرده؛ دوباره امضا کنید.</small>' : '') +
      '<button class="sg-btn" type="button" data-sgn="sign" data-sgk="' + esc(key) + '">' + PEN + '<span>' + esc(o.label || "امضای من") + '</span></button></div>';
  }

  window.SIGN = { ready: ready, status: status, rec: rec, sign: sign, unsign: unsign, unsignAsk: unsignAsk, image: image, src: src, when: when, draw: draw, setup: setup, html: html, hash: hashOf, PEN: PEN, css: ensureCss };
})();
