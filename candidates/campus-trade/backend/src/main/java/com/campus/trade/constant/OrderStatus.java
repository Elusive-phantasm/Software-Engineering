package com.campus.trade.constant;

/**
 * 取值闭集：OrderStatus。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class OrderStatus {

    public static final String VALID = "有效";
    public static final String CANCELLED = "已撤销";

    private OrderStatus() {
    }
}