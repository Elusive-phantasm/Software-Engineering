# -*- coding: utf-8 -*-
"""Parse SRS / coverage matrix / positive test cases and emit the trace-gap CSV.

Usage (repo root): python docs/baseline/tools/gen_trace_gaps.py
Output: docs/baseline/追踪缺口清单-v0.1.csv (utf-8-sig)
"""
import csv
import io
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRS = os.path.join(ROOT, "docs", "requirements", "SRS.md")
MAT = os.path.join(ROOT, "docs", "requirements", "需求覆盖矩阵.md")
FT = os.path.join(ROOT, "docs", "test", "交易与应用测试用例-正向设计.md")
OUT = os.path.join(ROOT, "docs", "baseline", "追踪缺口清单-v0.1.csv")

GROUPS = [
    ("用例", ["UC-%02d" % i for i in list(range(1, 19)) + list(range(29, 35))]),
    ("业务规则", ["BR-%02d" % i for i in range(1, 23)]),
    ("商品状态转换", ["ST-%02d" % i for i in range(1, 14)]),
    ("认证状态转换", ["AT-%02d" % i for i in range(1, 9)]),
    ("质量需求", ["NFR-%02d" % i for i in range(1, 11)]),
]


def read(path):
    return io.open(path, encoding="utf-8").read().splitlines()


def srs_present(lines, rid):
    row = re.compile(r"^\|\s*" + re.escape(rid) + r"\s*\|")
    head = re.compile(r"^#{2,4}\s+(?:\d+(?:\.\d+)*\s+)?" + re.escape(rid) + r"\b")
    return any(row.match(l) or head.match(l) for l in lines)


def matrix_status(lines, rid):
    if any(re.match(r"^\|\s*" + re.escape(rid) + r"\s*\|", l) for l in lines):
        return "单列"
    for l in lines:
        m = re.match(r"^\|\s*(AT-\d{2})～(\d{2})\s*\|", l)
        if m and rid.startswith("AT-"):
            lo, hi = int(m.group(1)[3:]), int(m.group(2))
            if lo <= int(rid[3:]) <= hi:
                return "合并登记(%s～%s)" % (m.group(1), m.group(2))
    return "未登记"


def ft_refs(lines, rid):
    out = []
    for l in lines:
        m = re.match(r"^\| (FT-\d{3}) ", l)
        if m and rid in l:
            out.append(m.group(1))
    return out


def main():
    srs, mat, ft = read(SRS), read(MAT), read(FT)
    rows, zero, single = [], 0, 0
    for kind, ids in GROUPS:
        for rid in ids:
            ms = matrix_status(mat, rid)
            refs = ft_refs(ft, rid)
            gaps = []
            if ms == "未登记":
                gaps.append("覆盖矩阵未登记")
            elif ms.startswith("合并"):
                gaps.append("矩阵合并登记，未单列")
            if not refs:
                zero += 1
                gaps.append("正向用例无显式引用")
            elif len(refs) == 1:
                single += 1
                gaps.append("仅 1 条正向用例")
            rows.append([rid, kind, "是" if srs_present(srs, rid) else "否", ms,
                         len(refs), " ".join(refs), "；".join(gaps) if gaps else "无"])

    with io.open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["编号", "类别", "SRS 有条目", "覆盖矩阵登记", "正向用例引用数", "引用的 FT 编号", "缺口"])
        w.writerows(rows)

    print("written:", OUT)
    print("rows:", len(rows))
    print("zero-ref total:", zero)
    print("single-ref total:", single)
    print("srs-missing:", [r[0] for r in rows if r[2] == "否"] or "none")
    print("matrix-not-listed:", [r[0] for r in rows if r[3] == "未登记"] or "none")


if __name__ == "__main__":
    main()
