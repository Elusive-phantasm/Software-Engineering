"""独立读取实际交付文件进行质量核对，不调用或运行生成脚本。"""
from pathlib import Path
import ast
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from PIL import Image

OUT=Path(__file__).resolve().parent.parent
phase=sys.argv[1] if len(sys.argv)>1 else '复核'
SOURCE=OUT.parent/'马歆远-数据与权限.md'
required=[
 '01_UML类图/校园二手交易平台_UML类图.drawio',
 '01_UML类图/校园二手交易平台_UML类图.png',
 '01_UML类图/类图说明.md','02_数据字典.md','03_权限矩阵.md',
 '04_非功能性质量需求.md','05_待组长确认事项.md',
 '06_一致性检查报告.md','数据与权限需求分析_整合初稿.md','README.md'
]
checks=[]
def check(label,condition,detail):
    checks.append(dict(check=label,passed=bool(condition),detail=detail))
def read(name):return (OUT/name).read_text(encoding='utf-8')
def norm(s):return re.sub(r'\s+','',s)
def rows(text):
    return [[c.strip() for c in line.strip().strip('|').split('|')] for line in text.splitlines() if line.startswith('|') and not re.match(r'^\|[- :|]+\|$',line)]
def shift(text):return re.sub(r'^(#{1,5}) ',lambda m:'#'+m[1]+' ',text,flags=re.M)

src=SOURCE.read_text(encoding='utf-8')
missing=[p for p in required if not (OUT/p).is_file() or not (OUT/p).stat().st_size]
check('十项原要求文件存在且非空',not missing,missing or required)
dd=read('02_数据字典.md'); note=read('01_UML类图/类图说明.md')
perm=read('03_权限矩阵.md'); quality=read('04_非功能性质量需求.md')
pending=read('05_待组长确认事项.md'); integrated=read('数据与权限需求分析_整合初稿.md')

tables={}
for m in re.finditer(r'^### ([^\n]+)\n(.*?)(?=^### |^## |\Z)',dd,re.M|re.S):
    entity=m[1].split('（')[0]
    data=rows(m[2])
    if not data:continue
    check(entity+'字典表五列完整',data[0]==['字段名称','数据类型','业务含义','约束条件','是否必填'] and all(len(r)==5 and all(r) for r in data[1:]),len(data)-1)
    fs={r[0]:dict(kind=r[1],meaning=r[2],constraint=r[3],required=r[4]) for r in data[1:]}
    check(entity+'字段不重名且为逻辑类型',len(fs)==len(data)-1 and all(f['kind'] in ['文本','数值','日期时间','布尔值','枚举','列表'] for f in fs.values()),list(fs))
    tables[entity]=fs
expected={'学生','商品','订单','分类','评价','举报记录','信用记录','管理员'}
check('字典七核心实体及管理员',set(tables)==expected,list(tables))
product_original=next(r for r in rows(src) if len(r)==4 and r[0]=='状态')[2]
orig_states=[s.strip() for s in product_original.split('/')]
dict_states=re.search(r'仅取原文五值：([^；]+)',tables['商品']['商品状态']['constraint'])[1].split('、')
check('商品五状态与原文一致',orig_states==dict_states,dict_states)
check('原文商品八字段均有对应',set(['商品编号','标题','价格','成色','图片','发布人学号','分类编号','商品状态']).issubset(tables['商品']),list(tables['商品']))
check('订单候选状态显式待确认','正式状态集合未提供' in tables['订单']['订单状态']['constraint'] and '待确认' in tables['订单']['订单状态']['constraint'],tables['订单']['订单状态']['constraint'])

