package com.campus.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 商品相关请求体。价格用字符串传输，避免浮点误差（BR-05）。
 */
public final class ProductDtos {

    public record SaveRequest(
            @NotBlank(message = "请填写标题") String title,
            @NotBlank(message = "请填写描述") String description,
            @NotBlank(message = "请填写价格") String price,
            @NotBlank(message = "请选择成色") String condition,
            @NotNull(message = "请选择分类") Long categoryId,
            List<String> images
    ) {
    }

    /** 审核不通过。禁售类目编号仅在涉及禁售内容时填写。 */
    public record RejectRequest(
            @NotBlank(message = "请填写驳回原因") @Size(max = 200, message = "驳回原因不得超过 200 字") String reason,
            String categoryCode
    ) {
    }

    /** 管理员强制下架 */
    public record ForceOffRequest(
            @NotBlank(message = "请填写处置理由") @Size(max = 200, message = "处置理由不得超过 200 字") String reason,
            String categoryCode,
            Boolean deduct
    ) {
    }

    public record RestoreRequest(@NotBlank(message = "请填写撤销处置的理由")
                                 @Size(max = 200, message = "撤销处置理由不得超过 200 字") String reason) {
    }
}
