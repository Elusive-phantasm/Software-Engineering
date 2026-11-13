package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("audit_logs")
public class AuditLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String actorType;
    private Long actorId;
    private String role;
    private String action;
    private String targetType;
    private Long targetId;
    private String result;
    private String reasonCode;
    private String detail;
    private LocalDateTime createdAt;
}
