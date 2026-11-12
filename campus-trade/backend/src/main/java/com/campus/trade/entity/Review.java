package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("reviews")
public class Review {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long orderId;
    private Long reviewerId;
    private Long targetId;
    private String content;
    private LocalDateTime createdAt;
    private Long deletedBy;
    private LocalDateTime deletedAt;
}
