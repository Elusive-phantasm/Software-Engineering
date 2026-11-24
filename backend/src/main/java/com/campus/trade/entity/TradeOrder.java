package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 订单（成交记录）。对应表 orders。
 * 注意：本版订单没有状态机，只有「成交状态」与「撤销免责判定」两个标记（SRS §7.1）。
 */
@Data
@TableName("orders")
public class TradeOrder {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long productId;
    private Long buyerId;
    private Long sellerId;
    private Integer amountCents;
    private String status;
    private Long cancelInitiatorId;
    private String cancelReason;
    private LocalDateTime cancelledAt;
    private Long cancelRequesterId;
    private String cancelRequestReason;
    private LocalDateTime cancelRequestedAt;
    private Long cancelApproverId;
    private LocalDateTime cancelApprovedAt;
    private String cancelJudgement;
    private LocalDateTime judgementAt;
    private LocalDateTime createdAt;
    private LocalDateTime deliveryDeadline;
    private LocalDateTime updatedAt;
}
