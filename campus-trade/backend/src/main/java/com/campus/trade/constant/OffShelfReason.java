package com.campus.trade.constant;

/**
 * 取值闭集：OffShelfReason。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class OffShelfReason {

    public static final String REJECTED = "审核不通过";
    public static final String SELLER_WITHDRAW = "卖家撤回";
    public static final String SELLER_OFF = "卖家主动下架";
    public static final String ADMIN_OFF = "管理员违规下架";
    public static final String CANCEL_NO_TRADE = "撤销后不可交易";

    private OffShelfReason() {
    }
}