package com.campus.trade.dto;

import jakarta.validation.constraints.NotBlank;

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
            @NotBlank(message = "请填写驳回原因") String reason,
            boolean forgery
    ) {
    }

    public record RevokeRequest(
            @NotBlank(message = "请填写撤销认证的依据") String reason,
            boolean deductCredit
    ) {
    }
}
