from pathlib import Path
import xml.etree.ElementTree as ET
import math
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).parent
FONT = 'C:/Windows/Fonts/msyh.ttc'

def boundary_side(node, point, tolerance=0.5):
    _, x, y, w, h = node
    px, py = point
    if abs(px - x) <= tolerance and y - tolerance <= py <= y + h + tolerance:
        return 'left'
    if abs(px - (x + w)) <= tolerance and y - tolerance <= py <= y + h + tolerance:
        return 'right'
    if abs(py - y) <= tolerance and x - tolerance <= px <= x + w + tolerance:
        return 'top'
    if abs(py - (y + h)) <= tolerance and x - tolerance <= px <= x + w + tolerance:
        return 'bottom'
    return None

def validate_edges(nodes, edges):
    """Fail fast if an arrow misses a node or meets it at an angle."""
    for src, dst, label, points, _ in edges:
        if boundary_side(nodes[src], points[0]) is None:
            raise ValueError(f'{label}: start point is not on the source boundary')
        side = boundary_side(nodes[dst], points[-1])
        if side is None:
            raise ValueError(f'{label}: end point is not on the target boundary')
        dx = points[-1][0] - points[-2][0]
        dy = points[-1][1] - points[-2][1]
        if side in ('top', 'bottom') and abs(dx) > 0.5:
            raise ValueError(f'{label}: arrow must meet a horizontal edge vertically')
        if side in ('left', 'right') and abs(dy) > 0.5:
            raise ValueError(f'{label}: arrow must meet a vertical edge horizontally')

def generate(name, subtitle, nodes, edges, notes, height=1000, groups=(), width=1800):
    validate_edges(nodes, edges)
    image = Image.new('RGB', (width, height), 'white')
    d = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT, 22)
    title = ImageFont.truetype(FONT, 34)
    mx = ET.Element('mxfile', host='app.diagrams.net')
    diagram = ET.SubElement(mx, 'diagram', name=name, id=name[:5])
    model = ET.SubElement(diagram, 'mxGraphModel', page='1', pageWidth=str(width), pageHeight=str(height))
    root = ET.SubElement(model, 'root')
    ET.SubElement(root, 'mxCell', id='0')
    ET.SubElement(root, 'mxCell', id='1', parent='0')
    def textcell(id_, text, x, y, w, h, size=22):
        cell = ET.SubElement(root, 'mxCell', id=id_, value=text, vertex='1', parent='1', style=f'text;html=0;align=left;verticalAlign=top;whiteSpace=wrap;fontSize={size};fontFamily=Microsoft YaHei;')
        ET.SubElement(cell, 'mxGeometry', x=str(x), y=str(y), width=str(w), height=str(h), attrib={'as':'geometry'})
    d.text((60, 35), name, fill='#182d37', font=title)
    d.text((60, 90), subtitle, fill='#52616b', font=font)
    textcell('title', name, 60, 35, width-120, 50, 34)
    textcell('subtitle', subtitle, 60, 90, width-120, 45)
    for i, (text, x, y, w) in enumerate(groups):
        d.text((x, y), text, fill='#182d37', font=ImageFont.truetype(FONT, 28))
        textcell(f'group{i}', text, x, y, w, 38, 28)
    for key, (label, x, y, w, h) in nodes.items():
        start = label == ''
        style = 'ellipse;fillColor=#182d37;strokeColor=#182d37;' if start else 'rounded=1;arcSize=15;whiteSpace=wrap;html=0;fillColor=#edf7f5;strokeColor=#28776b;fontSize=26;fontFamily=Microsoft YaHei;'
        cell = ET.SubElement(root, 'mxCell', id=key, value=label, style=style, vertex='1', parent='1')
        ET.SubElement(cell, 'mxGeometry', x=str(x), y=str(y), width=str(w), height=str(h), attrib={'as':'geometry'})
        if start:
            d.ellipse((x,y,x+w,y+h), fill='#182d37')
        else:
            d.rounded_rectangle((x,y,x+w,y+h), radius=12, fill='#edf7f5', outline='#28776b', width=2)
            d.text((x+w/2,y+h/2), label, anchor='mm', fill='#182d37', font=ImageFont.truetype(FONT,26))
    for i, (src, dst, label, points, labelpos) in enumerate(edges):
        d.line(points, fill='#435962', width=3)
        a,b = points[-2:]
        angle = math.atan2(b[1]-a[1],b[0]-a[0])
        wings = [(b[0]-14*math.cos(angle+s),b[1]-14*math.sin(angle+s)) for s in (-0.45,0.45)]
        d.polygon([b,*wings], fill='#435962')
        sx,sy,sw,sh = nodes[src][1:]
        tx,ty,tw,th = nodes[dst][1:]
        ex,ey = (points[0][0]-sx)/sw,(points[0][1]-sy)/sh
        ix,iy = (points[-1][0]-tx)/tw,(points[-1][1]-ty)/th
        cell = ET.SubElement(root,'mxCell',id=f'edge{i}',source=src,target=dst,parent='1',edge='1',style=f'edgeStyle=none;rounded=0;endArrow=block;exitX={ex};exitY={ey};entryX={ix};entryY={iy};strokeColor=#435962;')
        geo=ET.SubElement(cell,'mxGeometry',relative='1',attrib={'as':'geometry'})
        if len(points)>2:
            arr=ET.SubElement(geo,'Array',attrib={'as':'points'})
            for x,y in points[1:-1]: ET.SubElement(arr,'mxPoint',x=str(x),y=str(y))
    for i, (_, _, label, _, labelpos) in enumerate(edges):
        box = d.multiline_textbbox(labelpos, label, font=font, spacing=5)
        d.rectangle((box[0]-5,box[1]-3,box[2]+5,box[3]+3), fill='white')
        d.multiline_text(labelpos,label,font=font,fill='#283d47',spacing=5)
        textcell(f'label{i}',label,*labelpos,480,75)
    note_y = height - 60 - 38 * len(notes) - 35
    for i,note in enumerate(notes):
        y=note_y+i*38
        d.text((60,y),note,font=font,fill='#52616b')
        textcell(f'note{i}',note,60,y,width-120,36)
    ET.indent(mx)
    ET.ElementTree(mx).write(BASE/(name+'.drawio'),encoding='utf-8',xml_declaration=True)
    image.save(BASE/(name+'.png'))

