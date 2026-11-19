package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("students")
public class Student {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String email;
    private String studentNo;
    private String nickname;
    private String realName;
    private String passwordHash;
    private String phone;
    private String dorm;
    private String certStatus;
    private String accountStatus;
    private Integer creditScore;
    private Integer reviewCount;
    private Integer verifiedDisputeCount;
    private Integer resubmitCount;
    private Integer failedLoginCount;
    private LocalDateTime lockedUntil;
    private LocalDateTime lastCertReminderAt;
    private LocalDateTime registeredAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
