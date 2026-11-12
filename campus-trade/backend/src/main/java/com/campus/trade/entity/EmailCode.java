package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("email_codes")
public class EmailCode {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String email;
    private String purpose;
    private String codeHash;
    private LocalDateTime expiresAt;
    private Integer used;
    private Integer failCount;
    private LocalDateTime createdAt;
}
