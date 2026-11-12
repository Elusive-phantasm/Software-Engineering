package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.entity.EmailCode;
import com.campus.trade.entity.Setting;
import com.campus.trade.mapper.EmailCodeMapper;
import com.campus.trade.mapper.SettingMapper;
import com.campus.trade.util.TimeProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;

/**
 * 邮箱验证码（NFR-10）。
 * 只存 HMAC 摘要；6 位、10 分钟有效、一次性、错 5 次作废、60 秒 / 24 小时双重频控。
 */
@Service
@RequiredArgsConstructor
public class EmailCodeService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String SECRET_KEY = "mail_secret";

    private final EmailCodeMapper codeMapper;
    private final SettingMapper settingMapper;
    private final AppProperties props;
    private final TimeProvider timeProvider;

    public String issue(String email, String purpose) {
        String code = randomDigits(props.getSecurity().getCodeLength());
        EmailCode entity = new EmailCode();
        entity.setEmail(email.toLowerCase());
        entity.setPurpose(purpose);
        entity.setCodeHash(digest(email, purpose, code));
        entity.setExpiresAt(timeProvider.now().plusMinutes(props.getSecurity().getCodeTtlMinutes()));
        entity.setUsed(0);
        entity.setFailCount(0);
        entity.setCreatedAt(timeProvider.now());
        codeMapper.insert(entity);
        return code;
    }

    /**
     * 频控：同一邮箱 60 秒内只能请求一次、24 小时内最多 10 次。
     * 对「不存在的邮箱」同样执行，避免通过频控行为反推账号是否存在（NFR-10 ⑤）。
     */
    public void assertRate(String email) {
        String key = email.toLowerCase();
        List<EmailCode> recent = codeMapper.selectList(Wrappers.<EmailCode>lambdaQuery()
                .eq(EmailCode::getEmail, key)
                .ge(EmailCode::getCreatedAt, timeProvider.now().minusHours(24))
                .orderByDesc(EmailCode::getCreatedAt));
        if (!recent.isEmpty()) {
            LocalDateTime last = recent.get(0).getCreatedAt();
            if (last.plusSeconds(props.getSecurity().getCodeResendSeconds()).isAfter(timeProvider.now())) {
                throw BizException.rateLimit("验证码请求过于频繁，请 " + props.getSecurity().getCodeResendSeconds() + " 秒后再试");
            }
            if (recent.size() >= props.getSecurity().getCodeDailyLimit()) {
                throw BizException.rateLimit("该邮箱 24 小时内请求次数已达上限，请明天再试");
            }
        }
    }

    /** 校验验证码；失败累计错误次数，满 5 次作废 */
    public EmailCode verify(String email, String purpose, String code) {
        String key = email.toLowerCase();
        EmailCode rec = codeMapper.selectOne(Wrappers.<EmailCode>lambdaQuery()
                .eq(EmailCode::getEmail, key)
                .eq(EmailCode::getPurpose, purpose)
                .eq(EmailCode::getUsed, 0)
                .orderByDesc(EmailCode::getCreatedAt)
                .last("LIMIT 1"));
        if (rec == null) {
            throw BizException.validate("验证码错误或已失效，请重新获取");
        }
        if (rec.getFailCount() != null && rec.getFailCount() >= props.getSecurity().getCodeMaxFails()) {
            throw BizException.validate("验证码错误或已失效，请重新获取");
        }
        if (rec.getExpiresAt().isBefore(timeProvider.now())) {
            throw BizException.validate("验证码错误或已失效，请重新获取");
        }
        if (!digest(email, purpose, code.trim()).equals(rec.getCodeHash())) {
            int fails = (rec.getFailCount() == null ? 0 : rec.getFailCount()) + 1;
            rec.setFailCount(fails);
            if (fails >= props.getSecurity().getCodeMaxFails()) {
                rec.setUsed(1);
            }
            codeMapper.updateById(rec);
            throw BizException.validate("验证码错误或已失效，请重新获取");
        }
        return rec;
    }

    public void consume(EmailCode rec) {
        rec.setUsed(1);
        codeMapper.updateById(rec);
    }

    private String digest(String email, String purpose, String code) {
        try {
            String secret = secret();
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest((secret + "|" + email.toLowerCase() + "|" + purpose + "|" + code)
                    .getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String secret() {
        Setting s = settingMapper.selectById(SECRET_KEY);
        if (s != null) {
            return s.getV();
        }
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String value = HexFormat.of().formatHex(raw);
        Setting created = new Setting();
        created.setK(SECRET_KEY);
        created.setV(value);
        created.setUpdatedAt(LocalDateTime.now());
        settingMapper.insert(created);
        return value;
    }

    private String randomDigits(int len) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) {
            sb.append(RANDOM.nextInt(10));
        }
        return sb.toString();
    }
}
