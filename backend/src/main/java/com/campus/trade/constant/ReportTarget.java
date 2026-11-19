package com.campus.trade.constant;

/**
 * 取值闭集：ReportTarget。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class ReportTarget {

    public static final String PRODUCT = "商品";
    public static final String STUDENT = "学生";

    private ReportTarget() {
    }
}