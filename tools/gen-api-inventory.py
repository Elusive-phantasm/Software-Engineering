#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 backend 的 controller 源码生成《接口与关键设计说明书》的全量接口总表。

统计口径：
  - 以 @GetMapping/@PostMapping/@PutMapping/@DeleteMapping/@PatchMapping 为准；
  - 无子路径的映射（如 @PostMapping）取类级 @RequestMapping 的基路径；
  - 同一路径不同动词算不同操作（"操作数"），路径去重后即"路径数"。

用法（在仓库任意位置执行均可）：
  python tools/gen-api-inventory.py               # 打印 Markdown 表
  python tools/gen-api-inventory.py --write       # 写入文档的生成块
  python tools/gen-api-inventory.py --check       # 校验文档与源码一致

--write / --check 作用的文件：docs/design/接口与关键设计说明书.md
（按 <!-- API-INVENTORY:BEGIN --> / <!-- API-INVENTORY:END --> 定位，块内内容由本脚本维护）
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
BACKEND = os.path.join(REPO, "backend",
                       "src", "main", "java", "com", "campus", "trade")
DOC = os.path.join(REPO, "docs", "design", "接口与关键设计说明书.md")

BEGIN = "<!-- API-INVENTORY:BEGIN"
END = "<!-- API-INVENTORY:END -->"

# 功能域顺序即编号顺序；域内按 ORDER 中列出的先后排，未列出的排到该域末尾（并给出提示）
GROUPS = [
    ("认证与账号", lambda p: p.startswith("/api/auth/")),
    ("身份核验", lambda p: p.startswith("/api/verifications") or p.startswith("/api/admin/verifications")),
    ("商品与类目", lambda p: p.startswith("/api/products") or p.startswith("/api/categories")
                                 or p.startswith("/api/me/products") or p.startswith("/api/admin/products")),
    ("订单与评价", lambda p: p.startswith("/api/orders") or p.startswith("/api/me/orders")
                                 or p.startswith("/api/me/reviews")),
    ("信用分", lambda p: p.endswith("/credit")),
    ("收藏", lambda p: p.startswith("/api/favorites") or p.startswith("/api/me/favorites")),
    ("举报与处置", lambda p: p.startswith("/api/reports") or p.startswith("/api/me/reports")
                                 or p.startswith("/api/admin/reports")),
    ("私信、通知与主页", lambda p: p.startswith("/api/messages") or p.startswith("/api/notifications")
                                 or p == "/api/badge" or p.endswith("/profile")),
    ("管理端后台", lambda p: p.startswith("/api/admin/")),
    ("演示与运维工具", lambda p: p.startswith("/api/dev/")),
]

ORDER = {
    "认证与账号": [
        ("POST", "/api/auth/send-code"), ("POST", "/api/auth/register"),
        ("POST", "/api/auth/login"), ("GET", "/api/auth/me"), ("POST", "/api/auth/logout"),
        ("POST", "/api/auth/admin/login"), ("POST", "/api/auth/admin/change-password"),
        ("POST", "/api/auth/forgot/send-code"), ("POST", "/api/auth/forgot/reset"),
        ("PATCH", "/api/auth/me/profile"),
    ],
    "身份核验": [
        ("POST", "/api/verifications"), ("GET", "/api/verifications/mine"),
        ("POST", "/api/admin/verifications/{id}/approve"),
        ("POST", "/api/admin/verifications/{id}/reject"),
        ("POST", "/api/admin/verifications/students/{id}/revoke"),
        ("GET", "/api/admin/verifications"), ("GET", "/api/admin/verifications/{id}/image"),
    ],
    "商品与类目": [
        ("POST", "/api/products"), ("PATCH", "/api/products/{id}"),
        ("POST", "/api/products/{id}/withdraw"), ("POST", "/api/products/{id}/take-down"),
        ("DELETE", "/api/products/{id}"), ("POST", "/api/products/{id}/resubmit"),
        ("GET", "/api/products"), ("GET", "/api/products/{id}"), ("GET", "/api/me/products"),
        ("GET", "/api/categories"),
        ("POST", "/api/admin/products/{id}/approve"), ("POST", "/api/admin/products/{id}/reject"),
        ("POST", "/api/admin/products/{id}/force-off"), ("POST", "/api/admin/products/{id}/restore"),
        ("GET", "/api/admin/products"), ("GET", "/api/admin/products/forbidden-categories"),
    ],
    "订单与评价": [
        ("POST", "/api/orders"), ("GET", "/api/me/orders"), ("GET", "/api/orders/{id}"),
        ("POST", "/api/orders/{id}/cancel"), ("POST", "/api/orders/{id}/cancel-judgement"),
        ("POST", "/api/orders/{id}/reviews"), ("GET", "/api/me/reviews/written"),
        ("GET", "/api/me/reviews/received"),
    ],
    "信用分": [
        ("GET", "/api/me/credit"), ("GET", "/api/students/{id}/credit"),
        ("GET", "/api/admin/students/{id}/credit"),
    ],
    "收藏": [
        ("GET", "/api/me/favorites"), ("POST", "/api/favorites"), ("DELETE", "/api/favorites/{productId}"),
    ],
    "举报与处置": [
        ("POST", "/api/reports"), ("GET", "/api/me/reports"),
        ("GET", "/api/admin/reports"), ("POST", "/api/admin/reports/{id}/handle"),
    ],
    "私信、通知与主页": [
        ("GET", "/api/messages/conversations"),
        ("GET", "/api/messages/conversations/{productId}/{peerId}"),
        ("POST", "/api/messages"), ("POST", "/api/messages/appeal"),
        ("GET", "/api/messages/unread-count"), ("GET", "/api/notifications"),
        ("POST", "/api/notifications/{id}/read"), ("POST", "/api/notifications/read-all"),
        ("GET", "/api/badge"), ("GET", "/api/students/{id}/profile"),
    ],
    "管理端后台": [
        ("GET", "/api/admin/dashboard"), ("GET", "/api/admin/students"),
        ("GET", "/api/admin/students/{id}"), ("POST", "/api/admin/students/{id}/account-status"),
        ("POST", "/api/admin/students/{id}/credit"), ("POST", "/api/admin/reviews/{id}/delete"),
        ("POST", "/api/admin/messages/reply"), ("GET", "/api/admin/audit"),
        ("GET", "/api/admin/forced-off-products"), ("GET", "/api/admin/meta"),
    ],
    "演示与运维工具": [
        ("GET", "/api/dev/state"), ("POST", "/api/dev/reset"),
        ("POST", "/api/dev/time-shift"), ("POST", "/api/dev/time-reset"),
        ("POST", "/api/dev/scheduler/run"), ("GET", "/api/dev/mailbox"),
    ],
}

