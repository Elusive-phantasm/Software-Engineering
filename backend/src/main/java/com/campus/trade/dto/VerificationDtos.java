package com.campus.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 学生证核验相关请求体。
 */
public final class VerificationDtos {

    public record SubmitRequest(
            @NotBlank(message = "请填写申报学号") String declaredNo,
            @NotBlank(message = "请上传学生证图片") String cardImage
    ) {
    }

    public record RejectRequest(
            @NotBlank(message = "请填写驳回原因") @Size(max = 200, message = "驳回原因不得超过 200 字") String reason,
            boolean forgery
    ) {
    }

    public record RevokeRequest(
            @NotBlank(message = "请填写撤销认证的依据") @Size(max = 200, message = "撤销认证依据不得超过 200 字") String reason,
            boolean deductCredit
    ) {
    }
}
