package com.campus.trade.constant;

/**
 * 取值闭集：SubjectType。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class SubjectType {

    public static final String STUDENT = "student";
    public static final String ADMIN = "admin";

    private SubjectType() {
    }
}