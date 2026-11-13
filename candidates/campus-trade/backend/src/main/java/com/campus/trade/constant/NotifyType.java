package com.campus.trade.constant;

/**
 * 取值闭集：NotifyType。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class NotifyType {

    public static final String CERT = "核验";
    public static final String PRODUCT_REVIEW = "商品审核";
    public static final String DEAL = "成交";
    public static final String DISPOSE = "处置";
    public static final String CREDIT = "信用";
    public static final String MESSAGE = "私信";
    public static final String ACCOUNT = "账号";

    private NotifyType() {
    }
}