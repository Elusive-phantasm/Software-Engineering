package com.campus.trade.constant;

/**
 * 取值闭集：ItemCondition。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class ItemCondition {

    public static final String BRAND_NEW = "全新";
    public static final String NINETY = "九成新";
    public static final String SEVENTY = "七成新";
    public static final String OTHER = "其他";

    private ItemCondition() {
    }
}