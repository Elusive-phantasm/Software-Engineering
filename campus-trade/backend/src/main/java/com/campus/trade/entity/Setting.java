package com.campus.trade.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("settings")
public class Setting {
    @TableId(value = "k", type = IdType.INPUT)
    private String k;
    private String v;
    private LocalDateTime updatedAt;
}
