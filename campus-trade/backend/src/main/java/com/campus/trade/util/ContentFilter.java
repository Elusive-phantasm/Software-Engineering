package com.campus.trade.util;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 内容安全（BR-04）：拦截站外导流与广告。
 * 注意：私信内互留联系方式是履约必需，不在本过滤器管辖范围（BR-20 明文允许）。
 */
public final class ContentFilter {

    private static final List<Pattern> CONTACT_PATTERNS = List.of(
            Pattern.compile("(?<!\\d)1[3-9]\\d{9}(?!\\d)"),
            Pattern.compile("(微信|weixin|wechat|vx|v信)\\s*[:：]?\\s*[A-Za-z0-9_-]{4,}", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(QQ|扣扣|企鹅)\\s*[:：]?\\s*\\d{5,}", Pattern.CASE_INSENSITIVE),
            Pattern.compile("https?://|www\\.[A-Za-z0-9-]+\\.[A-Za-z]{2,}", Pattern.CASE_INSENSITIVE)
    );

    private static final List<String> AD_KEYWORDS = List.of(
            "加群", "扫码进群", "卖课", "代理加盟", "刷单", "兼职日结");

    public static boolean containsOffsiteContact(String text) {
        if (text == null || text.isBlank()) {
            return false;
        }
        return CONTACT_PATTERNS.stream().anyMatch(p -> p.matcher(text).find());
    }

    public static boolean containsAd(String text) {
        if (text == null || text.isBlank()) {
            return false;
        }
        return AD_KEYWORDS.stream().anyMatch(text::contains);
    }

    /** 联系方式或广告任一命中即视为站外导流 */
    public static boolean isOffsiteDiversion(String text) {
        return containsOffsiteContact(text) || containsAd(text);
    }

    private ContentFilter() {
    }
}
