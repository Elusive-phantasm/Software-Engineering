package com.campus.trade.constant;

/**
 * 取值闭集：CancelJudgement。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class CancelJudgement {

    public static final String PENDING = "待判定";
    public static final String EXEMPT = "已免责";
    public static final String BREACH = "计违约";

    private CancelJudgement() {
    }
}