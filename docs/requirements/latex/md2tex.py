#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Convert the team SRS Markdown (v2.2 branch) into a LaTeX document
styled after 《软件工程课程需求报告》: cover with NBU logo, dotted TOC,
plain page numbers, full-width tables, reserved figure slots.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "SRS-source.md"
OUT_TEX = ROOT / "srs.tex"
ASSETS = ROOT / "assets"

# ---------------------------------------------------------------- text escaping
SPECIAL = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}

def esc(text: str) -> str:
    out = []
    for ch in text:
        out.append(SPECIAL.get(ch, ch))
    return "".join(out)


INLINE = re.compile(r"(\*\*.+?\*\*|~~.+?~~|`[^`]+`)")


CODE_RE = re.compile(r"`([^`]+)`")


def inline_code(text: str) -> str:
    """Escape text and turn `code` spans into \texttt{}, keeping bold wrappers out."""
    parts = []
    pos = 0
    for m in CODE_RE.finditer(text):
        parts.append(esc(text[pos:m.start()]))
        parts.append(r"\texttt{" + esc(m.group(1)) + "}")
        pos = m.end()
    parts.append(esc(text[pos:]))
    s = "".join(parts).replace("\x00", r"\newline{}")
    return re.sub(r"(\\newline\{\})+\s*$", "", s)


def inline(text: str) -> str:
    """Escape text but keep **bold**, `code`, ~~strike~~."""
    text = text.replace("<br/>", "\x00").replace("<br />", "\x00").replace("<br>", "\x00")
    parts = []
    pos = 0
    for m in INLINE.finditer(text):
        parts.append(("t", text[pos:m.start()]))
        tok = m.group(0)
        if tok.startswith("**"):
            parts.append(("b", tok[2:-2]))
        elif tok.startswith("~~"):
            parts.append(("s", tok[2:-2]))
        else:
            parts.append(("c", tok[1:-1]))
        pos = m.end()
    parts.append(("t", text[pos:]))

    out = []
    for kind, val in parts:
        if kind == "t":
            out.append(inline_code(val))
        elif kind == "b":
            out.append(r"\textbf{" + inline_code(val) + "}")
        elif kind == "s":
            out.append(inline_code(val))
        else:
            out.append(r"\texttt{" + esc(val) + "}")
    s = "".join(out)
    s = re.sub(r"(\\newline\{\})+\s*$", "", s)
    return s


def disp_width(s: str) -> int:
    """Approximate display width: CJK/wide chars count 2, ASCII 1."""
    w = 0
    for ch in s:
        w += 2 if ord(ch) > 0x2E7F else 1
    return w


def plain(s: str) -> str:
    return re.sub(r"(\*\*|~~|`)", "", s)


# ---------------------------------------------------------------- table splitting
def split_row(line: str):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    cells, buf, in_code = [], [], False
    for ch in s:
        if ch == "`":
            in_code = not in_code
        if ch == "|" and not in_code:
            cells.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    cells.append("".join(buf).strip())
    return cells


SEP_RE = re.compile(r"^:?-{2,}:?$")


def is_sep(row) -> bool:
    return bool(row) and all(SEP_RE.match(c.replace(" ", "")) for c in row)


def col_weights(rows, ncols):
    weights = []
    for c in range(ncols):
        mx = 4
        for r in rows:
            if c < len(r):
                mx = max(mx, disp_width(plain(r[c]).replace("<br>", " ")))
        weights.append(mx)
    # damp very long columns so one cell cannot dominate
    damped = [w ** 0.72 for w in weights]
    total = sum(damped)
    return [w / total for w in damped]


