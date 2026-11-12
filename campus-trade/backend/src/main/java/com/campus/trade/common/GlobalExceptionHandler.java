package com.campus.trade.common;

import com.campus.trade.audit.AuditService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 全局异常处理：业务异常 → 语义化 HTTP 状态 + 统一响应；拒绝类同时写审计（§5.5 第 5 条）。
 */
@Slf4j
@RestControllerAdvice
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final AuditService auditService;

    @ExceptionHandler(BizException.class)
    public ResponseEntity<ApiResponse<Void>> handleBiz(BizException e, HttpServletRequest req) {
        ErrorCode code = e.getErrorCode();
        if (code == ErrorCode.FORBIDDEN || code == ErrorCode.UNAUTHORIZED
                || code == ErrorCode.STATE_REJECTED || code == ErrorCode.ACCOUNT_BANNED) {
            auditService.recordDenial(req, code.name(), e.getMessage());
        }
        return ResponseEntity.status(code.getStatus())
                .body(ApiResponse.fail(code.getCode(), e.getMessage()));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    public ResponseEntity<ApiResponse<Void>> handleValidation(BindException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(FieldError::getDefaultMessage)
                .orElse("参数校验失败");
        return ResponseEntity.status(ErrorCode.VALIDATION_FAILED.getStatus())
                .body(ApiResponse.fail(ErrorCode.VALIDATION_FAILED.getCode(), message));
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class,
            HttpMessageNotReadableException.class})
    public ResponseEntity<ApiResponse<Void>> handleBadRequest(Exception e) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.fail(ErrorCode.VALIDATION_FAILED.getCode(), "请求参数格式不正确"));
    }

    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<ApiResponse<Void>> handleDuplicate(DuplicateKeyException e) {
        log.debug("唯一约束冲突: {}", e.getMessage());
        return ResponseEntity.status(ErrorCode.CONFLICT.getStatus())
                .body(ApiResponse.fail(ErrorCode.CONFLICT.getCode(), "该操作已存在一条记录，请勿重复提交"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleIntegrity(DataIntegrityViolationException e) {
        log.warn("数据约束冲突: {}", e.getMostSpecificCause().getMessage());
        return ResponseEntity.status(ErrorCode.VALIDATION_FAILED.getStatus())
                .body(ApiResponse.fail(ErrorCode.VALIDATION_FAILED.getCode(), "数据不满足约束，请检查填写内容"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(NoResourceFoundException e) {
        return ResponseEntity.status(ErrorCode.NOT_FOUND.getStatus())
                .body(ApiResponse.fail(ErrorCode.NOT_FOUND.getCode(), "接口不存在"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleOther(Exception e, HttpServletRequest req) {
        log.error("未处理异常 {} {}", req.getMethod(), req.getRequestURI(), e);
        return ResponseEntity.status(ErrorCode.INTERNAL.getStatus())
                .body(ApiResponse.fail(ErrorCode.INTERNAL.getCode(), ErrorCode.INTERNAL.getMessage()));
    }
}