graph=ET.parse(OUT/required[0]); root=graph.getroot()
allcells=root.findall('.//mxCell'); cells={c.get('id'):c for c in allcells}
check('drawio标准根及单页图模型',root.tag=='mxfile' and len(root.findall('diagram'))==1 and root.find('./diagram/mxGraphModel/root') is not None,root.tag)
check('drawio单元标识唯一',len(cells)==len(allcells),len(cells))
boxes={id_:c for id_,c in cells.items() if c.get('vertex')=='1' and c.get('style','').startswith('swimlane;')}
definitions={c.get('value'):id_ for id_,c in boxes.items() if '«引用»' not in c.get('value','')}
check('实际drawio实体覆盖字典',set(definitions)==set(tables),definitions)
attribute_count=0
for name,id_ in definitions.items():
    actual={}
    for c in allcells:
        if c.get('parent')!=id_ or c.get('vertex')!='1':continue
        m=re.fullmatch(r'- (.*?) : (\S+?)(?: \[(0\.\.1|0\.\.\*)\])?',c.get('value',''))
        if m:actual[m[1]]=(m[2],m[3])
    fs=tables[name]
    ok=set(actual)==set(fs)
    for f,(kind,multi) in actual.items():
        if f not in fs:ok=False;continue
        expected_multi='0..*' if fs[f]['kind']=='列表' else ('0..1' if fs[f]['required']!='是' else None)
        ok=ok and kind==fs[f]['kind'] and multi==expected_multi
    attribute_count+=len(actual)
    check(name+'实际图中文字与字典字段类型可空性相符',ok,list(actual))

edges=[c for c in allcells if c.get('edge')=='1']
refs={
 'publishes':('商品','发布人学号','学生','学号'),
 'places':('订单','下单人学号','学生','学号'),
 'category_products':('商品','分类编号','分类','分类编号'),
 'product_orders':('订单','商品编号','商品','商品编号'),
 'review_author':('评价','评价人学号','学生','学号'),
 'review_receiver':('评价','被评价人学号','学生','学号'),
 'student_credit':('信用记录','学生学号','学生','学号'),
 'order_reviews':('评价','订单编号','订单','订单编号'),
 'order_credit':('信用记录','关联订单编号','订单','订单编号'),
 'product_reports':('举报记录','被举报商品编号','商品','商品编号'),
 'student_reports':('举报记录','举报学生学号','学生','学号'),
 'admin_reports':('举报记录','举报管理员编号','管理员','管理员编号'),
 'admin_handles':('举报记录','处理管理员编号','管理员','管理员编号')
}
check('实际图13条关联齐全',set(c.get('id') for c in edges)==set(refs),len(edges))
segments=[]
edge_evidence=[]
for e in edges:
    id_=e.get('id'); a=boxes[e.get('source')]; b=boxes[e.get('target')]
    an=a.get('value').split(' «')[0];bn=b.get('value').split(' «')[0]
    se,sf,te,tf=refs[id_]
    m1=cells[id_+'_m1'].get('value');m2=cells[id_+'_m2'].get('value')
    ok={an,bn}=={se,te} and sf in tables[se] and tf in tables[te]
    ok=ok and tables[se][sf]['kind']==tables[te][tf]['kind']=='文本'
    ok=ok and m1==('0..1' if tables[se][sf]['required']!='是' else '1') and m2=='0..*'
    check(id_+'实际关联端点多重性及引用字段',ok,dict(source=an,target=bn,multiplicity=[m1,m2],field=f'{se}.{sf} → {te}.{tf}'))
    edge_evidence.append(dict(id=id_,source=an,target=bn,multiplicity=[m1,m2]))
    style=dict(pair.split('=',1) for pair in e.get('style').split(';') if '=' in pair)
    ag=a.find('mxGeometry').attrib;bg=b.find('mxGeometry').attrib
    start=(float(ag['x'])+float(ag['width'])*float(style['exitX']),float(ag['y'])+float(ag['height'])*float(style['exitY']))
    end=(float(bg['x'])+float(bg['width'])*float(style['entryX']),float(bg['y'])+float(bg['height'])*float(style['entryY']))
    points=[start]+[(float(p.get('x')),float(p.get('y'))) for p in e.findall('./mxGeometry/Array/mxPoint')]+[end]
    segments.extend((id_,p,q) for p,q in zip(points,points[1:]))

