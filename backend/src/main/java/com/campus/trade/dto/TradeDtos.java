package com.campus.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 交易相关请求体：下单、撤销、免责判定、评价。
 */
public final class TradeDtos {

    public record CreateOrderRequest(@NotNull(message = "请选择商品") Long productId) {
    }

    /** 撤销原因必须取自 UC-31 主事件流第 1 步的固定选项 */
    public record CancelRequest(@NotBlank(message = "请选择撤销原因") String reason) {
    }

    public record JudgeRequest(@NotBlank(message = "请选择判定结论") String judgement) {
    }

    public record ReviewRequest(
            @NotBlank(message = "请填写评价内容")
            @Size(max = 500, message = "评价内容不得超过 500 字") String content
    ) {
    }

    /** 批量查询用（我的收藏等） */
    public record IdsRequest(List<Long> ids) {
    }
}
