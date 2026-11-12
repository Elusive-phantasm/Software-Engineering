package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("reports")
public class Report {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long reporterId;
    private String targetType;
    private Long targetProductId;
    private Long targetStudentId;
    private String targetKey;
    private String type;
    private String reason;
    private String handleStatus;
    private String actions;
    private String violationCodes;
    private String result;
    private Long handlerAdminId;
    private LocalDateTime handledAt;
    private LocalDateTime createdAt;
}
