package com.campus.trade.security;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.config.AppProperties;
import com.campus.trade.entity.LoginSession;
import com.campus.trade.mapper.LoginSessionMapper;
import com.campus.trade.util.TimeProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;

/**
 * 会话令牌。
 *
 * 用「不透明令牌 + 库内会话表」而不是 JWT：NFR-10 ⑥ 要求重置密码后该账号所有既有会话立即失效，
 * 会话表一条 UPDATE 即可做到，JWT 则需要额外维护黑名单。令牌只存 SHA-256 摘要。
 */
@Service
@RequiredArgsConstructor
public class TokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final LoginSessionMapper sessionMapper;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    @Transactional
    public String create(String subjectType, Long subjectId, String ip, String userAgent) {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = HexFormat.of().formatHex(raw);
        LoginSession session = new LoginSession();
        session.setSubjectType(subjectType);
        session.setSubjectId(subjectId);
        session.setTokenHash(sha256(token));
        session.setExpiresAt(LocalDateTime.now().plusHours(props.getSecurity().getSessionTtlHours()));
        session.setRevoked(0);
        session.setIp(ip);
        session.setUserAgent(userAgent == null ? null : userAgent.substring(0, Math.min(200, userAgent.length())));
        session.setCreatedAt(LocalDateTime.now());
        sessionMapper.insert(session);
        return token;
    }

    /** 解析令牌；失效返回 null（不抛异常，便于游客场景复用） */
    public AuthUser resolve(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        LoginSession session = sessionMapper.selectOne(
                Wrappers.<LoginSession>lambdaQuery().eq(LoginSession::getTokenHash, sha256(token)));
        if (session == null || session.getRevoked() != null && session.getRevoked() == 1) {
            return null;
        }
        if (session.getExpiresAt().isBefore(LocalDateTime.now())) {
            return null;
        }
        return new AuthUser(session.getSubjectType(), session.getSubjectId(), "已登录");
    }

    @Transactional
    public void revoke(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        LoginSession session = sessionMapper.selectOne(
                Wrappers.<LoginSession>lambdaQuery().eq(LoginSession::getTokenHash, sha256(token)));
        if (session != null) {
            session.setRevoked(1);
            sessionMapper.updateById(session);
        }
    }

    @Transactional
    public void revokeAll(String subjectType, Long subjectId) {
        LoginSession patch = new LoginSession();
        patch.setRevoked(1);
        sessionMapper.update(patch, Wrappers.<LoginSession>lambdaUpdate()
                .eq(LoginSession::getSubjectType, subjectType)
                .eq(LoginSession::getSubjectId, subjectId)
                .eq(LoginSession::getRevoked, 0));
    }

    /** 会话有效期使用真实时钟：若跟随演示时间偏移，一次「+7 天」会把所有人踢下线 */

    public static String sha256(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
