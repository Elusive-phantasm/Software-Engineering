from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from pathlib import Path
p=Path(r'D:/实验报告/软件工程/校园二手交易/质量分析报告_四问格式.docx')
d=Document(); s=d.sections[0]; s.top_margin=Inches(.65); s.bottom_margin=Inches(.65); s.left_margin=Inches(.8); s.right_margin=Inches(.8)
for st in d.styles:
    if st.type==1:
        st.font.name='Microsoft YaHei'; st._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei'); st.font.size=Pt(11)

def para(text='', bold=False, size=11, align=None, space=6):
    x=d.add_paragraph(); x.paragraph_format.space_after=Pt(space); x.paragraph_format.line_spacing=1.15
    if align is not None: x.alignment=align
    r=x.add_run(text); r.bold=bold; r.font.name='Microsoft YaHei'; r._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft YaHei'); r.font.size=Pt(size); return x
x=para('高质量编码评价能力课堂实践',True,20,WD_ALIGN_PARAGRAPH.CENTER,2)
para('参照模板个人独立完成',True,13,WD_ALIGN_PARAGRAPH.CENTER,12)
para('姓名/学号：____________________        小组：____________________',False,11,None,4)
para('代码基线与检查对象：PermissionService.java L70-104；ReportService.java L200-259；BanService.ban',False,11,None,12)
para('1．这段代码如何执行？',True,15,None,4)
para('输入：当前登录用户 AuthUser、学生或管理员账号、举报编号和处置请求，以及数据库中的商品、举报、信用分和账号状态数据。')
para('关键条件：学生必须完成认证；发布和下单分别检查信用分阈值；封禁账号不能发布与下单；管理员处理举报时必须先确认举报仍为待处理，并选择合法处置动作。')
para('调用顺序：PermissionService 获取当前主体并完成权限守卫；ReportService.handle 判断举报成立与否，成立后执行商品下架、信用扣分、限制发布或封禁；BanService.ban 更新账号并联动下架在售和待审核商品；最后更新举报状态、写入审计并发送通知。')
para('会修改的数据：学生账号状态、商品状态和下架信息、信用分及信用流水、举报处理状态、被核实争议数、通知和审计记录。',False,11,None,12)
para('2．我选择检查的质量要求是什么？',True,15,None,4)
para('依据编号及规则：BR-01、BR-10、BR-13、BR-14、BR-19，以及课堂要求中的业务规则、权限与副作用、失败处理、可维护性和可验证性。')
para('对应代码位置：PermissionService.java L70-104；ReportService.java L200-259；BanService.java ban 方法。',False,11,None,12)
para('3．我的判断是什么？',True,15,None,4)
para('已发现问题：限制发布只写入 RESTRICTED 状态，但发布资格校验没有检查该状态，因此限制发布可能不能真正阻止发布；封禁后复用 requireCertifiedStudent 会阻止被封禁学生举报，与“封禁后仍可举报”的规则冲突；举报成立后后端无条件扣分，但处置列表又把“扣信用分”展示为可选动作。')
para('暂有风险需核验：举报处理先读取 PENDING、最后才更新 HANDLED，缺少原子竞争控制，两个管理员并发处理时可能重复通知或重复执行部分处置；商品下架更新没有再次限定商品状态，存在并发成交或主动下架时覆盖状态的风险；BanService 对每个商品单独更新时间和更新，审计时间不一致且批量处置成本较高。')
para('当前证据支持符合要求：认证、信用阈值、封禁联动下架、已售商品不下架、认证状态不因封禁改变等主流程与既有规则一致。')
para('理由：在正常单线程路径下，代码能够完成权限判断和处置链路；在受限账号、封禁账号举报、重复管理员处理和商品状态并发变化等条件下，行为可能偏离业务规则。缺少的信息或需要继续查看的代码：数据库唯一约束、CreditService.apply 的幂等实现、事务隔离级别以及前端对“扣信用分”和“限制发布”的具体交互。',False,11,None,12)
para('4．如何验证？',True,15,None,4)
para('前置条件：准备已认证且信用分为 59、60、39、40 的学生，准备正常、受限、封禁三种账号状态，准备在售、待审核、已售和已删除商品，准备一条待处理商品举报和一条学生举报。')
para('输入或操作：分别执行发布、下单、举报、评价和私信；管理员选择强制下架、限制发布、封禁、扣信用分、警告及组合动作；并发使用两个管理员同时处理同一举报，同时模拟商品成交或主动下架。')
para('按需求应该得到：信用分边界按 60 和 40 正确拒绝或放行；限制发布确实阻止发布；封禁账号仍能提交举报但不能发布和下单；举报成立只处理一次并只扣一次分；封禁只联动下架在售和待审核商品；已售商品保持已售；失败和权限拒绝不改变业务数据。')
para('还必须检查的数据或副作用：学生账号状态、认证状态、信用分和信用流水；商品状态、下架原因、审核人和时间；举报状态、处置动作、处理人和处理时间；通知数量、审计日志、幂等键和事务回滚结果。',False,11,None,4)
d.save(p); print(p)