nodes={
    's':('',50,300,22,22),
    'a':('有效',240,276,180,70),
    'b':('已撤销',700,276,180,70),
}
edges=[
    ('s','a','下单成功 [商品为在售且满足下单规则] / 创建唯一成交',[(72,311),(240,311)],(75,220)),
    ('a','b','双方审批同意撤销 [申请方不能审批自己] / 恢复商品可交易状态',[(420,311),(700,311)],(440,150)),
]
generate('SM-01-订单状态图','V2.1 · 成交 · 仅记录有效、已撤销；平台不记录支付、交付或退款状态',nodes,edges,['成交创建与商品状态更新在同一事务内完成；同一商品最多一笔有效成交。','撤销申请先记录申请并保持有效；对方同意后才进入已撤销。'],900)

nodes={
    's':('',50,320,22,22),
    'a':('待审核',220,296,180,70),
    'b':('在售',600,296,180,70),
    'c':('已售出',980,296,180,70),
    'd':('已下架',600,700,180,70),
}
edges=[
    ('s','a','创建商品 [身份、信用与账号状态符合要求]',[(72,331),(220,331)],(75,230)),
    ('a','b','管理员审核通过 [内容合规] / 记录审核结果',[(400,331),(600,331)],(415,230)),
    ('b','c','下单成功 [商品仍为在售] / 创建有效成交',[(780,331),(980,331)],(795,230)),
    ('a','d','审核拒绝或管理员下架 [理由完整]',[(310,366),(310,700),(600,700)],(320,530)),
    ('b','d','卖家下架或转入捐赠／回收 [无未结束成交]',[(690,366),(690,700)],(700,520)),
    ('c','d','管理员处置 [违规成立] / 保留成交记录',[(1060,366),(1060,620),(700,620),(700,700)],(900,550)),
    ('d','a','修改后重新提交 [限制解除]',[(600,735),(130,735),(130,350),(220,350)],(145,560)),
    ('d','b','管理员撤销处置 [无未结束成交]',[(780,735),(880,735),(880,450),(690,450),(690,366)],(790,760)),
]
generate('SM-02-商品状态图','V2.1 · 商品 · 待审核、在售、已售出、已下架',nodes,edges,['商品下单成功后直接进入已售出，成交状态为有效。','已下架可重新提交审核；撤销处置且允许交易时恢复在售。','捐赠、借用和回收记录独立建模，不占用商品状态。'],1150)

