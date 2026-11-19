package com.campus.trade.constant;

/**
 * 取值闭集：ReportStatus。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class ReportStatus {

    public static final String PENDING = "待处理";
    public static final String HANDLED = "已处理";
    public static final String REJECTED = "已驳回";

    private ReportStatus() {
    }
}