package com.campus.trade.constant;

/**
 * 取值闭集：CreditEvent。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class CreditEvent {

    public static final String REVIEW_BONUS = "评价加分";
    public static final String VIOLATION = "违规处置";
    public static final String NO_REVIEW = "未评价扣分";
    public static final String CANCEL_BREACH = "撤销违约";

    private CreditEvent() {
    }
}