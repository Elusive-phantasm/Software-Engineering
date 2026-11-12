package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("notifications")
public class Notification {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String recipientType;
    private Long recipientId;
    private String msgType;
    private String title;
    private String content;
    private String relatedKind;
    private Long relatedId;
    private Long productId;
    private Long peerId;
    private String readStatus;
    private LocalDateTime createdAt;
}
