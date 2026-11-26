# -*- coding: utf-8 -*-
"""Check that evidence/... paths cited by docs actually exist.

Usage (repo root): python docs/baseline/tools/check_evidence_refs.py
"""
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DOC_DIRS = [os.path.join(ROOT, "docs", d) for d in ("architecture", "design", "requirements", "test")]
PAT = re.compile(r"evidence/[A-Za-z0-9._\-]+")


def main():
    seen = {}
    for d in DOC_DIRS:
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if not name.endswith(".md"):
                continue
            path = os.path.join(d, name)
            for i, line in enumerate(open(path, encoding="utf-8").read().splitlines(), 1):
                for m in PAT.findall(line):
                    seen.setdefault(m, []).append("%s:%d" % (name, i))

    if not seen:
        print("no evidence references found")
        return
    bad = 0
    for ref in sorted(seen):
        ok = os.path.exists(os.path.join(ROOT, ref.replace("/", os.sep)))
        bad += 0 if ok else 1
        print("%-36s exists=%-5s cited-by=%s" % (ref, ok, ", ".join(seen[ref][:4])))
    print("\nmissing count:", bad)


if __name__ == "__main__":
    main()
