from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION
from pathlib import Path

out = Path(r'D:\实验报告\软件工程\校园二手交易\质量分析报告_权限与举报处置.docx')
doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(0.7); sec.bottom_margin = Inches(0.7); sec.left_margin = Inches(0.8); sec.right_margin = Inches(0.8)
styles = doc.styles
styles['Normal'].font.name='Microsoft YaHei'; styles['Normal']._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei'); styles['Normal'].font.size=Pt(10.5)
for s in ['Title','Heading 1','Heading 2','Heading 3']:
    styles[s].font.name='Microsoft YaHei'; styles[s]._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei'); styles[s].font.color.rgb=RGBColor(0,0,0)
styles['Title'].font.size=Pt(20); styles['Heading 1'].font.size=Pt(14); styles['Heading 2'].font.size=Pt(12)

def shade(cell, fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd'); shd.set(qn('w:fill'),fill); tcPr.append(shd)
def borders(table):
    tblPr=table._tbl.tblPr; b=tblPr.first_child_found_in('w:tblBorders')
    if b is None: b=OxmlElement('w:tblBorders'); tblPr.append(b)
    for edge in ('top','left','bottom','right','insideH','insideV'):
        el=b.find(qn('w:'+edge))
        if el is None: el=OxmlElement('w:'+edge); b.append(el)
        el.set(qn('w:val'),'single'); el.set(qn('w:sz'),'4'); el.set(qn('w:color'),'D9D9D9')
def add_bullet(text, level=0):
    p=doc.add_paragraph(style='List Bullet' if level==0 else 'List Bullet 2'); p.add_run(text); return p

t=doc.add_paragraph(style='Title'); t.alignment=WD_ALIGN_PARAGRAPH.CENTER; t.add_run('校园二手交易系统质量分析报告')
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; r=p.add_run('检查对象：权限校验、举报处置与账号封禁逻辑'); r.bold=True
p=doc.add_paragraph('本报告依据课堂质量评价要求，对 PermissionService.java、ReportService.java 和 BanService.java 的指定代码进行静态分析。分析关注业务规则、权限与副作用、失败处理、并发一致性和可验证性，不对代码做修改。')

doc.add_heading('一 检查范围与执行路径', level=1)
add_bullet('输入：当前登录主体 AuthUser、学生 Student、管理员 Admin、举报处理请求 HandleReportRequest，以及数据库中的商品、举报和信用记录。')
add_bullet('关键调用顺序：权限服务获取当前主体并校验认证、账号状态和信用分；管理员处理举报时选择处置动作；系统依次执行商品下架、信用扣分、限制发布或封禁；最后更新举报状态并发送通知。')
add_bullet('主要数据变化：学生账号状态、商品状态及下架原因、信用分与信用流水、举报处理状态、被核实争议数、通知和审计记录。')

doc.add_heading('二 质量要求与对应代码位置', level=1)
table=doc.add_table(rows=1, cols=3); table.alignment=WD_TABLE_ALIGNMENT.CENTER; borders(table)
for i,h in enumerate(['质量要求','对应代码位置','检查重点']): table.rows[0].cells[i].text=h; shade(table.rows[0].cells[i],'1F4E78')
rows=[('业务规则','PermissionService L70-104；ReportService L200-259；BanService.ban','认证状态、封禁状态、信用分阈值、举报处置规则是否一致'),('权限与副作用','PermissionService；ReportService.handle','权限拒绝是否不改数据，处置动作是否只影响目标对象'),('失败处理','ReportService.handle；BanService.ban','对象不存在、状态变化、重复处理时是否安全失败'),('可维护性','三个服务的条件分支与通知逻辑','规则是否集中、提示是否准确、重复逻辑是否可控'),('可验证性','状态更新、幂等键、审计和通知','是否能构造边界条件并观察结果')]
for row in rows:
    cells=table.add_row().cells
    for i,v in enumerate(row): cells[i].text=v; cells[i].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER

doc.add_heading('三 代码执行与行为分析', level=1)
doc.add_heading('1 PermissionService', level=2)
add_bullet('assertNotBanned 只检查 BANNED 状态并抛出 ACCOUNT_BANNED。实现简单且入口统一，但 Student 为空时会产生空指针。错误提示固定为“不可发布与下单”，被评价、举报和私信调用时语义不完全准确。')
add_bullet('requirePublishRights 的顺序为获取当前学生、认证校验、封禁校验、信用分校验。信用分低于配置阈值时拒绝发布。当前没有检查 RESTRICTED 状态，因此管理员执行“限制发布”后，发布入口仍可能放行。')
add_bullet('requireOrderRights 的校验链完整，认证、封禁和下单信用阈值均被检查。RESTRICTED 是否影响下单，需要由业务规则明确。')
add_bullet('requireCertifiedStudent 适合评价、举报、私信等认证功能，但它复用 assertNotBanned，导致被封禁学生无法提交举报。这与“封禁后仍可提交举报”的需求存在冲突。')

doc.add_heading('2 ReportService 处置流程', level=2)
add_bullet('强制下架：排除已售商品，写入管理员下架原因、审核人、审核时间和备注，并发送通知。问题在于更新语句没有检查受影响行数，查询后商品若被并发售出，仍可能被覆盖。')
add_bullet('扣信用分：举报成立后无条件调用 CreditService.apply，使用 violation:report:举报编号作为幂等键，能够防止同一举报重复扣分。代码中的“扣信用分”可选动作与后端必扣规则存在表达不一致。')
add_bullet('限制发布：只更新账号状态为 RESTRICTED。由于发布权限没有检查该状态，处置动作可能只改变展示状态，不能真正阻止发布。')
add_bullet('封禁账号：委托 BanService 执行，能够联动下架在售和待审核商品。封禁与限制发布同时选择时走 else if，只执行封禁，处置记录没有说明限制发布被折叠。')
add_bullet('并发处理：举报先查询 PENDING，最后才更新 HANDLED，缺少带状态条件的原子更新。两个管理员同时处理时，信用扣分虽然有幂等键，通知、封禁和商品处置仍可能重复。')
add_bullet('警告动作只写入 actions，没有单独的警告记录、通知类型或可追溯字段。若要求警告可审计，当前实现不充分。')

doc.add_heading('3 BanService.ban', level=2)
add_bullet('方法在事务中更新账号并批量查询在售、待审核商品，已售商品不受影响，符合封禁联动下架规则。认证状态不会被修改。')
add_bullet('商品逐条更新并逐条通知，商品数量较多时数据库和通知调用较多。每个商品分别获取当前时间，同一次处置的审计时间可能不一致。')
add_bullet('商品更新没有附带状态条件。若商品在封禁过程中被成交或主动下架，存在并发状态覆盖风险。')
add_bullet('重复封禁仍会发送账号封禁通知。方法返回受影响商品数量，不能区分首次封禁、重复封禁和部分更新失败。')

doc.add_heading('四 关键质量问题与判断', level=1)
t=doc.add_table(rows=1, cols=4); t.alignment=WD_TABLE_ALIGNMENT.CENTER; borders(t)
for i,h in enumerate(['编号','问题','判断','影响']): t.rows[0].cells[i].text=h; shade(t.rows[0].cells[i],'1F4E78')
issues=[('Q1','限制发布未接入发布权限','已发现问题','管理员处置后仍可能发布商品'),('Q2','举报成立必扣分与前端可选动作不一致','已发现问题','界面选择与实际信用变化不一致'),('Q3','举报处理缺少原子状态竞争控制','已有风险需验证','并发处理可能重复通知或重复处置'),('Q4','商品下架更新缺少状态条件','已有风险需验证','可能覆盖售出或已下架状态'),('Q5','封禁后举报权限与需求存在冲突','已发现规则冲突','封禁学生可能无法提交举报')]
for row in issues:
    cells=t.add_row().cells
    for i,v in enumerate(row): cells[i].text=v

doc.add_heading('五 验证方案', level=1)
checks=[('权限边界','认证状态 NONE、PENDING、REJECTED；账号状态 NORMAL、RESTRICTED、BANNED；信用分 59、60、39、40','发布、下单、举报和评价分别得到预期结果；拒绝时无数据变化'),('处置组合','商品举报分别选择下架、限制发布、封禁、扣分和警告，学生举报选择不允许的下架动作','动作合法性校验正确，状态、信用和通知与处置记录一致'),('并发处理','两个管理员同时处理同一 PENDING 举报','只有一个处理结果生效，不能重复扣分、封禁或发送重复处置通知'),('状态竞争','商品下架前并发成交、主动下架、删除','已售商品不被下架，已删除商品不被误更新'),('封禁联动','账号名下在售、待审核、已售和已删除商品混合','只下架在售和待审核商品，保留已售和已删除商品')]
t=doc.add_table(rows=1, cols=3); t.alignment=WD_TABLE_ALIGNMENT.CENTER; borders(t)
for i,h in enumerate(['验证类别','输入与操作','应观察结果']): t.rows[0].cells[i].text=h; shade(t.rows[0].cells[i],'1F4E78')
for row in checks:
    cells=t.add_row().cells
    for i,v in enumerate(row): cells[i].text=v

doc.add_heading('六 结论', level=1)
doc.add_paragraph('当前代码的主流程能够覆盖认证、信用门槛、举报成立、信用扣分、账号限制、封禁和商品联动下架等核心路径。质量风险集中在规则表达不一致和并发状态控制不足。优先关注限制发布未真正生效、扣信用分选项与后端规则不一致、举报重复处理以及商品状态竞争覆盖。上述问题均可通过边界测试、并发测试和数据库状态断言进行验证。')

# footer
for section in doc.sections:
    p=section.footer.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.add_run('校园二手交易系统质量分析')
doc.save(out)
print(out)
