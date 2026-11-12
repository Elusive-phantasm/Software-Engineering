package com.campus.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 治理与社交相关请求体：举报、处置、私信、账号状态、信用分调整。
 */
public final class SocialDtos {

    public record CreateReportRequest(
            @NotBlank(message = "请选择举报对象类型") String targetType,
            @NotNull(message = "请选择举报对象") Long targetId,
            @NotBlank(message = "请选择举报类型") String type,
            @NotBlank(message = "请填写举报说明") @Size(max = 200, message = "举报说明不得超过 200 字") String reason
    ) {
    }

    public record HandleReportRequest(
            boolean upheld,
            List<String> actions,
            @NotBlank(message = "请填写处理结论") String result,
            String categoryCode
    ) {
    }

    public record SendMessageRequest(
            @NotNull(message = "请选择商品") Long productId,
            Long toId,
            @NotBlank(message = "消息内容不能为空") @Size(max = 500, message = "消息长度不得超过 500 字") String content
    ) {
    }

    public record AccountStatusRequest(
            @NotBlank(message = "请选择账号状态") String status,
            @NotBlank(message = "请填写处理理由") String reason,
            Boolean deductCredit
    ) {
    }

    public record AdjustCreditRequest(
            @NotNull(message = "请填写调整幅度") Integer delta,
            @NotBlank(message = "请填写调整理由") String reason
    ) {
    }

    public record DeleteReviewRequest(@NotBlank(message = "请填写删除依据") String reason) {
    }
}