def render_table(rows, out):
    ncols = max(len(r) for r in rows)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    header, body = rows[0], rows[1:]
    if not body:
        body = [[""] * ncols]

    weights = col_weights(rows, ncols)
    # available width: A4 text width ~ 16cm with 2.5cm margins
    usable = 16.0
    if ncols == 2:
        widths = [2.75, usable - 2.75]
    else:
        minw = 1.55
        widths = [max(minw, usable * w) for w in weights]
        scale = usable / sum(widths)
        widths = [w * scale for w in widths]

    colspec = "|" + "|".join(f"p{{{w:.2f}cm}}" for w in widths) + "|"
    total_w = sum(disp_width(" ".join(plain(c) for c in r)) for r in rows)
    font = r"\scriptsize" if (ncols >= 6 or total_w > 900) else r"\footnotesize"

    out.append("{" + font)
    out.append(r"\begin{longtable}{" + colspec + "}")
    out.append(r"\hline")
    out.append(" & ".join(r"\textbf{" + inline(c) + "}" for c in header) + r" \\")
    out.append(r"\hline")
    out.append(r"\endfirsthead")
    out.append(r"\hline")
    out.append(" & ".join(r"\textbf{" + inline(c) + "}" for c in header) + r" \\")
    out.append(r"\hline")
    out.append(r"\endhead")
    out.append(r"\hline")
    out.append(r"\endfoot")
    for r in body:
        out.append(" & ".join(inline(c) for c in r) + r" \\")
        out.append(r"\hline")
    out.append(r"\end{longtable}")
    out.append(r"}")


# ---------------------------------------------------------------- meta-note relocation
# 这些批注属于“版本演进 / 答辩回答 / 走查提醒 / 图件状态”，不属于需求本身。
# 命中任一片段即从正文移除，并在附录 A.4 统一登记（原文保留，不丢信息）。
MOVE_KEYS = [
    "P-03 说明",
    "G-03 措辞变化",
    "口径对齐说明",
    "共 **24 个用例**",
    "优先级与确认状态是两回事",
    "图 3-1 待按 V2.1 重出",
    "**与 V1.2.1 的差异**：原 UC-01",
    "判据已补齐",
    "**与 V1.2.1 的差异**：原 UC-04",
    "本版最关键的一条",
    "举报类型口径变更",
    "处置手段口径统一",
    "**与 V1.2.1 的差异**：原 UC-11",
    "**与 V1.2.1 的差异**：原 UC-16",
    "本版**没有订单状态**",
    "为什么必须补这一条",
    "为什么不用「双方同意」",
    "为什么在售编辑必须重审",
    "共 **22 条**业务规则",
    "口径修正（重要）",
    "**与 V1.2.1 的差异**：通知事件清单",
    "本节是 BR-04 的可判定附表",
    "可测试性说明",
    "口径统一（重要）",
    "图 6-1 待按 V2.1 重出",
    "**与 V1.2.1 的差异**：新增 `账号状态`",
    "撤销的两个标记",
    "本实体是第二轮边界检查发现的缺口补齐物",
    "**与 V2.0 的关系**",
    "本版数据字典的完整性声明",
    "这是本版与 V1.2.1 差异最大的地方",
    "为什么可以删掉「已预订」",
    "图 7-1 待按 V2.1 重出",
    "为什么给 `已售出` 开口子",
    "图 7-2（SM-04 学生认证状态机）待出",
    "**与 V1.2.1 的差异**：AT 编号",
    "覆盖度自查",
    "本版删除 NFR-05",
    "**与 V1.2.1 的差异**：旧版 NFR-07",
    "本版所有图均待按 V2.1 重出",
    "V1.2.1 中另有 SM-01 订单状态机图",
    "编号规则说明（务必注意）",
    "本版遗留待确认项",
]

NOTE_CATEGORY = [
    ("图 ", "图件状态"),
    ("与 V1.2.1", "版本演进"),
    ("V1.2.1", "版本演进"),
    ("V2.0", "版本演进"),
    ("V2.1", "版本演进"),
    ("答辩", "答辩与评审"),
    ("评审", "答辩与评审"),
    ("走查", "走查提醒"),
    ("口径", "口径统一"),
    ("覆盖度", "自查记录"),
    ("遗留", "待确认事项"),
    ("为什么", "设计取舍"),
]


