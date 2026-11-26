# -*- coding: utf-8 -*-
"""Print only the unified diff between the API table block in the design doc and the parsed source.

Usage (repo root): python docs/baseline/tools/api_inventory_diff.py
Exit code: 0 = same, 1 = diff, 2 = cannot run.
"""
import difflib
import importlib.util
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GEN = os.path.join(ROOT, "tools", "gen-api-inventory.py")


def main():
    if not os.path.exists(GEN):
        print("missing:", GEN)
        return 2
    spec = importlib.util.spec_from_file_location("gen_api_inventory", GEN)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    rows = mod.ordered(mod.parse_endpoints())
    table, paths, rows = mod.render(rows)
    doc_path = mod.DOC if os.path.isabs(mod.DOC) else os.path.join(ROOT, mod.DOC)
    doc = open(doc_path, encoding="utf-8").read()
    start, end = doc.index(mod.BEGIN), doc.index(mod.END) + len(mod.END)

    diff = list(difflib.unified_diff(doc[start:end].splitlines(), table.splitlines(),
                                     "document", "source", lineterm="", n=0))
    if not diff:
        print("OK   %d paths / %d operations" % (len(paths), len(rows)))
        return 0
    print("\n".join(diff))
    print("\nDIFF %d paths / %d operations, %d diff lines" % (len(paths), len(rows), len(diff)))
    return 1


if __name__ == "__main__":
    sys.exit(main())
