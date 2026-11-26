package com.campus.trade.service;

import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.entity.EmailCode;
import com.campus.trade.entity.Setting;
import com.campus.trade.mapper.EmailCodeMapper;
import com.campus.trade.mapper.SettingMapper;
import com.campus.trade.util.TimeProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EmailCodeServiceTest {

    private static final String SECRET = "test-secret";
    @Mock EmailCodeMapper codeMapper;
    @Mock SettingMapper settingMapper;
    @Mock AppProperties props;
    @Mock AppProperties.Security security;
    @Mock TimeProvider timeProvider;
    @Mock EmailCodeFailureService failureService;
    @InjectMocks EmailCodeService service;

    @Test
    void mismatchedCodeRecordsFailureBeforeThrowing() {
        LocalDateTime now = LocalDateTime.of(2026, 1, 1, 12, 0);
        EmailCode record = codeRecord(now.plusMinutes(10), digest("right"));
        when(codeMapper.selectOne(any())).thenReturn(record);
        when(timeProvider.now()).thenReturn(now);
        when(settingMapper.selectById("mail_secret")).thenReturn(setting(SECRET));
        when(props.getSecurity()).thenReturn(security);
        when(security.getCodeMaxFails()).thenReturn(5);

        assertThrows(BizException.class, () -> service.verify("a@example.edu", "REGISTER", "wrong"));
        verify(failureService).recordFailure(record.getId(), 5);
    }

    @Test
    void tenMinuteBoundaryIsExpiredButNineMinutesFiftyNineSecondsIsValid() {
        LocalDateTime expiresAt = LocalDateTime.of(2026, 1, 1, 12, 10);
        EmailCode record = codeRecord(expiresAt, digest("654321"));
        when(codeMapper.selectOne(any())).thenReturn(record);
        when(settingMapper.selectById("mail_secret")).thenReturn(setting(SECRET));

        when(timeProvider.now()).thenReturn(expiresAt.minusSeconds(1));
        assertSame(record, service.verify("a@example.edu", "REGISTER", "654321"));

        when(timeProvider.now()).thenReturn(expiresAt);
        assertThrows(BizException.class, () -> service.verify("a@example.edu", "REGISTER", "654321"));
        verifyNoInteractions(failureService);
    }

    @Test
    void failureCounterServiceInvalidatesAtFifthAttemptAndUsesNewTransaction() {
        EmailCodeFailureService counter = new EmailCodeFailureService(codeMapper);
        EmailCode record = codeRecord(LocalDateTime.now().plusMinutes(10), "hash");
        record.setFailCount(4);
        when(codeMapper.selectByIdForUpdate(record.getId())).thenReturn(record);

        counter.recordFailure(record.getId(), 5);

        assertEquals(5, record.getFailCount());
        assertEquals(1, record.getUsed());
        verify(codeMapper).updateById(record);
        Transactional tx = EmailCodeFailureService.class.getMethod("recordFailure", Long.class, int.class)
                .getAnnotation(Transactional.class);
        assertEquals(Propagation.REQUIRES_NEW, tx.propagation());
    }

    private EmailCode codeRecord(LocalDateTime expiresAt, String hash) {
        EmailCode record = new EmailCode();
        record.setId(41L);
        record.setUsed(0);
        record.setFailCount(0);
        record.setExpiresAt(expiresAt);
        record.setCodeHash(hash);
        return record;
    }

    private Setting setting(String value) {
        Setting setting = new Setting();
        setting.setV(value);
        return setting;
    }

    private String digest(String code) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(
                    (SECRET + "|a@example.edu|REGISTER|" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }
}
