from pathlib import Path
import xml.etree.ElementTree as ET
import math
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).parent
FONT = 'C:/Windows/Fonts/msyh.ttc'

def generate(name, subtitle, nodes, edges, notes, height=1000, groups=(), width=1800):
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
    's':('',40,360,22,22),
    'a':('待支付',200,300,180,70),
    'b':('已支付',500,300,180,70),
    'c':('待交付',800,300,180,70),
    'd':('待确认',1100,300,180,70),
    'e':('已完成',1400,300,180,70),
    'f':('已取消',200,820,180,70),
    'g':('退款中',760,820,180,70),
    'h':('已退款',1100,820,180,70),
}
edges=[
    ('s','a','ST-01 下单',[(62,371),(200,335)],(65,255)),
    ('a','b','ST-03 卖家确认收款',[(380,335),(500,335)],(395,245)),
    ('b','c','ST-04 双方确认交付安排',[(680,335),(800,335)],(695,245)),
    ('c','d','ST-05 卖家提交线下交付记录',[(980,335),(1100,335)],(985,245)),
    ('c','d','ST-30 自提点取货确认',[(860,300),(860,170),(1190,170),(1190,300)],(875,110)),
    ('d','e','ST-06 买家确认收货',[(1280,335),(1400,335)],(1285,230)),
    ('d','e','ST-34 交付满 7 天自动确认',[(1180,370),(1180,450),(1490,450),(1490,370)],(1200,400)),
    ('a','f','ST-07 到期自动取消',[(290,370),(290,820)],(300,455)),
    ('a','f','ST-08 买家取消',[(200,365),(90,365),(90,855),(200,855)],(25,500)),
    ('a','f','ST-29 违规处置联动取消',[(380,370),(470,430),(470,820),(380,820)],(430,690)),
    ('a','g','ST-33 买家取消已标记付款订单',[(350,370),(350,650),(700,650),(700,820)],(370,550)),
    ('b','g','ST-10 对方同意取消',[(560,370),(560,760),(780,760),(780,820)],(560,500)),
    ('c','g','ST-10 对方同意取消',[(860,370),(860,700),(820,700),(820,820)],(875,470)),
    ('d','g','ST-10 对方同意取消',[(1160,370),(1160,840),(760,840),(760,870)],(1030,690)),
    ('g','h','ST-32 买家确认收到退款',[(940,855),(1100,855)],(950,790)),
]
generate('SM-01-订单状态图','v0.5 · 订单 · 八个主状态；付款标记记录操作，卖家确认后才进入已支付',nodes,edges,['主链：待支付 → 已支付 → 待交付 → 待确认 → 已完成；ST-30 仅用于自提点取货确认。','ST-02、ST-09、ST-11、ST-12、ST-13、ST-14、ST-31 为状态保持：付款标记、取消申请、终态拒绝、人工处置、重复确认、越权操作、退款标记不单独画成功箭头。','付款后取消须对方同意：ST-10 进入退款中，ST-32 确认收到后退款完成。','ST-33 处理已标记付款但卖家满 48 小时未确认；ST-34 在交付满 7 天后自动确认收货。'],1300)

nodes={
    's':('',50,330,22,22),
    'a':('待审核',200,270,180,70),
    'b':('在售',520,270,180,70),
    'c':('已预订',840,270,180,70),
    'd':('已售出',1160,270,180,70),
    'e':('已下架',840,900,180,70),
}
edges=[
    ('s','a','ST-15 提交商品',[(72,341),(200,305)],(75,220)),
    ('a','b','ST-16 审核通过',[(380,305),(520,305)],(340,205)),
    ('b','c','ST-18 下单成功',[(700,305),(840,305)],(620,205)),
    ('c','d','ST-19 确认成交',[(1020,305),(1160,305)],(930,205)),
    ('c','b','ST-20 取消或退款完成 [允许继续销售]',[(900,270),(900,150),(580,150),(580,270)],(900,95)),
    ('a','e','ST-17 审核拒绝或违规下架',[(250,340),(250,650),(840,650),(840,935)],(260,620)),
    ('a','e','ST-36 卖家撤回待审商品',[(330,340),(330,760),(900,760),(900,900)],(340,710)),
    ('b','e','ST-22 卖家主动下架',[(570,340),(570,560),(760,560),(760,900)],(575,500)),
    ('b','e','ST-37 商品转入捐赠／回收',[(650,340),(650,700),(980,700),(980,900)],(660,650)),
    ('c','e','ST-23 管理员违规处置',[(930,340),(930,900)],(940,575)),
    ('c','e','ST-24 取消或退款完成 [禁止继续销售]',[(1000,340),(1080,450),(1080,900),(960,900)],(1080,520)),
    ('e','b','ST-28 撤销违规处置 [无未结束订单]',[(840,935),(720,935),(720,420),(520,420),(520,340)],(720,850)),
    ('e','c','ST-35 撤销违规处置 [存在未结束订单]',[(960,935),(1100,935),(1100,420),(930,420),(930,340)],(1100,850)),
    ('e','a','ST-21 修改后重新提交 [限制解除]',[(840,970),(110,970),(110,305),(200,305)],(115,500)),
]
generate('SM-02-商品状态图','v0.5 · 商品 · 固定五状态：待审核、在售、已预订、已售出、已下架',nodes,edges,['ST-22 卖家主动下架；ST-23 管理员违规处置；ST-36 卖家撤回待审；ST-37 与基于该商品的捐赠／回收申请同事务成功。','ST-28 在无未结束订单时恢复在售；ST-35 仍有未结束订单时恢复已预订。','ST-26、ST-27 为状态保持；捐赠、借用和回收不使用商品状态链。'],1350)

