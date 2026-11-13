package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("credit_records")
public class CreditRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long studentId;
    private Integer delta;
    private String eventType;
    private String reason;
    private String sourceKey;
    private Long orderId;
    private LocalDateTime createdAt;
}
