from pathlib import Path
import xml.etree.ElementTree as ET
import math
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).parent
FONT = 'C:/Windows/Fonts/msyh.ttc'

def generate(name, subtitle, nodes, edges, notes):
    image = Image.new('RGB', (1600, 1000), 'white')
    d = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT, 22)
    title = ImageFont.truetype(FONT, 34)
    mx = ET.Element('mxfile', host='app.diagrams.net')
    diagram = ET.SubElement(mx, 'diagram', name=name, id=name[:5])
    model = ET.SubElement(diagram, 'mxGraphModel', page='1', pageWidth='1600', pageHeight='1000')
    root = ET.SubElement(model, 'root')
    ET.SubElement(root, 'mxCell', id='0')
    ET.SubElement(root, 'mxCell', id='1', parent='0')
    def textcell(id_, text, x, y, w, h, size=22):
        cell = ET.SubElement(root, 'mxCell', id=id_, value=text, vertex='1', parent='1', style=f'text;html=0;align=left;verticalAlign=top;whiteSpace=wrap;fontSize={size};fontFamily=Microsoft YaHei;')
        ET.SubElement(cell, 'mxGeometry', x=str(x), y=str(y), width=str(w), height=str(h), attrib={'as':'geometry'})
    d.text((60, 35), name, fill='#182d37', font=title)
    d.text((60, 90), subtitle, fill='#52616b', font=font)
    textcell('title', name, 60, 35, 1450, 50, 34)
    textcell('subtitle', subtitle, 60, 90, 1450, 45)
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
        if name.startswith('SM-01') and label.startswith('ST-04'):
            points = [(210,285),(125,285),(125,690),(210,690)]
        if name.startswith('SM-01') and label.startswith('ST-07'):
            points = [(360,305),(360,345),(650,345),(650,690),(390,690)]
        d.line(points, fill='#435962', width=3)
        a,b = points[-2:]
        angle = math.atan2(b[1]-a[1],b[0]-a[0])
        wings = [(b[0]-14*math.cos(angle+s),b[1]-14*math.sin(angle+s)) for s in (-0.45,0.45)]
        d.polygon([b,*wings], fill='#435962')
        box = d.multiline_textbbox(labelpos, label, font=font, spacing=5)
        d.rectangle((box[0]-5,box[1]-3,box[2]+5,box[3]+3), fill='white')
        d.multiline_text(labelpos,label,font=font,fill='#283d47',spacing=5)
        sx,sy,sw,sh = nodes[src][1:]
        tx,ty,tw,th = nodes[dst][1:]
        ex,ey = (points[0][0]-sx)/sw,(points[0][1]-sy)/sh
        ix,iy = (points[-1][0]-tx)/tw,(points[-1][1]-ty)/th
        cell = ET.SubElement(root,'mxCell',id=f'edge{i}',source=src,target=dst,parent='1',edge='1',style=f'edgeStyle=none;rounded=0;endArrow=block;exitX={ex};exitY={ey};entryX={ix};entryY={iy};strokeColor=#435962;')
        geo=ET.SubElement(cell,'mxGeometry',relative='1',attrib={'as':'geometry'})
        if len(points)>2:
            arr=ET.SubElement(geo,'Array',attrib={'as':'points'})
            for x,y in points[1:-1]: ET.SubElement(arr,'mxPoint',x=str(x),y=str(y))
        textcell(f'label{i}',label,*labelpos,480,75)
    for i,note in enumerate(notes):
        y=810+i*38
        d.text((60,y),note,font=font,fill='#52616b')
        textcell(f'note{i}',note,60,y,1480,36)
    ET.indent(mx)
    ET.ElementTree(mx).write(BASE/(name+'.drawio'),encoding='utf-8',xml_declaration=True)
    image.save(BASE/(name+'.png'))

