# -*- coding: utf-8 -*-
"""Count how many check() items smoke/e2e actually execute (excluding the function definition).

Static estimate only; it is NOT a test result.

Usage (repo root): python docs/baseline/tools/count_checks.py
"""
import io
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def call_lines(path):
    lines = io.open(path, encoding="utf-8").read().splitlines()
    return lines, [i for i, l in enumerate(lines, 1) if "check(" in l and "function check(" not in l]


def main():
    smoke = os.path.join(ROOT, "tools", "smoke.mjs")
    e2e = os.path.join(ROOT, "tools", "e2e.mjs")

    _, calls = call_lines(smoke)
    print("smoke.mjs: call-lines=%d  -> executions=%d (no check inside loops)" % (len(calls), len(calls)))

    lines, calls = call_lines(e2e)
    start = next(i for i, l in enumerate(lines, 1) if "for (const [path, title] of [" in l)
    end = next(i for i, l in enumerate(lines, 1) if i > start and l.strip() == "]) {")
    pages = sum(1 for l in lines[start:end] if l.strip().startswith("['/admin/"))
    loop_end = end + 6
    inside = [i for i in calls if start <= i <= loop_end]
    top = len(calls) - len(inside)
    print("e2e.mjs:   call-lines=%d top=%d in-loop=%d pages=%d -> executions=%d"
          % (len(calls), top, len(inside), pages, top + pages * len(inside)))
    print("e2e admin loop: lines %d-%d, pages=%d" % (start, loop_end, pages))


if __name__ == "__main__":
    main()
