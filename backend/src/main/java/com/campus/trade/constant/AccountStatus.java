package com.campus.trade.constant;

/**
 * 取值闭集：AccountStatus。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class AccountStatus {

    public static final String NORMAL = "正常";
    public static final String RESTRICTED = "受限";
    public static final String BANNED = "封禁";

    private AccountStatus() {
    }
}