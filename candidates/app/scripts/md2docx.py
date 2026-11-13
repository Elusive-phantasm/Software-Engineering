#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 docs/*.md 转成排版好的 Word 文档（docs/word/*.docx），用于课程交付。

支持：多级标题、段落、无序/有序列表、管道表格、代码块、引用块、分割线、**加粗**、`行内代码`。
用法：python scripts/md2docx.py
"""
import os
import re
import sys

# Windows 控制台默认 GBK，先切到 UTF-8 避免打印中文/符号时报错
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
OUT = os.path.join(DOCS, 'word')

CN_FONT = '微软雅黑'
MONO_FONT = 'Consolas'
ACCENT = RGBColor(0x16, 0x5C, 0x46)   # 与系统主色一致


def set_font(run, name=CN_FONT, size=None, bold=None, color=None):
    run.font.name = name
    run._element.rPr.rFonts.set(qn('w:eastAsia'), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = color


def shade(cell_or_par, hex_color):
    el = OxmlElement('w:shd')
    el.set(qn('w:val'), 'clear')
    el.set(qn('w:color'), 'auto')
    el.set(qn('w:fill'), hex_color)
    target = cell_or_par._tc.get_or_add_tcPr() if hasattr(cell_or_par, '_tc') else cell_or_par._p.get_or_add_pPr()
    target.append(el)


def add_inline(par, text, base_size=10.5, base_bold=False):
    """处理 **加粗** 与 `行内代码`，以及去掉 markdown 链接语法"""
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1', text)
    text = text.replace('\\|', '|')
    pattern = re.compile(r'(\*\*.+?\*\*|`[^`]+`)')
    pos = 0
    for m in pattern.finditer(text):
        if m.start() > pos:
            r = par.add_run(text[pos:m.start()])
            set_font(r, size=base_size, bold=base_bold)
        chunk = m.group(0)
        if chunk.startswith('**'):
            r = par.add_run(chunk[2:-2])
            set_font(r, size=base_size, bold=True)
        else:
            r = par.add_run(chunk[1:-1])
            set_font(r, name=MONO_FONT, size=base_size - 0.5, bold=base_bold)
            r.font.color.rgb = RGBColor(0x9A, 0x3B, 0x1F)
        pos = m.end()
    if pos < len(text):
        r = par.add_run(text[pos:])
        set_font(r, size=base_size, bold=base_bold)


def setup_document(title):
    doc = Document()

    # 页面：A4 + 合理页边距
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.top_margin = sec.bottom_margin = Cm(2.4)
    sec.left_margin = sec.right_margin = Cm(2.6)

    # 正文样式
    normal = doc.styles['Normal']
    normal.font.name = CN_FONT
    normal.font.size = Pt(10.5)
    normal.element.rPr.rFonts.set(qn('w:eastAsia'), CN_FONT)
    pf = normal.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    pf.line_spacing = 1.45
    pf.space_after = Pt(4)

    # 标题样式
    for idx, (size, color) in enumerate(
        [(20, ACCENT), (15, ACCENT), (12.5, RGBColor(0x17, 0x3D, 0x31)), (11, RGBColor(0x17, 0x3D, 0x31))], start=1
    ):
        st = doc.styles[f'Heading {idx}']
        st.font.name = CN_FONT
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = color
        st.element.rPr.rFonts.set(qn('w:eastAsia'), CN_FONT)
        st.paragraph_format.space_before = Pt(14 if idx <= 2 else 10)
        st.paragraph_format.space_after = Pt(6)

    # 页脚：文档名 + 页码
    footer_par = sec.footer.paragraphs[0]
    footer_par.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = footer_par.add_run(f'{title}　·　第 ')
    set_font(r, size=8.5, color=RGBColor(0x88, 0x88, 0x88))
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), 'PAGE')
    footer_par._p.append(fld)
    r2 = footer_par.add_run(' 页')
    set_font(r2, size=8.5, color=RGBColor(0x88, 0x88, 0x88))

    return doc


def add_table(doc, rows):
    header, body = rows[0], rows[1:]
    table = doc.add_table(rows=1, cols=len(header))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = table.rows[0].cells
    for i, text in enumerate(header):
        hdr[i].text = ''
        par = hdr[i].paragraphs[0]
        add_inline(par, text, base_size=9.5, base_bold=True)
        shade(hdr[i], 'EAF1ED')
    for row in body:
        cells = table.add_row().cells
        for i, text in enumerate(row[: len(header)]):
            cells[i].text = ''
            add_inline(cells[i].paragraphs[0], text, base_size=9)
    # 表格后留白
    doc.add_paragraph()


def convert(md_path, docx_path):
    with open(md_path, encoding='utf-8') as fh:
        lines = fh.read().split('\n')

    title = os.path.splitext(os.path.basename(md_path))[0]
    for line in lines:
        if line.startswith('# '):
            title = line[2:].strip()
            break

    doc = setup_document(title)
    i = 0
    first_h1_used = False

    while i < len(lines):
        line = lines[i].rstrip()

        # 空行
        if not line.strip():
            i += 1
            continue

        # 代码块
        if line.strip().startswith('```'):
            i += 1
            block = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                block.append(lines[i])
                i += 1
            i += 1
            for code_line in block:
                par = doc.add_paragraph()
                par.paragraph_format.left_indent = Cm(0.5)
                par.paragraph_format.space_after = Pt(0)
                par.paragraph_format.line_spacing = 1.1
                r = par.add_run(code_line if code_line.strip() else ' ')
                set_font(r, name=MONO_FONT, size=9)
                shade(par, 'F5F5F1')
            doc.add_paragraph()
            continue

        # 标题
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            level = len(m.group(1))
            text = re.sub(r'\*\*', '', m.group(2)).strip()
            if level == 1 and not first_h1_used:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                r = p.add_run(text)
                set_font(r, size=22, bold=True, color=ACCENT)
                p.paragraph_format.space_after = Pt(16)
                first_h1_used = True
            else:
                doc.add_heading(text, level=min(level - 1 if first_h1_used else level, 4) or 1)
            i += 1
            continue

        # 分割线
        if re.match(r'^(-{3,}|\*{3,}|_{3,})$', line.strip()):
            par = doc.add_paragraph()
            pPr = par._p.get_or_add_pPr()
            bdr = OxmlElement('w:pBdr')
            bottom = OxmlElement('w:bottom')
            bottom.set(qn('w:val'), 'single')
            bottom.set(qn('w:sz'), '6')
            bottom.set(qn('w:color'), 'CCCCCC')
            bdr.append(bottom)
            pPr.append(bdr)
            i += 1
            continue

        # 表格
        if line.strip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i + 1]):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                raw = lines[i].strip()
                if re.match(r'^\|[\s:|-]+\|$', raw):
                    i += 1
                    continue
                cells = [c.strip() for c in raw.strip('|').split('|')]
                rows.append(cells)
                i += 1
            if rows:
                add_table(doc, rows)
            continue

        # 引用块
        if line.strip().startswith('>'):
            buf = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                buf.append(re.sub(r'^\s*>\s?', '', lines[i]))
                i += 1
            par = doc.add_paragraph()
            par.paragraph_format.left_indent = Cm(0.4)
            add_inline(par, ' '.join(x.strip() for x in buf if x.strip()), base_size=9.5)
            shade(par, 'F7F7F3')
            continue

        # 无序列表
        m = re.match(r'^(\s*)[-*+]\s+(.*)$', line)
        if m:
            indent = len(m.group(1)) // 2
            level = 'List Bullet' if indent == 0 else 'List Bullet 2'
            par = doc.add_paragraph(style=level)
            add_inline(par, m.group(2))
            i += 1
            continue

        # 有序列表
        m = re.match(r'^(\s*)(\d+)[.)]\s+(.*)$', line)
        if m:
            indent = len(m.group(1)) // 2
            level = 'List Number' if indent == 0 else 'List Number 2'
            par = doc.add_paragraph(style=level)
            add_inline(par, m.group(3))
            i += 1
            continue

        # 普通段落
        par = doc.add_paragraph()
        add_inline(par, line.strip())
        i += 1

    doc.save(docx_path)
    return title


def main():
    os.makedirs(OUT, exist_ok=True)
    md_files = sorted(f for f in os.listdir(DOCS) if f.endswith('.md'))
    if not md_files:
        print('没有找到 Markdown 文档')
        return 1
    for name in md_files:
        src = os.path.join(DOCS, name)
        dst = os.path.join(OUT, os.path.splitext(name)[0] + '.docx')
        title = convert(src, dst)
        size = os.path.getsize(dst) / 1024
        print(f'  [OK] {name:<38} -> word/{os.path.basename(dst)}  ({size:.0f} KB)  {title}')
    print(f'\n共生成 {len(md_files)} 份 Word 文档，输出目录：docs/word/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
