package com.campus.trade.constant;

/**
 * 取值闭集：ReportType。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class ReportType {

    public static final String FORBIDDEN = "违禁品";
    public static final String FAKE_DESC = "虚假描述";
    public static final String PRICE_FRAUD = "价格欺诈";
    public static final String OFFSITE = "站外导流";
    public static final String NO_PAY = "收款不履约";
    public static final String OTHER = "其他";

    private ReportType() {
    }
}