package com.campus.trade.util;

import com.campus.trade.entity.Setting;
import com.campus.trade.mapper.SettingMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 服务端时间唯一来源（SRS §4.1.1）。
 * 所有 7 天 / 24 小时判定都走这里，不读客户端时间。
 * 演示时可整体偏移时间（答辩现场无法真的等 7 天），偏移量持久化在 settings 表。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TimeProvider {

    public static final String OFFSET_KEY = "time_offset_seconds";

    private final SettingMapper settingMapper;
    private final AtomicLong offsetSeconds = new AtomicLong(0);

    @PostConstruct
    public void load() {
        try {
            Setting s = settingMapper.selectById(OFFSET_KEY);
            if (s != null) {
                offsetSeconds.set(Long.parseLong(s.getV()));
                log.info("恢复演示时间偏移: {} 秒", offsetSeconds.get());
            }
        } catch (Exception e) {
            log.debug("读取时间偏移失败（首次启动可忽略）: {}", e.getMessage());
        }
    }

    /** 当前业务时间 */
    public LocalDateTime now() {
        return LocalDateTime.now().plusSeconds(offsetSeconds.get());
    }

    public long offsetSeconds() {
        return offsetSeconds.get();
    }

    public void setOffsetSeconds(long seconds) {
        offsetSeconds.set(seconds);
        Setting s = settingMapper.selectById(OFFSET_KEY);
        if (s == null) {
            s = new Setting();
            s.setK(OFFSET_KEY);
            s.setV(String.valueOf(seconds));
            s.setUpdatedAt(LocalDateTime.now());
            settingMapper.insert(s);
        } else {
            s.setV(String.valueOf(seconds));
            s.setUpdatedAt(LocalDateTime.now());
            settingMapper.updateById(s);
        }
    }
}
