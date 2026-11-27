# SRS LaTeX 工程

本目录是《校园二手交易平台》需求规格说明书 PDF 的可复现源码。
版式参照 `D:\software-engineering\软件工程课程需求报告(1).pdf`：
宁波大学校徽封面、三级点线目录、A4、页码居中置底。

## 文件

| 文件 | 说明 |
|---|---|
| `srs.tex` | 由 Markdown 生成的 LaTeX 源文件（可直接编译） |
| `md2tex.py` | Markdown → LaTeX 转换脚本（表格、封面、图位、目录样式） |
| `SRS-source.md` | 内容基线：吕锦浩分支 `origin/codex/return-approval-requirement` 的 SRS |
| `assets/logo-nbu.png` | 宁波大学校徽，从参考报告 PDF 中提取的原图（非重绘） |

## 编译

```bash
cd docs/requirements/latex
xelatex -interaction=nonstopmode srs.tex
xelatex -interaction=nonstopmode srs.tex   # 第二遍生成目录页码
```

需要 TeXLive（含 ctex、xeCJK）与系统字体 SimSun / SimHei / KaiTi。

## 更新内容

改 `SRS-source.md` 后重新生成：

```bash
python md2tex.py
xelatex -interaction=nonstopmode srs.tex
xelatex -interaction=nonstopmode srs.tex
cp srs.pdf ../SRS-V2.2-最终版.pdf
```

> 注意：`md2tex.py` 会读取同目录的 `SRS-source.md` 并覆盖 `srs.tex`，
> 手工修改 `srs.tex` 会在下次生成时丢失。

## 变更说明的去向（附录 D）

正文只保留需求本身。原散落在各章节的**版本演进说明、答辩口径、走查提醒、图件状态**
会被 `md2tex.py` 自动移出，集中登记到 `附录 D　变更说明与批注归并表`（按类别分节，
保留原章节位置）。如需新增或调整归并规则，修改脚本里的 `MOVE_KEYS` 列表。

`SRS-source.md` 保持分支原文不动，便于与仓库里的 Markdown 对照。

## 配图

当前 4 处图位为占位框，图注编号与正文引用一致：

| 图注 | 位置 | 状态 |
|---|---|---|
| 图 3-1 用例图 | §3.1 | 待组员提供 |
| 图 6-1 UML 概念类图 | §6.1 | 待组员提供 |
| 图 7-1 商品状态机（SM-01） | §7.2 | 待组员提供 |
| 图 7-2 学生认证状态图（SM-02） | §7.3 | 待组员提供 |

出图后，把 PNG 放入 `assets/`，将 `srs.tex` 中对应的
`\fbox{\begin{minipage}...\end{minipage}}` 占位块替换为
`\includegraphics[width=0.86\linewidth]{assets/xxx.png}` 即可，图注保持不动。