# 冻结状态：S1 冻结 = 《接口与关键设计说明书》§2 已逐条展开的 8 个契约
FROZEN = {
    ("POST", "/api/auth/register"), ("POST", "/api/auth/login"),
    ("POST", "/api/verifications"),
    ("POST", "/api/admin/verifications/{id}/approve"),
    ("POST", "/api/products"), ("PATCH", "/api/products/{id}"),
    ("POST", "/api/admin/products/{id}/approve"), ("POST", "/api/admin/products/{id}/reject"),
}

ANNOT = {"Get": "GET", "Post": "POST", "Put": "PUT", "Delete": "DELETE", "Patch": "PATCH"}


def parse_endpoints():
    ctrl_dir = os.path.join(BACKEND, "controller")
    rows = []
    for fn in sorted(os.listdir(ctrl_dir)):
        if not fn.endswith(".java"):
            continue
        src = open(os.path.join(ctrl_dir, fn), encoding="utf-8").read()
        m = re.search(r'@RequestMapping\(\s*(?:value\s*=\s*)?"([^"]*)"', src)
        base = m.group(1) if m else ""
        pat = re.compile(
            r'(@Operation\([^)]*\)\s*)?@(Get|Post|Put|Delete|Patch)Mapping'
            r'(?:\s*\(\s*(?:value\s*=\s*)?"([^"]*)"[^)]*\)|\s*\(\s*\)|\b)'
        )
        for mm in pat.finditer(src):
            summary = re.search(r'summary\s*=\s*"([^"]*)"', mm.group(1) or "")
            sub = mm.group(3) or ""
            rows.append({
                "verb": ANNOT[mm.group(2)],
                "path": (base + sub).replace("//", "/"),
                "ctrl": fn[:-5],
                "summary": summary.group(1) if summary else "",
            })
    return rows


def ordered(rows):
    buckets = {name: [] for name, _ in GROUPS}
    for r in rows:
        for name, match in GROUPS:
            if match(r["path"]):
                buckets[name].append(r)
                break
        else:
            buckets[GROUPS[-1][0]].append(r)
    result = []
    for name, _ in GROUPS:
        items = buckets[name]
        prio = {k: i for i, k in enumerate(ORDER.get(name, []))}
        items.sort(key=lambda r: (prio.get((r["verb"], r["path"]), 999), r["path"], r["verb"]))
        for r in items:
            result.append(dict(r, group=name))
    return result


def render(rows):
    paths = {r["path"] for r in rows}
    out = []
    out.append(BEGIN + f" 由 tools/gen-api-inventory.py 生成，勿手改；"
                       f"共 {len(paths)} 个路径 / {len(rows)} 个操作 -->")
    out.append("")
    out.append("| 编号 | 域 | 方法 | 路径 | 说明 | 冻结 |")
    out.append("|---|---|---|---|---|---|")
    for i, r in enumerate(rows, 1):
        frozen = "S1 冻结" if (r["verb"], r["path"]) in FROZEN else "—"
        summary = r["summary"].replace("|", "\\|") or "—"
        out.append(f"| API-{i:02d} | {r['group']} | `{r['verb']}` | `{r['path']}` | {summary} | {frozen} |")
    out.append("")
    out.append(END)
    return "\n".join(out), paths, rows


def main():
    rows = ordered(parse_endpoints())
    table, paths, rows = render(rows)
    mode = sys.argv[1] if len(sys.argv) > 1 else ""

    if mode == "--write":
        doc = open(DOC, encoding="utf-8").read()
        start = doc.index(BEGIN)
        end = doc.index(END) + len(END)
        open(DOC, "w", encoding="utf-8", newline="\n").write(doc[:start] + table + doc[end:])
        print(f"written: {DOC}  ({len(paths)} paths / {len(rows)} operations)")
    elif mode == "--check":
        doc = open(DOC, encoding="utf-8").read()
        start = doc.index(BEGIN)
        end = doc.index(END) + len(END)
        same = doc[start:end].strip() == table.strip()
        print(("OK   " if same else "DIFF ") + f"{len(paths)} paths / {len(rows)} operations")
        sys.exit(0 if same else 1)
    else:
        print(table)


if __name__ == "__main__":
    main()
