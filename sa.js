/* Project Super App — one shared list of projects for every book.
   The home page defines and picks the project; each book links it to its own record the first time it opens it.
   Stored in localStorage "sa-projects": { v, cur, list: [{ id, name, employer, contractor, links: { karkard, hesab } }] } */
(function () {
  "use strict";
  var KEY = "sa-projects";
  var PD = "۰۱۲۳۴۵۶۷۸۹";
  function fa(s) { return String(s).replace(/\d/g, function (d) { return PD[+d]; }); }
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function norm(s) { return String(s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\s‌‏‎]/g, "").trim(); }
  /* names the user confirmed are the same project, spelled differently in different books */
  var SAME = { "دراشیب": "دزاشیب" };
  function canon(name) { var n = String(name || "").trim(); return SAME[n] || n; }
  function newId() { return "sp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

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
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  /* the one date style used in every header, same as دفتر کارکرد */
  function today() { var t = new Date(), j = g2j(t.getFullYear(), t.getMonth() + 1, t.getDate()); return "امروز: " + fa(j[0] + "/" + p2(j[1]) + "/" + p2(j[2])); }

  function hesabName(h, id) {
    if (id === "main") return (h.settings && h.settings.main && h.settings.main.project) || (h.projects && h.projects.main && h.projects.main.name) || "";
    var s = h["projects/" + id + "/settings"];
    return (s && s.main && s.main.project) || (h.projects && h.projects[id] && h.projects[id].name) || "";
  }
  function hesabMainIsReal(h) {
    var cfg = h.settings && h.settings.main;
    if (cfg && !cfg.sample) return true;
    return ["expenses", "receipts", "draws"].some(function (c) { return Object.values(h[c] || {}).some(function (x) { return x && !x.sample; }); });
  }

  /* keep the list in step with what the books hold: every book project not yet linked joins the list,
     merging into a project of the same name that has no record in that book yet */
  function reconcile(r) {
    var changed = false;
    function add(name, extra, book, id) {
      name = canon(name) || "پروژه بی‌نام";
      var hit = r.list.filter(function (p) { return norm(p.name) === norm(name) && !(p.links && p.links[book]); })[0];
      if (!hit) { hit = { id: newId(), name: name, employer: "", contractor: "", links: {} }; r.list.push(hit); }
      if (extra) { if (extra.employer && !hit.employer) hit.employer = extra.employer; if (extra.contractor && !hit.contractor) hit.contractor = extra.contractor; }
      hit.links = hit.links || {}; hit.links[book] = id; changed = true;
    }
    function linked(book) { var m = {}; r.list.forEach(function (p) { if (p.links && p.links[book]) m[p.links[book]] = 1; }); return m; }
    var k = read("karkard-v2"), kp = (k && k.projects) || {}, lk = linked("karkard");
    r.list.forEach(function (p) { if (p.links && p.links.karkard && !kp[p.links.karkard] && k) { delete p.links.karkard; changed = true; } });
    Object.keys(kp).forEach(function (id) {
      var p = kp[id] || {};
      if (p.archived || lk[id]) return;
      if ((p.name || "") === "پروژه اول" && !Object.values((k && k.days) || {}).some(function (d) { return d && d.project === id; })) return;
      add(p.name, p, "karkard", id);
    });
    var h = read("daftar-proje-v1");
    if (h && typeof h === "object") {
      var lh = linked("hesab"), ids = Object.keys(h.projects || {});
      if (ids.indexOf("main") < 0 && h.settings && h.settings.main) ids.unshift("main");
      r.list.forEach(function (p) { var l = p.links && p.links.hesab; if (l && l !== "main" && !(h.projects || {})[l]) { delete p.links.hesab; changed = true; } });
      ids.forEach(function (id) {
        if (lh[id]) return;
        if (id === "main" && !hesabMainIsReal(h)) return;
        add(hesabName(h, id), null, "hesab", id);
      });
    }
    if (!r.cur || !r.list.some(function (p) { return p.id === r.cur; })) {
      var kc = null; try { kc = localStorage.getItem("karkard-proj"); } catch (e) {}
      var hc = null; try { hc = localStorage.getItem("daftar-cur-project"); } catch (e) {}
      var cur = r.list.filter(function (p) { return p.links.karkard && p.links.karkard === kc; })[0] ||
                r.list.filter(function (p) { return p.links.hesab && p.links.hesab === hc; })[0] || r.list[0];
      r.cur = cur ? cur.id : null; changed = true;
    }
    return changed;
  }

  var SA = {
    fa: fa, norm: norm, today: today,
    load: function () {
      var r = read(KEY);
      if (!r || !Array.isArray(r.list)) r = { v: 1, cur: null, list: [] };
      if (reconcile(r)) SA.save(r);
      return r;
    },
    save: function (r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) {} },
    current: function () {
      var r = SA.load();
      var p = r.list.filter(function (x) { return x.id === r.cur; })[0] || r.list[0] || null;
      if (p && r.cur !== p.id) { r.cur = p.id; SA.save(r); }
      return p;
    },
    setCurrent: function (id) { var r = SA.load(); r.cur = id; SA.save(r); },
    upsert: function (p) {
      var r = SA.load(), i = -1;
      r.list.forEach(function (x, n) { if (x.id === p.id) i = n; });
      if (i < 0) { p.id = p.id || newId(); p.links = p.links || {}; r.list.push(p); } else r.list[i] = Object.assign({}, r.list[i], p);
      SA.save(r); return p.id;
    },
    remove: function (id) { var r = SA.load(); r.list = r.list.filter(function (x) { return x.id !== id; }); if (r.cur === id) r.cur = r.list[0] ? r.list[0].id : null; SA.save(r); },
    /* the book has opened (or created) its record for this project */
    link: function (book, saId, localId) {
      var r = SA.load();
      r.list.forEach(function (x) { if (x.id === saId) { x.links = x.links || {}; x.links[book] = localId; } });
      SA.save(r);
    },
    newId: newId
  };
  window.SA = SA;
})();
