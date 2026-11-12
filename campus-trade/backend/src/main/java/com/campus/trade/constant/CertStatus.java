package com.campus.trade.constant;

/**
 * 取值闭集：CertStatus。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class CertStatus {

    public static final String NONE = "未提交";
    public static final String PENDING = "待审核";
    public static final String CERTIFIED = "已认证";
    public static final String REJECTED = "已驳回";

    private CertStatus() {
    }
}