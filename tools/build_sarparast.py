#!/usr/bin/env python3
"""Builds the supervisor app in sarparast/ from the owner's books.

The books themselves (karkard, anbar, resid, notes) are copied unchanged except for one line:
sarparast/sv.js is loaded first, which gives the copy its own storage, hides what a supervisor
may not use and makes file sharing work inside the Android app. Shared files (sa.js, sign.js,
theme.css, lib/, fonts/, icons/) are copied so the folder works on its own, also as the APK's web
folder. Hand-written files in sarparast/ (index.html, sv.js, sw.js, manifest) are not touched.

Run from the repo root after any change to the books:  python3 tools/build_sarparast.py
"""
import os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "sarparast")
BOOKS = ["karkard", "anbar", "resid", "notes"]
FILES = ["sa.js", "sign.js", "theme.css"]
DIRS = ["lib", "fonts", "icons"]
MARK = '<script src="../sv.js"></script><!-- supervisor app: built by tools/build_sarparast.py -->'

def main():
    for b in BOOKS:
        src = open(os.path.join(ROOT, b, "index.html"), encoding="utf-8").read()
        out, n = re.subn(r'(<meta charset="utf-8">)', r"\1\n" + MARK.replace("\\", "\\\\"), src, count=1)
        if n != 1:
            sys.exit("no <meta charset> in %s/index.html" % b)
        out = out.replace('<meta name="apple-mobile-web-app-title" content="Project Super App">', '<meta name="apple-mobile-web-app-title" content="سرپرست کارگاه">')
        d = os.path.join(OUT, b)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(out)
        icons = os.path.join(ROOT, b, "icons")
        if os.path.isdir(icons):
            shutil.copytree(icons, os.path.join(d, "icons"), dirs_exist_ok=True)
    for f in FILES:
        shutil.copy2(os.path.join(ROOT, f), os.path.join(OUT, f))
    for d in DIRS:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(OUT, d), dirs_exist_ok=True)
    print("sarparast/ built:", ", ".join(BOOKS))

if __name__ == "__main__":
    main()
