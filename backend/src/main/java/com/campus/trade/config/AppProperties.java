package com.campus.trade.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * 业务参数（对应需求文档中「建议值，待确认」的条目，集中配置便于调整）。
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Limits limits = new Limits();
    private Credit credit = new Credit();
    private Deadlines deadlines = new Deadlines();
    private Certification certification = new Certification();
    private Security security = new Security();
    private Mail mail = new Mail();
    private Storage storage = new Storage();
    private Retention retention = new Retention();
    private Features features = new Features();

    @Getter
    @Setter
    public static class Limits {
        private int maxOnSalePerStudent = 5;
        private int priceMaxYuan = 50000;
        private int imagesMin = 1;
        private int imagesMax = 9;
        private int favoriteLimit = 100;
        private int titleMax = 50;
        private int descMax = 1000;
        private int messageMax = 500;
        private int reviewMax = 500;
        private int nicknameMax = 20;
        private int reportReasonMax = 200;
        private int maxActiveOrdersPerStudent = 5;
    }

    @Getter
    @Setter
    public static class Credit {
        private int initial = 100;
        private int min = 0;
        private int max = 150;
        private int publishThreshold = 60;
        private int orderThreshold = 40;
        private int reviewBonus = 2;
        private int violationPenalty = -10;
        private int noReviewPenalty = -1;
        private int cancelPenalty = -2;
    }

    @Getter
    @Setter
    public static class Deadlines {
        private int reviewWindowHours = 168;
        private int noReviewPenaltyHours = 168;
        private int cancelJudgementHours = 168;
        private int certSubmitHours = 168;
        private int certReviewTimeoutHours = 24;
        private int productReviewTimeoutHours = 24;
        private int reportHandleTimeoutHours = 24;
        private int deliveryWindowHours = 168;
    }

    @Getter
    @Setter
    public static class Certification {
        private int resubmitLimit = 3;
    }

    @Getter
    @Setter
    public static class Security {
        private int loginFailLimit = 5;
        private int lockMinutes = 15;
        private int codeLength = 6;
        private int codeTtlMinutes = 10;
        private int codeResendSeconds = 60;
        private int codeDailyLimit = 10;
        private int codeMaxFails = 5;
        private int sessionTtlHours = 72;
    }

    @Getter
    @Setter
    public static class Mail {
        private String transport = "local";
        private String from = "拾光二手 <no-reply@campus-reuse.local>";
    }

    @Getter
    @Setter
    public static class Storage {
        private String uploadDir = "./data/uploads";
        private String publicPrefix = "/uploads";
    }

    @Getter
    @Setter
    public static class Retention {
        private int notificationDays = 90;
    }

    @Getter
    @Setter
    public static class Features {
        private boolean loginSuccessNotification = true;
        private boolean enableDevTools = true;
    }
}
