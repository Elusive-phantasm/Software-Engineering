package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sessions")
public class LoginSession {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String subjectType;
    private Long subjectId;
    private String tokenHash;
    private LocalDateTime expiresAt;
    private Integer revoked;
    private String ip;
    private String userAgent;
    private LocalDateTime createdAt;
}
