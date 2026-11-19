package com.campus.trade.audit;

import com.campus.trade.entity.AuditLog;
import com.campus.trade.mapper.AuditLogMapper;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.TimeProvider;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * 审计日志（§5.5 第 5 条）。
 * 记录权限拒绝、敏感信息读取与管理员审核/下架/删除/扣分等操作。
 * 严禁写入：密码、完整手机号、完整宿舍地址、学生证图片内容、验证码明文。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogMapper auditLogMapper;
    private final TimeProvider timeProvider;

    public void log(String actorType, Long actorId, String role, String action,
                    String targetType, Long targetId, String result, String reasonCode, String detail) {
        try {
            AuditLog entry = new AuditLog();
            entry.setActorType(actorType == null ? "guest" : actorType);
            entry.setActorId(actorId);
            entry.setRole(role == null ? "游客" : role);
            entry.setAction(truncate(action, 60));
            entry.setTargetType(targetType);
            entry.setTargetId(targetId);
            entry.setResult(result == null ? "allowed" : result);
            entry.setReasonCode(reasonCode);
            entry.setDetail(truncate(detail, 1000));
            entry.setCreatedAt(timeProvider.now());
            auditLogMapper.insert(entry);
        } catch (Exception e) {
            log.warn("审计写入失败: {}", e.getMessage());
        }
    }

    public void allowed(AuthUser user, String role, String action, String targetType, Long targetId, String detail) {
        log(user == null ? "guest" : user.subjectType(), user == null ? null : user.subjectId(),
                role, action, targetType, targetId, "allowed", null, detail);
    }

    /** 权限拒绝 / 状态拒绝统一记录（§5.5 第 2、5 条） */
    public void recordDenial(HttpServletRequest req, String reasonCode, String message) {
        AuthUser user = currentUser();
        log(user == null ? "guest" : user.subjectType(),
                user == null ? null : user.subjectId(),
                roleOf(user),
                req.getMethod() + " " + req.getRequestURI(),
                null, null,
                "STATE_REJECTED".equals(reasonCode) ? "failed" : "denied",
                reasonCode, message);
    }

    public AuthUser currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthUser user) {
            return user;
        }
        return null;
    }

    public static String roleOf(AuthUser user) {
        if (user == null) {
            return "游客";
        }
        return "admin".equals(user.subjectType()) ? "管理员" : "学生";
    }

    private String truncate(String text, int max) {
        if (text == null) {
            return null;
        }
        return text.length() <= max ? text : text.substring(0, max);
    }
}
