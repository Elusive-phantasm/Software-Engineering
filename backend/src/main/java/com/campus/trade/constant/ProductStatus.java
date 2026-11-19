package com.campus.trade.constant;

/**
 * 取值闭集：ProductStatus。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class ProductStatus {

    public static final String PENDING = "待审核";
    public static final String ON_SALE = "在售";
    public static final String SOLD = "已售出";
    public static final String OFF_SHELF = "已下架";

    private ProductStatus() {
    }
}