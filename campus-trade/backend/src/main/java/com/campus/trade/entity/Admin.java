package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("admins")
public class Admin {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String adminNo;
    private String displayName;
    private String passwordHash;
    private Integer mustChangePassword;
    private Integer failedCount;
    private LocalDateTime lockedUntil;
    private LocalDateTime createdAt;
}
