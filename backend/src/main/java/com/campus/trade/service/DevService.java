package com.campus.trade.service;

import com.campus.trade.config.AppProperties;
import com.campus.trade.entity.Setting;
import com.campus.trade.mapper.SettingMapper;
import com.campus.trade.seed.DataSeeder;
import com.campus.trade.util.TimeProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 开发与演示工具（可通过 app.features.enable-dev-tools=false 整体关闭）。
 *
 * 为什么需要它：需求里的 7 天 / 24 小时判定无法在答辩现场自然等待，
 * 验收也需要可重复的起点。这里提供「重置演示数据」「服务端时间偏移」「立即执行定时判定」。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DevService {

    private static final List<String> TABLES = List.of(
            "audit_logs", "notifications", "messages", "credit_records", "reports", "reviews",
            "orders", "favorites", "product_images", "products", "certification_applications",
            "email_codes", "sessions", "students", "categories", "admins", "settings");

    private final JdbcTemplate jdbcTemplate;
    private final DataSeeder dataSeeder;
    private final TimeProvider timeProvider;
    private final SettingMapper settingMapper;
    private final AppProperties props;

    /** 清空业务表并重新灌入演示数据，返回各表条数 */
    @Transactional
    public Map<String, Object> reset() {
        jdbcTemplate.execute("SET FOREIGN_KEY_CHECKS = 0");
        for (String table : TABLES) {
            jdbcTemplate.execute("TRUNCATE TABLE " + table);
        }
        jdbcTemplate.execute("SET FOREIGN_KEY_CHECKS = 1");
        timeProvider.setOffsetSeconds(0);
        dataSeeder.run();
        log.info("演示数据已重置");
        return state();
    }

    /** 服务端时间偏移（小时，可为负） */
    public Map<String, Object> shiftTime(double hours) {
        long delta = Math.round(hours * 3600);
        timeProvider.setOffsetSeconds(timeProvider.offsetSeconds() + delta);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("offsetSeconds", timeProvider.offsetSeconds());
        result.put("offsetHours", timeProvider.offsetSeconds() / 3600.0);
        result.put("now", timeProvider.now().toString());
        return result;
    }

    public Map<String, Object> resetTime() {
        timeProvider.setOffsetSeconds(0);
        return shiftTime(0);
    }

    public Map<String, Object> state() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("now", timeProvider.now().toString());
        result.put("offsetHours", timeProvider.offsetSeconds() / 3600.0);
        Map<String, Object> counts = new LinkedHashMap<>();
        for (String table : List.of("students", "products", "orders", "reviews", "reports",
                "messages", "notifications", "credit_records", "audit_logs")) {
            counts.put(table, jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Long.class));
        }
        result.put("counts", counts);
        result.put("devTools", props.getFeatures().isEnableDevTools());
        return result;
    }

    /** 开发邮箱：读取发件箱（由 MailService 提供） */
    public boolean isEnabled() {
        return props.getFeatures().isEnableDevTools();
    }

    public Setting setting(String key) {
        return settingMapper.selectById(key);
    }
}