nodes={
    'g0':('',50,350,22,22),
    'g1':('待入库',200,300,180,70),
    'g2':('待领取',500,300,180,70),
    'g3':('已预约',800,300,180,70),
    'g4':('已转交',1100,300,180,70),
    'g5':('已取消',500,560,180,70),
    'l0':('',50,900,22,22),
    'l1':('申请中',200,850,180,70),
    'l2':('借用中',500,850,180,70),
    'l3':('逾期',800,850,180,70),
    'l4':('已归还',1100,850,180,70),
    'l5':('已取消',200,1120,180,70),
    'r0':('',50,1480,22,22),
    'r1':('申请中',200,1430,180,70),
    'r2':('已受理',500,1430,180,70),
    'r3':('已完成',800,1430,180,70),
    'r4':('已取消',500,1700,180,70),
}
edges=[
    ('g0','g1','FT-01 提交捐赠申请',[(72,361),(200,335)],(75,245)),
    ('g1','g2','FT-14 管理员确认入库',[(380,335),(500,335)],(345,235)),
    ('g2','g3','FT-02 预约领取',[(680,335),(800,335)],(655,235)),
    ('g3','g4','FT-03 完成领取交接',[(980,335),(1100,335)],(955,235)),
    ('g1','g5','FT-04 撤回、拒收或超期关闭',[(290,370),(290,525),(500,525),(500,560)],(210,470)),
    ('g2','g5','FT-04 待领取关闭',[(590,370),(590,560)],(510,455)),
    ('g3','g5','FT-04 已预约后关闭',[(890,370),(890,500),(680,500),(680,595),(500,595)],(760,510)),
    ('g3','g2','FT-15 逾期未取或损坏 [重新开放]',[(800,370),(800,220),(680,220),(680,300)],(560,180)),
    ('l0','l1','FT-05 提交借用申请',[(72,911),(200,885)],(75,785)),
    ('l1','l2','FT-06 同意借用并交付',[(380,885),(500,885)],(345,785)),
    ('l2','l3','FT-07 到期检查',[(680,885),(800,885)],(655,785)),
    ('l3','l4','FT-08 归还确认',[(980,885),(1100,885)],(930,795)),
    ('l2','l4','FT-08 按期归还确认',[(590,920),(590,1050),(1190,1050),(1190,920)],(540,1040)),
    ('l2','l4','FT-16 一方标记归还满 7 天自动确认',[(590,850),(590,740),(1190,740),(1190,850)],(850,720)),
    ('l3','l4','FT-16 一方标记归还满 7 天自动确认',[(890,920),(890,1010),(1150,1010),(1150,920)],(850,990)),
    ('l1','l5','FT-09 借用申请关闭',[(290,920),(290,1120)],(210,1030)),
    ('r0','r1','FT-10 提交回收申请',[(72,1491),(200,1465)],(75,1350)),
    ('r1','r2','FT-11 受理回收申请',[(380,1465),(500,1465)],(345,1350)),
    ('r2','r3','FT-12 确认回收完成',[(680,1465),(800,1465)],(655,1350)),
    ('r1','r4','FT-13 申请阶段取消',[(290,1500),(290,1700)],(300,1575)),
    ('r2','r4','FT-13 受理后取消或拒收',[(590,1500),(590,1700)],(600,1590)),
]
generate('物品流转状态图','v0.5 · 物品流转 · 捐赠、借用、回收独立于商品五状态',nodes,edges,['捐赠链：待入库 → 待领取 → 已预约 → 已转交；FT-14 管理员确认入库，FT-15 未取件或损坏时回到待领取。','借用链：申请中 → 借用中 → 逾期 → 已归还；双方确认按 FT-08，FT-16 在一方标记归还满 7 天后自动确认。','回收链：申请中 → 已受理 → 已完成；拒收、超时、交接失败或主动取消 → 已取消。','捐赠、借用和回收的同名状态按记录类型区分，不互相转换，也不占用商品五状态。','ST-37 与基于原在售商品的 FT-01／FT-10 同事务；流转取消后商品仍为已下架，须重新提交审核。'],2250,[('捐赠',70,130,120),('借用',70,700,120),('回收',70,1280,120)])
print('Generated three editable draw.io files and three PNG diagrams.')
