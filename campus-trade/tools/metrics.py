# -*- coding: utf-8 -*-
"""静态度量：包依赖、类规模、扇入扇出，用于架构文档的真实数据。"""
import os, re, json, collections

ROOT = r"D:\software-engineering\Software-Engineering\campus-trade\backend\src\main\java\com\campus\trade"
files = []
for dirpath, _, names in os.walk(ROOT):
    for n in names:
        if n.endswith(".java"):
            files.append(os.path.join(dirpath, n))

pkg_of = lambda p: os.path.relpath(p, ROOT).split(os.sep)[0] if os.sep in os.path.relpath(p, ROOT) else "(root)"
cls_of = lambda p: os.path.basename(p)[:-5]

classes = {}
for f in files:
    text = open(f, encoding="utf-8").read()
    pkg = os.path.relpath(f, ROOT).split(os.sep)[0] if os.sep in os.path.relpath(f, ROOT) else "(root)"
    imports = set(re.findall(r"import\s+com\.campus\.trade\.([\w.]+);", text))
    lines = text.count("\n") + 1
    methods = len(re.findall(r"\n\s{4}(?:public|private|protected)\s+[\w<>\[\], .]+\s+\w+\s*\(", text))
    classes[cls_of(f)] = {"pkg": pkg, "lines": lines, "methods": methods,
                          "imports": sorted(imports), "file": os.path.relpath(f, ROOT)}

# 包级依赖
pkg_edges = collections.Counter()
for c, info in classes.items():
    for imp in info["imports"]:
        target_pkg = imp.split(".")[0]
        if target_pkg != info["pkg"]:
            pkg_edges[(info["pkg"], target_pkg)] += 1

# 类级扇入（被多少个类 import）
fan_in = collections.Counter()
for c, info in classes.items():
    for imp in info["imports"]:
        fan_in[imp.split(".")[-1]] += 1

# 分层违规：mapper 依赖 service / service 依赖 controller 等
violations = []
layer_rank = {"entity": 0, "constant": 0, "common": 0, "util": 0, "mapper": 1,
              "service": 2, "security": 2, "audit": 2, "controller": 3, "config": 3, "dto": 1, "vo": 1}
for c, info in classes.items():
    src_rank = layer_rank.get(info["pkg"])
    for imp in info["imports"]:
        tgt_pkg = imp.split(".")[0]
        tgt_rank = layer_rank.get(tgt_pkg)
        if src_rank is not None and tgt_rank is not None and tgt_rank > src_rank:
            violations.append(f"{info['pkg']}.{c} -> {imp}")

# 各包统计
by_pkg = collections.defaultdict(lambda: {"files": 0, "lines": 0, "methods": 0})
for c, info in classes.items():
    by_pkg[info["pkg"]]["files"] += 1
    by_pkg[info["pkg"]]["lines"] += info["lines"]
    by_pkg[info["pkg"]]["methods"] += info["methods"]

services = {c: i for c, i in classes.items() if i["pkg"] in ("service", "security", "audit")}
print("== 包统计 ==")
for pkg, s in sorted(by_pkg.items(), key=lambda x: -x[1]["lines"]):
    print(f"{pkg:<12} files={s['files']:<3} lines={s['lines']:<5} methods={s['methods']}")

print("\n== 包级依赖（from -> to : 次数）==")
for (a, b), n in sorted(pkg_edges.items(), key=lambda x: -x[1]):
    print(f"{a:<12} -> {b:<12} {n}")

print("\n== 服务类规模与扇入 ==")
for c, i in sorted(services.items(), key=lambda x: -x[1]["lines"]):
    print(f"{c:<28} lines={i['lines']:<4} methods={i['methods']:<3} fan_in={fan_in.get(c,0)}")

print("\n== 扇入 Top10 ==")
for c, n in fan_in.most_common(10):
    print(f"{c:<28} {n}")

print("\n== 分层违规（低层依赖高层）==")
print("\n".join(violations) if violations else "无")

print("\n== 总览 ==")
print("java 文件:", len(classes), "总行数:", sum(i["lines"] for i in classes.values()))

json.dump({"by_pkg": by_pkg, "edges": {f"{a}->{b}": n for (a, b), n in pkg_edges.items()},
           "services": {c: {"lines": i["lines"], "methods": i["methods"], "fan_in": fan_in.get(c, 0)}
                        for c, i in services.items()},
           "violations": violations, "total_files": len(classes)},
          open(r"D:\software-engineering\Software-Engineering\campus-trade\docs\_metrics.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
