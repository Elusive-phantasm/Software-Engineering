package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("certification_applications")
public class CertificationApplication {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long studentId;
    private String declaredNo;
    private String cardImage;
    private String reviewStatus;
    private Long reviewerId;
    private LocalDateTime reviewedAt;
    private String rejectReason;
    private Integer forgeryFlag;
    private LocalDateTime submittedAt;
}