crosses=[];penetrations=[]
eps=1e-5
for i,(eid,a,b) in enumerate(segments):
    for cid,c in boxes.items():
        g=c.find('mxGeometry');x0,y0,w,h=[float(g.get(k)) for k in ('x','y','width','height')];x1,y1=x0+w,y0+h
        hit=(x0+eps<a[0]<x1-eps and max(min(a[1],b[1]),y0)<min(max(a[1],b[1]),y1)-eps) if abs(a[0]-b[0])<eps else (y0+eps<a[1]<y1-eps and max(min(a[0],b[0]),x0)<min(max(a[0],b[0]),x1)-eps)
        if hit:penetrations.append([eid,cid])
    for fid,c,d in segments[i+1:]:
        if eid==fid:continue
        av=abs(a[0]-b[0])<eps;cv=abs(c[0]-d[0])<eps
        if av!=cv:
            v0,v1,h0,h1=(a,b,c,d) if av else (c,d,a,b)
            hit=min(v0[1],v1[1])-eps<=h0[1]<=max(v0[1],v1[1])+eps and min(h0[0],h1[0])-eps<=v0[0]<=max(h0[0],h1[0])+eps
        elif av:hit=abs(a[0]-c[0])<eps and max(min(a[1],b[1]),min(c[1],d[1]))<=min(max(a[1],b[1]),max(c[1],d[1]))+eps
        else:hit=abs(a[1]-c[1])<eps and max(min(a[0],b[0]),min(c[0],d[0]))<=min(max(a[0],b[0]),max(c[0],d[0]))+eps
        if hit:crosses.append([eid,fid])
check('实际XML连线不穿框且彼此无交叉重叠',not crosses and not penetrations,dict(crosses=crosses,penetrations=penetrations))
check('两个实际关系表完全相同',rows(dd.split('## 实体关系说明')[1].split('## 关联字段')[0])==rows(note.split('## 关联与多重性')[1].split('## 需要保持')[0]),'逐单元比对13条关联')

orig_permission=[r for r in rows(src) if len(r)==5 and r[1] in ('✅','❌')]
out_permission=rows(perm.split('## 基础权限矩阵')[1].split('## 允许操作')[0])
check('四角色九操作36格与原文逐格一致',len(orig_permission)==9 and len(out_permission)==10 and out_permission[0][:5]==['操作','游客','未认证学生','已认证学生','管理员'] and all(a[0]==b[0] and [('允许' if v=='✅' else '拒绝') for v in a[1:]]==b[1:5] for a,b in zip(orig_permission,out_permission[1:])),out_permission[1:])
check('每项有拒绝说明并指向统一审计与不变规则',all(len(r)==6 and r[5] and '审计规则' in r[5] for r in out_permission[1:]) and all(t in perm for t in ['必要审计','权限拒绝不改变业务','权限拒绝与状态拒绝区分']),len(out_permission)-1)

nfr_parts={m[1]:m[2] for m in re.finditer(r'^## (NFR-\d{2}) [^\n]+\n(.*?)(?=^## |\Z)',quality,re.M|re.S)}
check('八项NFR顺序与定义编号唯一',list(nfr_parts)==[f'NFR-{i:02d}' for i in range(1,9)],list(nfr_parts))
nfr_evidence={}
for row in rows(src):
    if len(row)!=3 or not re.fullmatch('NFR-0[1-8]',row[0]):continue
    id_=row[0];data=dict(rows(nfr_parts[id_])[1:]);nfr_evidence[id_]=data
    check(id_+'验收字段齐全',all(k in data and data[k] for k in ['需求编号','需求名称','需求描述与依据','测试前提／适用范围','量化指标与统计口径','验收方式']),list(data))
    if id_!='NFR-03':
        orig_nums=re.findall(r'\d+(?:\.\d+)?',row[2]);out_nums=re.findall(r'\d+(?:\.\d+)?',data['需求描述与依据'])
        check(id_+'原文描述数值不变',orig_nums==out_nums,dict(source=orig_nums,output=out_nums))
    else:check('500人为待确认建议','500' in data['需求描述与依据'] and '建议值，待确认' in data['需求描述与依据'],data['需求描述与依据'])

intro_start=dd.index('本初稿依据');intro_end=dd.index('以下为逻辑数据定义')
dd_without_intro=dd[:intro_start]+dd[intro_end:]
for name,body in [('UML 类图及说明',note.replace('](校园二手交易平台_UML类图.png)','](01_UML类图/校园二手交易平台_UML类图.png)')),('数据字典',dd_without_intro),('权限矩阵',perm),('非功能性质量需求',quality),('待组长确认事项',pending)]:
    check('整合稿完整包含独立'+name,norm(shift(body)) in norm(integrated),name)
actual_top=re.findall(r'^## (.+)$',integrated,re.M)
check('整合稿五部分顺序正确',actual_top==['UML 类图及说明','数据字典','权限矩阵','非功能性质量需求','待组长确认事项'],actual_top)

