package com.campus.trade.security;

/**
 * 当前登录主体。未登录时上游传 null。
 *
 * @param subjectType student / admin
 * @param subjectId   学生或管理员主键
 * @param role        游客 / 未认证学生 / 已认证学生 / 管理员（用于审计与提示）
 */
public record AuthUser(String subjectType, Long subjectId, String role) {

    public boolean isStudent() {
        return "student".equals(subjectType);
    }

    public boolean isAdmin() {
        return "admin".equals(subjectType);
    }
}
