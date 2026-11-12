/* پروژه‌یار — کاربر «سرپرست کارگاه»، سمت صاحب برنامه.
   SVSYNC.setupFile(project, user)  → فایل راه‌اندازی گوشی سرپرست: فقط همین پروژه، بدون کارمندها و بدون دستمزدها.
   SVSYNC.importReport(data)        → گزارشی که سرپرست می‌فرستد با دفترهای این گوشی یکی می‌شود
                                      (کارکرد، انبار، رسید؛ هزینه‌های رسید و فاکتورهای انبار در دفتر حساب همان پروژه).
   Nothing here deletes the owner's own records: staff entries, leaves and the owner's records stay as they are. */
(function () {
  "use strict";
  var KK = "karkard-v2", AK = "anbar-v1", RK = "resid-v1", HK = "daftar-proje-v1";
  var PD = "۰۱۲۳۴۵۶۷۸۹";
  function fa(s) { return String(s).replace(/\d/g, function (d) { return PD[+d]; }); }
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function write(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function norm(s) { return String(s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\s‌‏‎]/g, "").trim(); }
  function hid() { return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  /* same content, whatever the key order */
  function canon(o) { return JSON.stringify(o, function (k, v) { return v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).sort().reduce(function (r, x) { r[x] = v[x]; return r; }, {}) : v; }); }
  function vals(o) { return Object.keys(o || {}).map(function (k) { return o[k]; }); }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  var iso = function (t) { return "⁦" + t + "⁩"; };

  /* ---------- Jalali date of a timestamp (same as the books) ---------- */
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
  function jDate(ts) { var t = new Date(ts), j = g2j(t.getFullYear(), t.getMonth() + 1, t.getDate()); return j[0] + "/" + p2(j[1]) + "/" + p2(j[2]); }

  /* ---------- karkard helpers ---------- */
  function isStaff(p, groups) {
    if (!p) return false;
    var g = p.groupId && groups && groups[p.groupId];
    if (g && g.kind === "contractor") return false;
    return p.pay === "hourly";
  }
  function inProj(x, kid) { return !(x && Array.isArray(x.projects) && x.projects.length) || x.projects.indexOf(kid) >= 0; }
  function onlyProj(x, kid) { if (x && Array.isArray(x.projects) && x.projects.length) x.projects = [kid]; return x; }
  function remapProj(x, from, to) { if (x && Array.isArray(x.projects)) x.projects = x.projects.map(function (id) { return id === from ? to : id; }); return x; }

  /* ---------- setup file for the supervisor's phone ---------- */
  function setupFile(sp, user) {
    var K = read(KK) || {}, kid = sp.links && sp.links.karkard, groups = {}, people = {}, days = {}, kproj = null;
    if (kid && K.projects && K.projects[kid]) {
      kproj = clone(K.projects[kid]); kproj.id = kid; kproj.lastInvoice = 0;
      vals(K.groups).forEach(function (g) { if (g && g.id && inProj(g, kid)) groups[g.id] = onlyProj(clone(g), kid); });
      vals(K.people).forEach(function (p) {
        if (!p || !p.id || isStaff(p, K.groups) || !inProj(p, kid)) return;
        var q = onlyProj(clone(p), kid);
        delete q.dailyWage; delete q.otRate; delete q.hourly; delete q.monthly;
        people[q.id] = q;
      });
      Object.keys(K.days || {}).forEach(function (id) {
        var d = K.days[id]; if (!d || d.project !== kid) return;
        var x = clone(d), e = {}, c = {};
        Object.keys(x.entries || {}).forEach(function (pid) { if (people[pid]) e[pid] = x.entries[pid]; });
        Object.keys(x.crews || {}).forEach(function (gid) { if (groups[gid]) c[gid] = x.crews[gid]; });
        x.entries = e; x.crews = c; x.leaves = {};
        days[id] = x;
      });
    }
    var A = read(AK) || {}, docs = {}, items = {};
    vals(A.docs).forEach(function (d) {
      if (!d || d.projId !== sp.id) return;
      docs[d.id] = clone(d);
      (d.lines || []).forEach(function (L) { if (A.items && A.items[L.i]) items[L.i] = clone(A.items[L.i]); });
    });
    var R = read(RK) || {};
    var users = read("sv-users") || {};
    users[user.code] = { name: user.name, projId: sp.id, projName: sp.name, setupAt: Date.now(), lastImport: (users[user.code] || {}).lastImport || 0 };
    write("sv-users", users);
    return {
      app: "sarparast-setup", v: 1, created: Date.now(),
      user: { name: user.name, code: user.code },
      project: { id: sp.id, name: sp.name, employer: sp.employer || "", contractor: sp.contractor || "" },
      kproj: kproj,
      karkard: { groups: groups, people: people, days: days, holidays: clone(K.holidays || {}) },
      anbar: { items: items, docs: docs, cats: clone(A.cats || []), cons: clone(A.cons || []) },
      resid: { cats: clone(R.cats || []), drivers: clone(R.drivers || {}), issuer: R.issuer || "" }
    };
  }

  /* ---------- دفتر حساب rows (same shape as the books write) ---------- */
  function hesabOf(sp) {
    var hl = sp && sp.links && sp.links.hesab; if (!hl) return null;
    var h = read(HK); if (!h) return null;
    return { h: h, pre: hl === "main" ? "" : "projects/" + hl + "/" };
  }
  function col(t, c) { return (t.h[t.pre + c] = t.h[t.pre + c] || {}); }
  function findOrMake(bag, name, extra) {
    for (var id in bag) if ((bag[id].name || "").trim() === name) return id;
    var nid = hid(); bag[nid] = Object.assign({ name: name }, extra || {}); return nid;
  }
  function nextNo(exp) { return vals(exp).reduce(function (m, e) { return Math.max(m, +e.no || 0); }, 0) + 1; }
  function hasRow(t, key, id) { return vals(col(t, "expenses")).some(function (e) { return e && e[key] === id; }); }
  function dropRows(t, key, id) { var exp = col(t, "expenses"), n = 0; for (var k in exp) if (exp[k] && exp[k][key] === id) { delete exp[k]; n++; } return n; }

  function plateText(s) {
    var m = /^(\d{2})([^\d-]+)(\d{3})-(\d{2})$/.exec(s || "");
    if (m) return [fa(m[1]), m[2], fa(m[3]), "ایران", fa(m[4])].join(" ");
    m = /^(\d{3})-(\d{5})$/.exec(s || "");
    if (m) return fa(m[1]) + " - " + fa(m[2]);
    return s || "";
  }
  function residRow(t, r) {
    var catName = r.kind === "cost" ? (r.cat || "متفرقه") : "حمل و نقل";
    var who = r.name || (r.plate ? (r.kind === "moto" ? "پیک موتوری " : "راننده ") + plateText(r.plate) : "");
    var date = jDate(r.ts), exp = col(t, "expenses");
    exp[hid()] = { no: nextNo(exp), date: date, desc: (r.desc || catName) + " — رسید " + iso(fa(r.serial)), cat: findOrMake(col(t, "cats"), catName),
      party: who ? findOrMake(t.h.parties = t.h.parties || {}, who, { role: "سایر" }) : "",
      total: r.amount, paid: r.amount, pays: [{ d: date, a: r.amount, b: "" }], ref: r.track || r.serial, resid: r.id };
  }
  function fq(n) { n = Math.round((+n || 0) * 100) / 100; var p = Math.abs(n).toString().split("."); return fa(p[0].replace(/\B(?=(\d{3})+(?!\d))/g, "٬") + (p[1] ? "٫" + p[1] : "")); }
  function anbarRow(t, d, items) {
    var ls = (d.lines || []).map(function (L) { var it = items[L.i]; return it ? it.name + " " + fq(L.q) + " " + it.unit : ""; }).filter(Boolean);
    var desc = "خرید برای انبار: " + ls.slice(0, 3).join("، ") + (ls.length > 3 ? " و " + fa(ls.length - 3) + " قلم دیگر" : "");
    if (desc.length > 110) desc = desc.slice(0, 107) + "…";
    var date = jDate(d.ts), exp = col(t, "expenses"), id = hid();
    exp[id] = { no: nextNo(exp), date: date, desc: desc, cat: findOrMake(col(t, "cats"), "مصالح و تجهیزات"),
      party: d.supplier ? findOrMake(t.h.parties = t.h.parties || {}, d.supplier, { role: "سایر" }) : "",
      total: d.amount, paid: d.paid ? d.amount : 0, pays: d.paid ? [{ d: date, a: d.amount, b: "" }] : [], ref: d.inv || "", anbar: d.id };
    return id;
  }

  /* slip photos of رسیدها live in IndexedDB "daftar-resid" / "slips" */
  function slipsPut(list, delIds) {
    return new Promise(function (ok) {
      if (!window.indexedDB || (!list.length && !delIds.length)) return ok();
      var q = indexedDB.open("daftar-resid", 1);
      q.onupgradeneeded = function () { q.result.createObjectStore("slips"); };
      q.onerror = function () { ok(); };
      q.onsuccess = function () {
        var t = q.result.transaction("slips", "readwrite"), s = t.objectStore("slips");
        list.forEach(function (x) { s.put(x[1], x[0]); });
        delIds.forEach(function (id) { s.delete(id); });
        t.oncomplete = function () { ok(); }; t.onerror = function () { ok(); };
      };
    });
  }

  /* ---------- the supervisor's report comes in ---------- */
  async function importReport(d) {
    if (!d || d.app !== "sarparast-report" || !d.project) throw new Error("این فایل گزارش سرپرست نیست.");
    var r = SA.load(), sp = r.list.filter(function (x) { return x.id === d.project.id; })[0] || r.list.filter(function (x) { return norm(x.name) === norm(d.project.name); })[0];
    if (!sp) {
      if (!confirm("پروژهٔ «" + d.project.name + "» در این گوشی نیست. ساخته شود و اطلاعات سرپرست در آن بنشیند؟")) return null;
      SA.upsert({ id: d.project.id, name: d.project.name, employer: d.project.employer || "", contractor: d.project.contractor || "", links: {} });
      sp = SA.load().list.filter(function (x) { return x.id === d.project.id; })[0];
    }
    var svPid = d.project.id, gone = d.gone || {}, sum = { days: 0, docs: 0, resid: 0, hesab: 0, del: 0, noHesab: 0 };

    /* --- دفتر کارکرد --- */
    var K = read(KK) || {}; ["projects", "groups", "people", "days", "holidays"].forEach(function (c) { K[c] = K[c] || {}; });
    var kk = d.karkard || {}, svKid = d.kproj && d.kproj.id, kid = sp.links && sp.links.karkard;
    if (kid && !K.projects[kid]) kid = null;
    if (!kid && svKid) {
      if (!K.projects[svKid]) { var np = clone(d.kproj); np.name = sp.name; np.updatedAt = Date.now(); K.projects[svKid] = np; }
      kid = svKid; SA.link("karkard", sp.id, kid);
    }
    if (kid) {
      var svPeople = kk.people || {}, svGroups = kk.groups || {};
      Object.keys(svGroups).forEach(function (gid) { if (!K.groups[gid]) K.groups[gid] = remapProj(clone(svGroups[gid]), svKid, kid); });
      Object.keys(svPeople).forEach(function (pid) { if (!K.people[pid]) K.people[pid] = remapProj(clone(svPeople[pid]), svKid, kid); });
      var mine = function (pid) { return !svPeople[pid]; };            /* the owner's own people (staff etc.) */
      var svDates = {};
      vals(kk.days).forEach(function (sd) {
        if (!sd || !sd.date) return;
        svDates[sd.date] = 1;
        var key = kid + "__" + sd.date, own = K.days[key], ent = {}, crews = {};
        if (own) {
          Object.keys(own.entries || {}).forEach(function (pid) { if (mine(pid)) ent[pid] = own.entries[pid]; });
          Object.keys(own.crews || {}).forEach(function (gid) { if (!svGroups[gid]) crews[gid] = own.crews[gid]; });
        }
        Object.assign(ent, sd.entries || {}); Object.assign(crews, sd.crews || {});
        var nd = { project: kid, date: sd.date, entries: ent, crews: crews, leaves: (own && own.leaves) || {}, note: sd.note || (own && own.note) || "", updatedAt: Math.max(sd.updatedAt || 0, (own && own.updatedAt) || 0) };
        if (!own || canon(Object.assign({}, own, { updatedAt: 0 })) !== canon(Object.assign({}, nd, { updatedAt: 0 }))) { sum.days++; nd.updatedAt = Date.now(); }
        K.days[key] = nd;
      });
      Object.keys(gone.days || {}).forEach(function (gid) {
        var date = String(gid).split("__")[1]; if (!date || svDates[date]) return;
        var key = kid + "__" + date, own = K.days[key]; if (!own) return;
        var ent = {}; Object.keys(own.entries || {}).forEach(function (pid) { if (mine(pid)) ent[pid] = own.entries[pid]; });
        if (!Object.keys(ent).length && !Object.keys(own.leaves || {}).length) delete K.days[key];
        else K.days[key] = Object.assign({}, own, { entries: ent, crews: {}, updatedAt: Date.now() });
        sum.del++;
      });
      write(KK, K);
    }

    sp = SA.load().list.filter(function (x) { return x.id === sp.id; })[0];
    var T = hesabOf(sp);

    /* --- دفتر انبار --- */
    var A = read(AK) || {}; A.items = A.items || {}; A.docs = A.docs || {}; A.seq = A.seq || {}; A.cons = A.cons || []; A.cats = A.cats || [];
    var ab = d.anbar || {}, catMap = {}, itemMap = {};
    (ab.cats || []).forEach(function (c) {
      var hit = A.cats.filter(function (x) { return x.id === c.id; })[0] || A.cats.filter(function (x) { return norm(x.name) === norm(c.name); })[0];
      if (!hit) { hit = clone(c); A.cats.push(hit); }
      catMap[c.id] = hit.id;
    });
    vals(ab.items).forEach(function (it) {
      if (!it || !it.id) return;
      if (A.items[it.id]) { itemMap[it.id] = it.id; return; }
      var hit = vals(A.items).filter(function (x) { return x && norm(x.name) === norm(it.name); })[0];
      if (hit) { itemMap[it.id] = hit.id; return; }
      var n = clone(it); n.cat = catMap[it.cat] || it.cat || ""; A.items[n.id] = n; itemMap[it.id] = n.id;
    });
    var loc = function (l) { return l === "S:" + svPid ? "S:" + sp.id : l; };
    vals(ab.docs).forEach(function (sd) {
      if (!sd || !sd.id) return;
      if (sd.projId !== svPid && sd.projId !== sp.id) return;
      var own = A.docs[sd.id], nd = clone(sd);
      nd.projId = sp.id; nd.from = loc(nd.from); nd.to = loc(nd.to);
      nd.lines = (nd.lines || []).map(function (L) { return { i: itemMap[L.i] || L.i, q: L.q }; });
      if (own && own.hid) nd.hid = own.hid; else delete nd.hid;
      if (!own || canon(own) !== canon(nd)) sum.docs++;
      if (nd.amount > 0 && nd.type === "in") {
        if (T) { if (!hasRow(T, "anbar", nd.id)) { nd.hid = anbarRow(T, nd, A.items); sum.hesab++; } }
        else if (!nd.hid) sum.noHesab++;
      }
      A.docs[nd.id] = nd;
    });
    (ab.cons || []).forEach(function (n) { if (!A.cons.some(function (x) { return norm(x) === norm(n); })) A.cons.push(n); });
    Object.keys(gone.anbar || {}).forEach(function (id) {
      if (ab.docs && ab.docs[id]) return;
      var own = A.docs[id]; if (!own || own.projId !== sp.id) return;
      delete A.docs[id]; if (T) dropRows(T, "anbar", id); sum.del++;
    });
    write(AK, A);

    /* --- دفتر رسید --- */
    var R = read(RK) || {}; R.items = R.items || {}; R.cats = R.cats || []; R.drivers = R.drivers || {}; R.seq = R.seq || {};
    var rs = d.resid || {}, slipList = [], slipDel = [];
    vals(rs.items).forEach(function (sr) {
      if (!sr || !sr.id) return;
      var own = R.items[sr.id], nr = clone(sr);
      nr.projId = sp.id; nr.proj = sp.name; nr.inHesab = !!(own && own.inHesab);
      if (!own) sum.resid++;
      if (T) { if (!hasRow(T, "resid", nr.id)) { residRow(T, nr); sum.hesab++; } nr.inHesab = true; }
      else if (!nr.inHesab) sum.noHesab++;
      R.items[nr.id] = nr;
    });
    (rs.cats || []).forEach(function (c) { if (!R.cats.some(function (x) { return norm(x.name) === norm(c.name); })) R.cats.push(clone(c)); });
    Object.keys(rs.drivers || {}).forEach(function (pl) { if (!R.drivers[pl]) R.drivers[pl] = clone(rs.drivers[pl]); });
    (d.slips || []).forEach(function (x) { if (x && x[0] && R.items[x[0]]) slipList.push(x); });
    Object.keys(gone.resid || {}).forEach(function (id) {
      if (rs.items && rs.items[id]) return;
      if (!R.items[id]) return;
      delete R.items[id]; slipDel.push(id); if (T) dropRows(T, "resid", id); sum.del++;
    });
    write(RK, R);
    if (T) write(HK, T.h);
    await slipsPut(slipList, slipDel);

    var users = read("sv-users") || {}, code = (d.user && d.user.code) || "?";
    users[code] = Object.assign({}, users[code] || {}, { name: (d.user && d.user.name) || "سرپرست", projId: sp.id, projName: sp.name, lastImport: Date.now(), lastReport: d.created || 0 });
    write("sv-users", users);
    sum.project = sp.name; sum.user = (d.user && d.user.name) || "سرپرست";
    return sum;
  }

  window.SVSYNC = { setupFile: setupFile, importReport: importReport, users: function () { return read("sv-users") || {}; } };
})();
