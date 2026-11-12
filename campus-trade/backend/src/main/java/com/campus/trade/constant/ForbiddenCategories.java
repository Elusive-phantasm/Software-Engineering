package com.campus.trade.constant;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * §4.3 禁售品类清单（BR-04 附表，18 类闭集）。
 * 类目编号规则：A=法律法规禁止流通 / B=实名与资质管制 / C=侵权与隐私 / D=学术诚信 / E=校园安全。
 */
public final class ForbiddenCategories {

    public static final Map<String, String> CODES = new LinkedHashMap<>();

    static {
        CODES.put("A1", "武器与管制器具");
        CODES.put("A2", "毒品与管制药品");
        CODES.put("A3", "危险品");
        CODES.put("A4", "淫秽色情物品");
        CODES.put("A5", "赌博与作弊器材");
        CODES.put("A6", "野生动物及其制品");
        CODES.put("A7", "伪造与变造物品");
        CODES.put("B1", "实名制卡证");
        CODES.put("B2", "身份凭据与账号");
        CODES.put("B3", "受管制消费品");
        CODES.put("B4", "未许可食品与活体");
        CODES.put("C1", "他人个人信息");
        CODES.put("C2", "校园内部资料");
        CODES.put("C3", "盗版与破解资源");
        CODES.put("D1", "学术不端服务");
        CODES.put("D2", "代抄与答案");
        CODES.put("E1", "违规大功率电器");
        CODES.put("E2", "明火器具");
    }

    public static boolean exists(String code) {
        return code != null && CODES.containsKey(code.trim().toUpperCase());
    }

    public static String nameOf(String code) {
        return CODES.getOrDefault(code == null ? "" : code.trim().toUpperCase(), "");
    }

    private ForbiddenCategories() {
    }
}