nodes={'s':('',40,260,22,22),'a':('待支付',210,220,170,70),'b':('已支付',520,220,170,70),'c':('待交付',830,220,170,70),'d':('待确认',1140,220,170,70),'e':('已完成',1380,220,170,70),'f':('已取消',210,620,170,70),'g':('退款中',650,620,170,70),'h':('已退款',940,620,170,70)}
edges=[('s','a','ST-01 下单',[(62,271),(210,255)],(65,190)),('a','b','ST-02 买家标记付款 + ST-03 卖家确认收款',[(380,255),(520,255)],(350,175)),('b','c','ST-04 进入交付',[(690,255),(830,255)],(700,175)),('c','d','ST-05 提交交付记录',[(1000,255),(1140,255)],(1000,175)),('d','e','ST-06 确认收货',[(1310,255),(1380,255)],(1300,175)),('a','f','ST-07 到期自动取消',[(295,290),(295,620)],(310,410)),('a','f','ST-08 买家取消',[(240,290),(130,290),(130,655),(210,655)],(70,480)),('b','g','ST-09 申请退款',[(605,290),(605,500),(735,500),(735,620)],(580,465)),('c','g','ST-09 申请退款',[(915,290),(915,500),(735,500)],(920,465)),('d','g','ST-09 申请退款',[(1225,290),(1225,500),(735,500)],(1230,465)),('g','h','ST-10 记录线下退款完成',[(820,655),(940,655)],(815,585))]
generate('SM-01-订单状态图','v0.2 · 订单 · 八个主状态；买家付款标记是待支付期间的操作记录',nodes,edges,['主链：待支付 → 已支付 → 待交付 → 待确认 → 已完成。','买家标记付款不改变状态；卖家确认收款后，待支付才进入已支付。','付款后取消：退款中 → 已退款；退款由线下完成，平台只记录状态变化。'])
nodes={'s':('',50,260,22,22),'a':('待审核',180,220,170,70),'b':('在售',470,220,170,70),'c':('已预订',760,220,170,70),'d':('已售出',1050,220,170,70),'e':('已下架',760,620,170,70)}
edges=[('s','a','ST-15 提交商品',[(72,271),(180,255)],(80,190)),('a','b','ST-16 审核通过',[(350,255),(470,255)],(350,175)),('b','c','ST-18 下单成功',[(640,255),(760,255)],(640,175)),('c','d','ST-19 确认成交',[(930,255),(1050,255)],(930,175)),('c','b','ST-20 订单取消 [允许继续销售]',[(845,220),(845,150),(555,150),(555,220)],(545,110)),('a','e','ST-17 审核拒绝',[(265,290),(265,655),(760,655)],(275,485)),('e','a','ST-21 重新提交 [限制解除]',[(760,690),(120,690),(120,290),(180,290)],(60,710)),('b','e','ST-22 卖家主动下架',[(555,290),(555,500),(845,500),(845,620)],(560,465)),('c','e','ST-23 管理员违规处置',[(845,290),(845,620)],(870,430)),('c','e','ST-24 取消且禁止销售',[(930,290),(1100,290),(1100,655),(930,655)],(1110,475))]
generate('SM-02-商品状态图','v0.2 · 商品 · 固定五状态：待审核、在售、已预订、已售出、已下架',nodes,edges,['ST-22 仅表示卖家主动下架；ST-23 表示管理员违规处置，二者目标状态均为已下架。','捐赠和借用不使用商品状态链；已售出为本次发布终态。','拒绝、越权和状态不符均保持原状态，完整条件见 ST 表。'])

nodes={'g0':('',50,235,22,22),'g1':('待领取',140,200,170,70),'g2':('已预约',400,200,170,70),'g3':('已转交',660,200,170,70),'g4':('已取消',400,400,170,70),'l0':('',50,735,22,22),'l1':('申请中',140,700,170,70),'l2':('借用中',400,700,170,70),'l3':('已归还',1050,700,170,70),'l4':('逾期',700,700,170,70)}
edges=[('g0','g1','FT-01 发布捐赠',[(72,246),(140,235)],(70,160)),('g1','g2','FT-02 预约领取',[(310,235),(400,235)],(300,160)),('g2','g3','FT-03 完成交接',[(570,235),(660,235)],(560,160)),('g1','g4','FT-04 超期无人领取／捐赠者撤回',[(225,270),(225,435),(400,435)],(245,340)),('l0','l1','FT-05 提交借用申请',[(72,746),(140,735)],(70,660)),('l1','l2','FT-06 同意借用并交付',[(310,735),(400,735)],(300,660)),('l2','l4','FT-07 到期检查',[(570,735),(700,735)],(570,660)),('l4','l3','FT-08 归还确认',[(870,735),(1050,735)],(880,660)),('l2','l3','FT-08 按期归还',[(485,700),(485,620),(1135,620),(1135,700)],(650,580))]
generate('物品流转状态图','v0.2 · 物品流转 · 捐赠与借用独立于商品五状态',nodes,edges,['捐赠链：待领取 → 已预约 → 已转交；超期无人领取或捐赠者撤回 → 已取消。','借用链：申请中 → 借用中 → 已归还；借用中逾期 → 逾期 → 已归还。','FT-01～FT-08 的拒绝或失败分支均保持当前状态，不占用商品状态。'])
print('Generated three editable draw.io files and three 1600x1000 PNG diagrams.')