nodes={
    'g0':('',50,324,22,22),
    'g1':('待入库',200,300,180,70),
    'g2':('待领取',500,300,180,70),
    'g3':('已预约',800,300,180,70),
    'g4':('已转交',1100,300,180,70),
    'g5':('已取消',500,560,180,70),
    'l0':('',50,874,22,22),
    'l1':('申请中',200,850,180,70),
    'l2':('借用中',500,850,180,70),
    'l3':('逾期',800,850,180,70),
    'l4':('已归还',1100,850,180,70),
    'l5':('已取消',200,1120,180,70),
    'r0':('',50,1454,22,22),
    'r1':('申请中',200,1430,180,70),
    'r2':('已受理',500,1430,180,70),
    'r3':('已完成',800,1430,180,70),
    'r4':('已取消',500,1700,180,70),
}
edges=[
    ('g0','g1','FT-01 提交捐赠申请',[(72,335),(200,335)],(75,245)),
    ('g1','g2','FT-14 管理员确认入库',[(380,335),(500,335)],(345,235)),
    ('g2','g3','FT-02 预约领取',[(680,335),(800,335)],(655,235)),
    ('g3','g4','FT-03 完成领取交接',[(980,335),(1100,335)],(955,235)),
    ('g1','g5','FT-04 撤回、拒收或超期关闭',[(290,370),(290,525),(530,525),(530,560)],(210,470)),
    ('g2','g5','FT-04 待领取关闭',[(620,370),(620,560)],(510,455)),
    ('g3','g5','FT-04 已预约后关闭',[(890,370),(890,500),(710,500),(710,595),(680,595)],(735,510)),
    ('g3','g2','FT-15 逾期未取或损坏 [重新开放]',[(860,300),(860,220),(650,220),(650,300)],(560,180)),
    ('l0','l1','FT-05 提交借用申请',[(72,885),(200,885)],(75,785)),
    ('l1','l2','FT-06 同意借用并交付',[(380,885),(500,885)],(345,785)),
    ('l2','l3','FT-07 到期检查',[(680,885),(800,885)],(655,785)),
    ('l3','l4','FT-08 归还确认',[(980,885),(1100,885)],(930,795)),
    ('l2','l4','FT-08 按期归还确认',[(590,920),(590,1050),(1190,1050),(1190,920)],(540,1040)),
    ('l2','l4','FT-16 一方标记归还满 7 天自动确认',[(590,850),(590,740),(1190,740),(1190,850)],(850,720)),
    ('l3','l4','FT-16 一方标记归还满 7 天自动确认',[(890,920),(890,1010),(1150,1010),(1150,920)],(850,990)),
    ('l1','l5','FT-09 借用申请关闭',[(290,920),(290,1120)],(210,1030)),
    ('r0','r1','FT-10 提交回收申请',[(72,1465),(200,1465)],(75,1350)),
    ('r1','r2','FT-11 受理回收申请',[(380,1465),(500,1465)],(345,1350)),
    ('r2','r3','FT-12 确认回收完成',[(680,1465),(800,1465)],(655,1350)),
    ('r1','r4','FT-13 申请阶段取消',[(290,1500),(290,1735),(500,1735)],(310,1575)),
    ('r2','r4','FT-13 受理后取消或拒收',[(590,1500),(590,1700)],(600,1590)),
]
generate('物品流转状态图','V2.1 · 物品流转 · 捐赠、借用、回收独立于商品四状态',nodes,edges,['捐赠：待入库 → 待领取 → 已预约 → 已转交；关闭进入已取消，未取件或损坏回到待领取。','借用：申请中 → 借用中 → 逾期 → 已归还；FT-16 支持一方标记后满 7 天自动归还。','回收：申请中 → 已受理 → 已完成；拒收、超时、交接失败或主动取消 → 已取消。','流转记录与商品状态分开；从在售商品转入流转时与商品下架在同一事务完成。'],2250,[('捐赠',70,130,120),('借用',70,700,120),('回收',70,1280,120)])
print('Generated three editable draw.io files and three PNG diagrams.')



