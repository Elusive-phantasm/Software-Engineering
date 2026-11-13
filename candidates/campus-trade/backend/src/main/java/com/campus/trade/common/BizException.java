package com.campus.trade.common;

import lombok.Getter;

/**
 * 业务异常：权限拒绝、状态拒绝、校验失败等一律抛出它，
 * 由 {@link GlobalExceptionHandler} 统一转为响应并写审计。
 */
@Getter
public class BizException extends RuntimeException {

    private final ErrorCode errorCode;

    public BizException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public BizException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public static BizException of(ErrorCode code, String message) {
        return new BizException(code, message);
    }

    /* ------------------------------ 语义化快捷方法（与需求表格的拒绝提示语对应） */

    public static BizException permission(String message) {
        return new BizException(ErrorCode.FORBIDDEN, message);
    }

    public static BizException state(String message) {
        return new BizException(ErrorCode.STATE_REJECTED, message);
    }

    public static BizException validate(String message) {
        return new BizException(ErrorCode.VALIDATION_FAILED, message);
    }

    public static BizException notFound(String message) {
        return new BizException(ErrorCode.NOT_FOUND, message);
    }

    public static BizException conflict(String message) {
        return new BizException(ErrorCode.CONFLICT, message);
    }

    public static BizException rateLimit(String message) {
        return new BizException(ErrorCode.RATE_LIMITED, message);
    }
}
