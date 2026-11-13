"""Reuse diagram geometry and render UML state-machine notation."""
from pathlib import Path

source = (Path(__file__).parent / '生成状态图.py').read_text(encoding='utf-8')
source = source.replace("font = ImageFont.truetype(FONT, 22)", "font = ImageFont.truetype(FONT, 16)")
source = source.replace("fill='#edf7f5', outline='#28776b'", "fill='white', outline='black'")
source = source.replace('fillColor=#edf7f5;strokeColor=#28776b;', 'fillColor=#ffffff;strokeColor=#000000;')
source = source.replace('endArrow=block;', 'endArrow=open;endFill=0;')
source = source.replace("d.polygon([b,*wings], fill='#435962')", "d.line([wings[0], b, wings[1]], fill='black', width=2)")
source = source.replace("d.text((60, 35), name,", "d.text((60, 35), name + '（UML 状态机图）',")
source = source.replace("textcell('title', name,", "textcell('title', name + '（UML 状态机图）',")
source = source.replace("textcell(f'label{i}',label,*labelpos,480,75)", "textcell(f'label{i}',label,*labelpos,460,100,16)")
source = source.replace("    ET.indent(mx)", '''    # Final states terminate the modelled transaction lifecycle, not record retention.
    if name.startswith('SM-01'):
        terminal_keys = ['e', 'f', 'h']
    elif name.startswith('SM-02'):
        terminal_keys = ['d']
    else:
        terminal_keys = ['g4', 'g5', 'l4', 'l5', 'r3', 'r4']
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
    d.text((60,height-60),legend,font=font,fill='black')
    textcell('legend',legend,60,height-60,1480,35,17)
    ET.indent(mx)''')
source = source.replace("        d.line(points, fill='#435962', width=3)", '''        code = label.split(' ')[0]
        labels = {
            'ST-01':'ST-01 / 创建订单并锁定商品',
            'ST-03':'ST-03 卖家确认收款\\n[已核实到账且有买家标记] / 记录时间',
            'ST-04':'ST-04 双方确认交付安排\\n[时间、地点和方式一致]',
            'ST-05':'ST-05 卖家提交线下交付记录\\n[本人且无限制] / 保存唯一记录',
            'ST-06':'ST-06 买家确认收货\\n[有交付记录且满足 BR-14]',
            'ST-07':'ST-07 超时取消\\n[达到付款期限]',
            'ST-08':'ST-08 买家取消\\n[本人订单且未标记付款]',
            'ST-10':'ST-10 对方同意取消\\n[进入线下退款]',
            'ST-15':'ST-15 / 创建发布',
            'ST-16':'ST-16 审核通过\\n[内容合规] / 记录审核结果',
            'ST-17':'ST-17 审核拒绝或违规下架\\n[管理员有权限] / 记录原因',
            'ST-18':'ST-18 下单成功\\n[未被占用] / 绑定唯一订单',
            'ST-19':'ST-19 同步确认成交\\n[与 ST-06 或 ST-34 同一操作]',
            'ST-20':'ST-20 取消或退款完成后恢复销售\\n[允许继续销售] / 解除占用',
            'ST-21':'ST-21 重新提交\\n[限制解除]',
            'ST-22':'ST-22 卖家下架\\n[本人且在售]',
            'ST-23':'ST-23 违规处置\\n[违规成立]',
            'ST-24':'ST-24 禁止销售\\n[封禁或限制]',
            'ST-28':'ST-28 恢复在售\\n[无未结束订单]',
            'ST-29':'ST-29 违规处置联动取消\\n[待支付] / 不扣买家信用',
            'ST-30':'ST-30 自提点取货确认\\n[买家凭码取货] / 记录取货时间',
            'ST-32':'ST-32 买家确认收到退款\\n[卖家已标记退回] / 退款完成',
            'ST-33':'ST-33 取消已标记付款\\n[卖家满 48 小时未确认]',
            'ST-34':'ST-34 自动确认收货\\n[交付记录满 7 天且无争议]',
            'ST-35':'ST-35 恢复已预订\\n[仍有未结束订单]',
            'ST-36':'ST-36 卖家撤回\\n[仍待审核]',
            'ST-37':'ST-37 转入捐赠／回收\\n[无未结束订单]',
            'FT-01':'FT-01 提交捐赠申请 / 进入待入库',
            'FT-14':'FT-14 管理员确认入库\\n[实物与申报一致] / 进入待领取',
            'FT-02':'FT-02 预约领取 / 锁定领取名额',
            'FT-03':'FT-03 完成领取交接\\n[取件并确认发放] / 记录交接',
            'FT-04':'FT-04 关闭捐赠',
            'FT-15':'FT-15 回到待领取\\n[未取件或损坏]',
            'FT-05':'FT-05 提交借用申请',
            'FT-06':'FT-06 同意借用并交付\\n[双方完成借出确认]',
            'FT-07':'FT-07 到期检查\\n[超过约定归还时间]',
            'FT-08':'FT-08 归还确认\\n[双方确认]',
            'FT-09':'FT-09 借用申请关闭\\n[拒绝、撤回或超时] / 释放申请',
            'FT-16':'FT-16 超时自动归还\\n[一方标记满 7 天]',
            'FT-10':'FT-10 提交回收申请',
            'FT-11':'FT-11 受理回收申请\\n[管理员确认] / 记录受理人',
            'FT-12':'FT-12 确认回收完成\\n[交接完成] / 物品离场',
            'FT-13':'FT-13 回收取消\\n[拒收、超时或交接失败]',
        }
        label = labels.get(code,label)
        if code == 'ST-17':
            label = 'ST-17 审核拒绝或违规下架\\n[管理员有权限] / 记录原因'
        edges[i] = (src, dst, label, points, labelpos)
        d.line(points, fill='black', width=2)''')
exec(compile(source, str(Path(__file__)), 'exec'))