def note_category(text: str) -> str:
    for key, cat in NOTE_CATEGORY:
        if key in text:
            return cat
    return "说明"


MOVED_NOTES = []


# ---------------------------------------------------------------- figure slots
FIGURES = [
    ("3.1", "3-1", "用例图", "fig:usecase",
     "系统参与者（学生、管理员）与 UC-01～UC-34 的用例关系；含 include/extend 关系。"),
    ("6.1", "6-1", "UML 概念类图", "fig:class",
     "学生、商品、订单、评价、举报、信用记录、私信等实体的属性与关联多重性。"),
    ("7.2", "7-1", "商品状态机（SM-01）", "fig:sm01",
     "待审核、在售、已售出、已下架四态及 ST-01～ST-13 转换。"),
    ("7.3", "7-2", "学生认证状态图（SM-02）", "fig:sm02",
     "未提交、待审核、已认证、已驳回四态及 AT-01～AT-08 转换。"),
]


def figure_placeholder(key, out):
    for sec, fignum, name, label, note in FIGURES:
        if sec == key:
            out.append(r"\begin{figure}[htbp]")
            out.append(r"\centering")
            out.append(r"\fbox{\begin{minipage}[c][6.2cm][c]{0.86\linewidth}")
            out.append(r"\centering")
            out.append(r"{\large\color{gray} 图位待补}\\[4pt]")
            out.append(r"{\small\color{gray}" + esc(note) + r"}")
            out.append(r"\end{minipage}}")
            out.append(r"\caption*{图 " + fignum + r"\quad " + esc(name) + r"}")
            out.append(r"\label{" + label + r"}")
            out.append(r"\end{figure}")
            return True
    return False


# ---------------------------------------------------------------- main conversion
def convert(md: str):
    lines = md.splitlines()
    out = []
    i = 0
    current_heading = ""
    # skip the two title H1 lines and the stub "目录" table
    skip_until_toc = True
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            out.append("")
            i += 1
            continue

        if stripped == "---":
            i += 1
            continue

        # drop the two document-title H1s
        if stripped in ("# 校园二手交易平台", "# 软件需求规格说明书"):
            i += 1
            continue

        # tables
        if stripped.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                r = split_row(lines[i])
                if not is_sep(r):
                    rows.append(r)
                i += 1
            if rows:
                render_table(rows, out)
                out.append("")
            continue

        # headings
        if stripped.startswith("#"):
            level = len(stripped) - len(stripped.lstrip("#"))
            text = stripped[level:].strip()
            current_heading = text

            # replace the stub TOC section with a real one
            if text == "目录":
                out.append(r"\tableofcontents")
                out.append(r"\clearpage")
                i += 1
                # skip the stub table that follows
                while i < len(lines) and (not lines[i].strip() or lines[i].strip().startswith("|")):
                    i += 1
                continue

            if level == 1:
                out.append(r"\section*{" + inline(text) + "}")
                out.append(r"\addcontentsline{toc}{section}{" + inline(text) + "}")
                out.append(r"\markboth{" + inline(text) + "}{" + inline(text) + "}")
            elif level == 2:
                out.append(r"\subsection*{" + inline(text) + "}")
                out.append(r"\addcontentsline{toc}{subsection}{" + inline(text) + "}")
                secnum = text.split()[0] if text.split() else ""
                figure_placeholder(secnum, out)
            else:
                out.append(r"\subsubsection*{" + inline(text) + "}")
                out.append(r"\addcontentsline{toc}{subsubsection}{" + inline(text) + "}")
                secnum = text.split()[0] if text.split() else ""
                figure_placeholder(secnum, out)
            i += 1
            continue

        # blockquote
        if stripped.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            block_text = " ".join(b for b in buf if b)
            if any(k in block_text for k in MOVE_KEYS):
                MOVED_NOTES.append((current_heading, block_text))
                continue
            out.append(r"\begin{quote}\small")
            for b in buf:
                if b:
                    out.append(inline(b))
                    out.append("")
            out.append(r"\end{quote}")
            continue

        # bullets
        if re.match(r"^\s*[-*+]\s+", line):
            out.append(r"\begin{itemize}[leftmargin=1.6em,itemsep=1pt,topsep=2pt]")
            while i < len(lines) and re.match(r"^\s*[-*+]\s+", lines[i]):
                item = re.sub(r"^\s*[-*+]\s+", "", lines[i])
                out.append(r"\item " + inline(item))
                i += 1
            out.append(r"\end{itemize}")
            continue

        # numbered list
        if re.match(r"^\s*\d+\.\s+", line):
            out.append(r"\begin{enumerate}[leftmargin=1.9em,itemsep=1pt,topsep=2pt]")
            while i < len(lines) and re.match(r"^\s*\d+\.\s+", lines[i]):
                item = re.sub(r"^\s*\d+\.\s+", "", lines[i])
                out.append(r"\item " + inline(item))
                i += 1
            out.append(r"\end{enumerate}")
            continue

        out.append(inline(stripped))
        out.append("")
        i += 1

    return "\n".join(out)


