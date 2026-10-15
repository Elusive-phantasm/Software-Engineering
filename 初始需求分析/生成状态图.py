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

nodes={'s':('',65,254,22,22),'a':('待支付',210,225,180,80),'b':('已支付',590,225,180,80),'c':('待确认',970,225,180,80),'d':('已完成',1350,225,180,80),'e':('已取消',210,650,180,80)}
edges=[('s','a','ST-01 下单',[(87,265),(210,265)],(90,205)),('a','b','ST-02 有效付款结果',[(390,265),(590,265)],(390,190)),('b','c','ST-05 卖家提交交付',[(770,265),(970,265)],(770,190)),('c','d','ST-06 买家确认收货',[(1150,265),(1350,265)],(1145,190)),('a','e','ST-03 系统到期检查\n[达到候选 24 小时]',[(250,305),(250,650)],(265,385)),('a','e','ST-04 买家取消\n[仍待支付]',[(210,265),(125,265),(125,690),(210,690)],(20,500)),('a','e','ST-07 管理员违规处置\n[待支付；下架或封禁]',[(390,285),(650,285),(650,690),(390,690)],(665,510))]
generate('SM-01-订单状态图','v0.1 · 建模对象：订单 · BR-03、BR-09～BR-14、BR-16 · 所有规则待确认',nodes,edges,['创建与商品预订联动；订单完成与商品售出联动；完整条件、权限及失败处理见 ST 表。','状态保持：ST-08 已取消后付款；ST-09 已付款交易转人工；ST-19 重复确认；ST-20 越权。','付款模式与 24 小时为候选；人工处置的退款、解除和终结路径尚待团队确定。'])

nodes={'s':('',65,254,22,22),'a':('待审核',210,225,180,80),'b':('在售',590,225,180,80),'c':('已预订',970,225,180,80),'d':('已售出',1350,225,180,80),'e':('已下架',590,650,180,80)}
edges=[('s','a','ST-10 发布',[(87,265),(210,265)],(90,205)),('a','b','ST-11 审核通过',[(390,265),(590,265)],(410,190)),('b','c','ST-13 下单成功',[(770,265),(970,265)],(790,190)),('c','d','ST-14 确认成交',[(1150,265),(1350,265)],(1180,190)),('c','b','ST-15 订单取消 [允许继续销售]',[(1060,225),(1060,155),(680,155),(680,225)],(690,120)),('a','e','ST-12 审核拒绝／违规下架',[(300,305),(300,690),(590,690)],(285,535)),('e','a','ST-16 修改后重新提交\n[限制解除且无未结束订单]',[(590,710),(160,710),(160,285),(210,285)],(20,740)),('b','e','ST-17 主动／管理员下架',[(680,305),(680,650)],(690,400)),('c','e','ST-17 管理员下架\nST-18 取消且禁止销售',[(1060,305),(1060,690),(770,690)],(1080,510))]
generate('SM-02-商品状态图','v0.1 · 建模对象：商品 · BR-08、BR-09、BR-13、BR-14、BR-16、BR-20 · 所有规则待确认',nodes,edges,['ST-17：卖家仅能下架在售商品；预订商品被管理员下架时，按订单付款状态联动处理。','状态保持：ST-21 非在售时下单；ST-22 卖家下架预订商品；ST-23 下架后订单取消。','已售出为本次发布的终态；再次流转创建新发布。完整条件、执行角色与失败处理见 ST 表。'])
print('Generated two editable draw.io files and two 1600x1000 PNG diagrams.')
