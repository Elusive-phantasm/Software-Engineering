package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 私信。会话不建表，由同一（商品, 双方）的消息行聚合（SRS §6.2.1）。
 */
@Data
@TableName("messages")
public class ChatMessage {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long productId;
    private String senderType;
    private Long senderId;
    private String receiverType;
    private Long receiverId;
    private String content;
    private String readStatus;
    private LocalDateTime createdAt;
}