md_issues=[]
for p in OUT.rglob('*.md'):
    s=p.read_text(encoding='utf-8');count=None
    for index,line in enumerate(s.splitlines(),1):
        if '\ufffd' in line:md_issues.append([str(p.relative_to(OUT)),index,'替换字符'])
        if line.startswith('|'):
            width=len(line.split('|'))-2
            if not line.endswith('|') or (count is not None and count!=width):md_issues.append([str(p.relative_to(OUT)),index,'表格列数'])
            count=width
        else:count=None
    for link in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',s):
        link=link.strip('<>')
        if not re.match(r'^[a-z]+://',link) and not (p.parent/link).is_file():md_issues.append([str(p.relative_to(OUT)),link,'本地引用不存在'])
check('全部实际Markdown格式及本地引用完整',not md_issues,md_issues)
unexpected=[]
for name in ['02_数据字典.md','03_权限矩阵.md','04_非功能性质量需求.md','01_UML类图/类图说明.md','数据与权限需求分析_整合初稿.md']:
    unexpected.extend((name,v) for v in re.findall(r'\b(?:UC|BR|ST|SC|V)-\d+\b',read(name)))
check('无擅自分配其他组员正式编号',not unexpected,unexpected)
with Image.open(OUT/required[1]) as im:
    im.verify()
with Image.open(OUT/required[1]) as im:
    png_size=im.size;fmt=im.format;extrema=im.convert('RGB').getextrema()
check('PNG实际解码且非空白',fmt=='PNG' and png_size==(4200,3750) and any(a!=b for a,b in extrema),dict(format=fmt,pixels=png_size))
for name in ['辅助文件/生成与检查.py','辅助文件/质量验收检查.py']:
    ast.parse(read(name),filename=name)
check('辅助脚本Python语法可解析',True,'只作语法检查；未执行生成脚本或交易系统')
if phase!='修订前复核':
    check('隐私字段明确区分原文权限与建议场景',all('仅本人和管理员可见；管理员最小必要访问场景为建议，待确认' in tables['学生'][f]['constraint'] for f in ['手机号','宿舍地址']),'两项隐私字段')
    check('拒绝不新增商品的统一规则明确','不创建商品、订单、评价、举报或信用记录' in perm,'与发布拒绝走查一致')
    check('举报自动处置只作待确认标注','也不自动下架商品' not in perm and '是否触发自动下架或其他处置缺少正式定义，待组长确认' in perm,'不自行决定成功举报后的状态变化')
    check('NFR01不默认缩小到20条首屏','20 条' not in nfr_parts['NFR-01'] and '不以较少商品的首屏加载结果替代原文要求' in nfr_parts['NFR-01'],'200条、50人、2秒不变；完成范围待确认')

old=json.loads(read('辅助文件/文件校验记录.json'))
old_match=[]
for record in old['files']:
    p=OUT/record['file']
    old_match.append(dict(file=record['file'],matches=p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==record['sha256']))

evidence_path=OUT/'辅助文件/质量验收实测记录.json'
history=json.loads(evidence_path.read_text(encoding='utf-8')) if evidence_path.exists() else {}
if '修订前复核' in history:
    check('原始任务说明修订前后哈希不变',history['修订前复核']['source_sha256']==hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'未修改最高依据')
inventory=[]
for p in sorted(OUT.rglob('*')):
    if p.is_file() and p!=evidence_path:
        raw=p.read_bytes();inventory.append(dict(file=p.relative_to(OUT).as_posix(),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest()))
result=dict(phase=phase,source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),required_count=len(required),entities=len(tables),fields=attribute_count,edges=len(edges),permission_cells=36,nfr_count=len(nfr_parts),check_count=len(checks),passed=sum(c['passed'] for c in checks),failed=[c for c in checks if not c['passed']],checks=checks,edge_evidence=edge_evidence,nfr_evidence=nfr_evidence,previous_manifest_comparison=old_match,inventory=inventory,not_executed=['diagrams.net实际打开编辑及再次导出','真实业务系统性能容量安全易用性及可用性测试'])
history[phase]=result
evidence_path.write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:result[k] for k in ['phase','required_count','entities','fields','edges','permission_cells','nfr_count','check_count','passed','failed']},ensure_ascii=False,indent=2))
print('旧清单相符：',sum(i['matches'] for i in old_match),'/',len(old_match))
print('实际整合稿前言及结构：')
print('\n'.join(integrated.splitlines()[:16]))
print(actual_top)
if result['failed']:sys.exit(1)
