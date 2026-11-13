package com.campus.trade.constant;

/**
 * 取值闭集：CodePurpose。数据库以中文值存储，CHECK 约束保证合法取值。
 */
public final class CodePurpose {

    public static final String REGISTER = "注册";
    public static final String RESET = "找回密码";

    private CodePurpose() {
    }
}