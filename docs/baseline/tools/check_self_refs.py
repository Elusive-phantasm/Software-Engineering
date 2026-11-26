# -*- coding: utf-8 -*-
"""Verify that `file:line` references inside the audit document really exist.

Usage (repo root): python docs/baseline/tools/check_self_refs.py
"""
import io
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DOC = os.path.join(ROOT, "docs", "baseline", "基线闭合审查与变更记录-v0.1.md")

REF = re.compile(r"`([A-Za-z0-9_./\u4e00-\u9fa5\-]+\.(?:java|sql|yml|md|mjs|py|vue|json|txt)):(\d+)(?:[–\-](\d+))?`")
EXTS = (".java", ".sql", ".yml", ".md", ".mjs", ".py", ".vue", ".json", ".txt")
SEARCH = ["backend/src", "frontend/src", "docs", "tools", "tasks", "evidence", "."]


def build_index():
    index = {}
    for d in SEARCH:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, files in os.walk(base):
            dirnames[:] = [x for x in dirnames if x not in (".git", "node_modules", "target", "dist")]
            for f in files:
                if f.endswith(EXTS):
                    index.setdefault(f, os.path.join(dirpath, f))
    return index


def main():
    text = io.open(DOC, encoding="utf-8").read()
    refs = {}
    for m in REF.finditer(text):
        key = (m.group(1), int(m.group(2)), m.group(3))
        refs[key] = refs.get(key, 0) + 1

    index = build_index()
    bad = []
    for (fname, a, b), n in sorted(refs.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2] or "")):
        path = index.get(os.path.basename(fname))
        if path is None:
            bad.append((fname, a, b, "missing-file", n))
            continue
        total = len(io.open(path, encoding="utf-8").read().splitlines())
        if a < 1 or a > total or (b and (int(b) > total or int(b) < a)):
            bad.append((fname, a, b, "out-of-range(file-lines=%d)" % total, n))

    print("distinct refs:", len(refs))
    print("bad count:", len(bad))
    for row in bad:
        print("  BAD:", row)


if __name__ == "__main__":
    main()
