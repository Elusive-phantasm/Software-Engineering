package com.campus.trade.common;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * 业务错误码。code 供前端判断，status 用于 HTTP 语义。
 */
@Getter
public enum ErrorCode {

    // 认证与权限
    UNAUTHORIZED(1001, HttpStatus.UNAUTHORIZED, "请先登录"),
    FORBIDDEN(1003, HttpStatus.FORBIDDEN, "无权执行该操作"),
    ACCOUNT_BANNED(1004, HttpStatus.FORBIDDEN, "账号已封禁，不可发布与下单"),
    ADMIN_ONLY(1005, HttpStatus.FORBIDDEN, "仅管理员可访问"),
    ACCOUNT_LOCKED(1006, HttpStatus.TOO_MANY_REQUESTS, "账号已暂时锁定，请稍后重试"),

    // 参数校验
    VALIDATION_FAILED(2001, HttpStatus.UNPROCESSABLE_ENTITY, "参数校验失败"),

    // 业务状态
    STATE_REJECTED(3001, HttpStatus.CONFLICT, "当前业务状态不支持该操作"),
    NOT_FOUND(3002, HttpStatus.NOT_FOUND, "对象不存在"),
    CONFLICT(3003, HttpStatus.CONFLICT, "操作冲突，请重试"),

    // 其他
    RATE_LIMITED(4001, HttpStatus.TOO_MANY_REQUESTS, "请求过于频繁，请稍后再试"),
    INTERNAL(5000, HttpStatus.INTERNAL_SERVER_ERROR, "系统繁忙，请稍后重试");

    private final int code;
    private final HttpStatus status;
    private final String message;

    ErrorCode(int code, HttpStatus status, String message) {
        this.code = code;
        this.status = status;
        this.message = message;
    }
}
