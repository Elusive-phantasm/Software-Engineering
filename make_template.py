from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from pathlib import Path

out = Path(r'D:\实验报告\软件工程\校园二手交易\高质量编码评价能力课堂实践模板.docx')
doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(0.55)
sec.bottom_margin = Inches(0.55)
sec.left_margin = Inches(0.65)
sec.right_margin = Inches(0.65)

styles = doc.styles
styles['Normal'].font.name = 'Microsoft YaHei'
styles['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
styles['Normal'].font.size = Pt(10.5)

# title
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(8)
r = p.add_run('高质量编码评价能力课堂实践')
r.bold = True
r.font.name = 'Microsoft YaHei'
r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Microsoft YaHei')
r.font.size = Pt(20)
r.font.color.rgb = RGBColor(31, 78, 121)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(10)
r = p.add_run('参照模板个人独立完成')
r.italic = True
r.font.size = Pt(10.5)
r.font.color.rgb = RGBColor(89,89,89)

# info table
info = doc.add_table(rows=2, cols=2)
info.alignment = WD_TABLE_ALIGNMENT.CENTER
info.autofit = False
for row in info.rows:
    row.height = Inches(0.34)
    for c in row.cells:
        c.width = Inches(3.45)
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        tcPr = c._tc.get_or_add_tcPr()
        borders = OxmlElement('w:tcBorders')
        for edge in ('top','left','bottom','right','insideH','insideV'):
            e = OxmlElement(f'w:{edge}')
            e.set(qn('w:val'),'single'); e.set(qn('w:sz'),'4'); e.set(qn('w:color'),'D9E2F3')
            borders.append(e)
        tcPr.append(borders)
labels = ['姓名/学号：________________________________', '小组：______________________________', '代码基线与检查对象：________________________________________________________', '日期：______________________________']
for i, text in enumerate(labels):
    cell = info.cell(i//2, i%2)
    cell.text = text
    for p0 in cell.paragraphs:
        p0.paragraph_format.space_after = Pt(0)
        p0.paragraph_format.left_indent = Pt(4)
        for run in p0.runs: run.font.size = Pt(10.5)

doc.add_paragraph().paragraph_format.space_after = Pt(1)

questions = [
('1. 这段代码如何执行？', [
'输入：________________________________________________________________________________',
'关键条件：____________________________________________________________________________',
'调用顺序：____________________________________________________________________________',
'会修改的数据：________________________________________________________________________']),
('2. 我选择检查的质量要求是什么？', [
'依据编号及规则：______________________________________________________________________',
'对应代码位置：________________________________________________________________________']),
('3. 我的判断是什么？', [
'□ 已发现问题    □ 暂有风险需核验    □ 当前证据支持符合要求',
'理由：在 __________________ 条件下，代码会 ____________________________________________，因此 __________________________________________。',
'缺少的信息或需要继续查看的代码：______________________________________________________']),
('4. 如何验证？', [
'前置条件：____________________________________________________________________________',
'输入或操作：__________________________________________________________________________',
'按需求应该得到：______________________________________________________________________',
'还必须检查的数据或副作用：____________________________________________________________'])]

for title, lines in questions:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(title)
    r.bold = True; r.font.size = Pt(13); r.font.color.rgb = RGBColor(31,78,121)
    for line in lines:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.18)
        p.paragraph_format.first_line_indent = Inches(-0.18)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.05
        r = p.add_run(line)
        r.font.size = Pt(10.5)

# footer
footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = footer.add_run('高质量编码评价能力课堂实践')
r.font.size = Pt(8)
r.font.color.rgb = RGBColor(128,128,128)

doc.save(out)
print(out)