PREAMBLE = r"""
\documentclass[12pt,a4paper]{ctexart}

\usepackage[top=2.5cm,bottom=2.5cm,left=2.6cm,right=2.6cm]{geometry}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{longtable}
\usepackage{array}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage{tocloft}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage{setspace}

% ---------- fonts ----------
\setCJKmainfont{SimSun}[BoldFont=SimHei, ItalicFont=KaiTi]
\setCJKsansfont{SimHei}
\setCJKmonofont{FangSong}
\setCJKfamilyfont{kaiheavy}[AutoFakeBold=3.2]{KaiTi}
\newcommand{\coverfont}{\CJKfamily{kaiheavy}}
\newCJKfontfamily\heitifont{SimHei}

% ---------- spacing ----------
\linespread{1.35}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0.35em}

% ---------- headings ----------
\ctexset{
  section = {
    format = \heitifont\zihao{3},
    beforeskip = 1.2em,
    afterskip = 0.7em,
  },
  subsection = {
    format = \heitifont\zihao{4},
    beforeskip = 0.9em,
    afterskip = 0.45em,
  },
  subsubsection = {
    format = \heitifont\zihao{-4},
    beforeskip = 0.7em,
    afterskip = 0.35em,
  },
}

% ---------- TOC style: dotted leaders, page number right ----------
\renewcommand{\cftdot}{.}
\renewcommand{\cftdotsep}{1.6}
\renewcommand{\cftsecleader}{\cftdotfill{\cftdotsep}}
\renewcommand{\cftsubsecleader}{\cftdotfill{\cftdotsep}}
\renewcommand{\cftsubsubsecleader}{\cftdotfill{\cftdotsep}}
\setlength{\cftsecindent}{0pt}
\setlength{\cftsubsecindent}{1.6em}
\setlength{\cftsubsubsecindent}{3.6em}
\renewcommand{\cftsecfont}{\normalfont}
\renewcommand{\cftsecpagefont}{\normalfont}
\setlength{\cftbeforesecskip}{0.55em}
\setlength{\cftbeforesubsecskip}{0.08em}
\setlength{\cftbeforesubsubsecskip}{0.02em}

% ---------- page style: page number bottom center only ----------
\pagestyle{fancy}
\fancyhf{}
\fancyfoot[C]{\zihao{5}\thepage}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

% ---------- table helpers ----------
\renewcommand{\arraystretch}{1.22}
\setlength{\LTpre}{0.15em}
\setlength{\LTpost}{0.25em}

% ---------- captions ----------
\usepackage{caption}
\captionsetup{font=small, labelsep=quad}

\begin{document}

% ================= COVER =================
\begin{titlepage}
\thispagestyle{empty}
\begin{center}
\vspace*{1.35cm}

\includegraphics[width=9.6cm]{assets/logo-nbu.png}

\vspace{4.7cm}

{\coverfont\zihao{1}\bfseries 软件工程课程需求报告}

\vspace{3.3cm}

{\coverfont\zihao{2}\bfseries 校园二手交易平台}

\vfill

{\coverfont\zihao{3} 林初仁\quad 赵俊豪\quad 吕锦浩\quad 马歆远\quad 过振宇}

\vspace{1.75cm}
\end{center}
\end{titlepage}

% ================= TOC =================
\setcounter{page}{2}
"""


