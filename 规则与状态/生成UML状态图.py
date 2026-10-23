"""Reuse diagram geometry and render UML state-machine notation."""
from pathlib import Path

source = (Path(__file__).parent / '生成状态图.py').read_text(encoding='utf-8')
source = source.replace("font = ImageFont.truetype(FONT, 22)", "font = ImageFont.truetype(FONT, 17)")
source = source.replace("fill='#edf7f5', outline='#28776b'", "fill='white', outline='black'")
source = source.replace('fillColor=#edf7f5;strokeColor=#28776b;', 'fillColor=#ffffff;strokeColor=#000000;')
source = source.replace('endArrow=block;', 'endArrow=open;endFill=0;')
source = source.replace("d.polygon([b,*wings], fill='#435962')", "d.line([wings[0], b, wings[1]], fill='black', width=2)")
source = source.replace("d.text((60, 35), name,", "d.text((60, 35), name + '（UML 状态机图）',")
source = source.replace("textcell('title', name,", "textcell('title', name + '（UML 状态机图）',")
source = source.replace("textcell(f'label{i}',label,*labelpos,480,75)", "textcell(f'label{i}',label,*labelpos,460,100,17)")
source = source.replace("    ET.indent(mx)", '''    # Final states terminate the modelled transaction lifecycle, not record retention.
    terminal_keys = ['e', 'f', 'h'] if name.startswith('SM-01') else (['d'] if 'd' in nodes else ['g3', 'g4', 'l3'])
    for key in terminal_keys:
        _, x, y, w, h = nodes[key]
        cx, cy = x+w/2, y+h+55
        d.line([(cx,y+h),(cx,cy-15)],fill='black',width=2)
        d.line([(cx-6,cy-25),(cx,cy-15),(cx+6,cy-25)],fill='black',width=2)
        d.ellipse((cx-15,cy-15,cx+15,cy+15),fill='white',outline='black',width=2)
        d.ellipse((cx-9,cy-9,cx+9,cy+9),fill='black')
        cell = ET.SubElement(root,'mxCell',id='final_'+key,value='',vertex='1',parent='1',style='ellipse;fillColor=#ffffff;strokeColor=#000000;')
        ET.SubElement(cell,'mxGeometry',x=str(cx-15),y=str(cy-15),width='30',height='30',attrib={'as':'geometry'})
        inner = ET.SubElement(root,'mxCell',id='inner_'+key,value='',vertex='1',parent='final_'+key,style='ellipse;fillColor=#000000;strokeColor=#000000;')
        ET.SubElement(inner,'mxGeometry',x='6',y='6',width='18',height='18',attrib={'as':'geometry'})
        edge=ET.SubElement(root,'mxCell',id='end_'+key,source=key,target='final_'+key,edge='1',parent='1',style='endArrow=open;endFill=0;strokeColor=#000000;')
        ET.SubElement(edge,'mxGeometry',relative='1',attrib={'as':'geometry'})
    legend='UML：实心圆 = 初始伪状态；靶心圆 = 终止状态；转换 = 事件 [守卫条件] / 效果。'
    d.text((60,940),legend,font=font,fill='black')
    textcell('legend',legend,60,940,1480,35,17)
    ET.indent(mx)''')
source = source.replace("        d.line(points, fill='#435962', width=3)", '''        code = label.split(' ')[0]
        labels = {
            'ST-01':'ST-01 / 创建订单',
            'ST-02':'ST-02 买家标记付款 / 记录时间并通知卖家',
            'ST-03':'ST-03 卖家确认收款\\n[已核实到账且有买家标记]',
            'ST-04':'ST-04 安排交付',
            'ST-05':'ST-05 卖家提交交付\\n[本人且无限制] / 保存交付记录',
            'ST-06':'ST-06 买家确认收货\\n[满足 BR-14] / 同步商品售出',
            'ST-07':'ST-07 到期检查\\n[达到付款期限] / 取消并处理商品',
            'ST-08':'ST-08 买家取消\\n[本人订单且未标记付款]',
            'ST-09':'ST-09 申请退款 / 线下处理资金',
            'ST-10':'ST-10 记录线下退款完成',
            'ST-15':'ST-15 / 创建发布',
            'ST-16':'ST-16 审核通过\\n[内容合规] / 记录审核结果',
            'ST-17':'ST-17 审核拒绝\\n[管理员有权限] / 保存理由',
            'ST-18':'ST-18 下单成功\\n[未被占用] / 绑定唯一订单',
            'ST-19':'ST-19 买家确认成交\\n[满足 BR-14] / 同步订单完成',
            'ST-20':'ST-20 订单取消 [允许继续销售] / 解除占用',
            'ST-21':'ST-21 卖家重新提交\\n[限制解除且无未结束订单] / 创建审核记录',
        }
        label = labels.get(code,label)
        if code in ('ST-01','ST-02','ST-05','ST-06','ST-10','ST-11','ST-13','ST-14'):
            labelpos = (labelpos[0], 165)
        if code == 'ST-17':
            label = ('ST-17 下架 [卖家本人或管理员]\\n/ 记录理由' if src == 'b' else 'ST-17 管理员下架 [权限有效]\\n/ 联动处理订单\\nST-18 订单取消 [禁止销售]\\n/ 解除占用、记录原因')
        d.line(points, fill='black', width=2)''')
exec(compile(source, str(Path(__file__)), 'exec'))