def reorder_front_matter(md: str) -> str:
    """Put the real TOC first, then 编制分工/文档说明, then the body."""
    lines = md.splitlines()
    toc_i = next((k for k, l in enumerate(lines) if l.strip() == "## 目录"), None)
    if toc_i is None:
        return md
    front_start = next((k for k, l in enumerate(lines) if l.strip() == "## 编制分工"), 0)
    front = lines[front_start:toc_i]

    # skip the stub TOC table that follows "## 目录"
    j = toc_i + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    while j < len(lines) and lines[j].strip().startswith("|"):
        j += 1
    rest = lines[j:]

    return "\n".join(["## 目录", ""] + front + [""] + rest)


def build_note_appendix() -> str:
    """把从正文移出的说明性批注集中登记到附录 D。"""
    if not MOVED_NOTES:
        return ""

    groups, order = {}, []
    for head, text in MOVED_NOTES:
        cat = note_category(text)
        if cat not in groups:
            groups[cat] = []
            order.append(cat)
        groups[cat].append((head, text))

    out = [
        r"\clearpage",
        r"\section*{附录 D\quad 变更说明与批注归并表}",
        r"\addcontentsline{toc}{section}{附录 D\quad 变更说明与批注归并表}",
        r"\markboth{附录 D}{附录 D}",
        "",
        r"本附录集中登记原散落在各章节的演进说明、答辩口径与走查提醒。",
        r"这些内容不属于需求条目，因此正文不再保留；此处按类别归并，便于评审与答辩时统一查阅。",
        r"涉及需求本身的约束（如分类单层、禁售清单闭集、会话不是实体）仍保留在对应章节。",
        "",
    ]

    for idx, cat in enumerate(order, 1):
        title = f"D.{idx} {cat}"
        out.append(r"\subsection*{" + title + "}")
        out.append(r"\addcontentsline{toc}{subsection}{" + title + "}")
        for head, text in groups[cat]:
            place = esc(head.replace("#", "").strip())
            body = inline(text)
            stale = ""
            if ("撤销本身永远即时成立" in text) or ("为什么不用「双方同意」" in text):
                stale = (r" \\ {\footnotesize\color{gray}"
                         r"【注】此条为 V1.2.1 单方撤销口径的残留表述，与现行 BR-21"
                         r"「双方同意或管理员审批」冲突，已不适用，待清理。}")
            out.append(r"{\small\textbf{〔" + place + r"〕} " + body + stale + r"}\par")
            out.append(r"\vspace{0.35em}")
        out.append("")

    return "\n".join(out)


def main():
    md = SRC.read_text(encoding="utf-8")
    md = reorder_front_matter(md)
    body = convert(md)
    appendix = build_note_appendix()
    tex = PREAMBLE + "\n" + body + "\n\n" + appendix + "\n\n\\end{document}\n"
    OUT_TEX.write_text(tex, encoding="utf-8")
    print(f"wrote {OUT_TEX} ({len(tex)} chars)")
    print(f"moved notes: {len(MOVED_NOTES)}")


if __name__ == "__main__":
    main()


