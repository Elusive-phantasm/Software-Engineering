package com.campus.trade.service;

import com.campus.trade.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 邮件发送。默认走本地开发邮箱（写入 data/mailbox.jsonl），
 * 无需配置 SMTP 即可完整演示验证码流程；真实发信可扩展 smtp 实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailService {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AppProperties props;

    public record MailItem(String to, String subject, String text, LocalDateTime at, boolean ok) {
    }

    /** 发送验证码邮件；返回是否成功（本地通道恒为成功） */
    public boolean send(String to, String subject, String text) {
        if ("smtp".equalsIgnoreCase(props.getMail().getTransport())) {
            // 真实发信需配置 SMTP 凭据，此处保留扩展点
            log.warn("SMTP 通道尚未配置，回退本地开发邮箱");
        }
        try {
            Path file = mailboxFile();
            Files.createDirectories(file.getParent());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("at", LocalDateTime.now().format(FMT));
            item.put("to", to);
            item.put("subject", subject);
            item.put("text", text);
            item.put("ok", true);
            String line = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(item) + "\n";
            Files.writeString(file, line, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            return true;
        } catch (IOException e) {
            log.error("写入本地发件箱失败", e);
            return false;
        }
    }

    /** 开发邮箱：最近 N 封（按时间倒序） */
    public List<MailItem> recent(int limit) {
        List<MailItem> items = new ArrayList<>();
        try {
            Path file = mailboxFile();
            if (!Files.exists(file)) {
                return items;
            }
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            for (int i = lines.size() - 1; i >= 0 && items.size() < limit; i--) {
                if (lines.get(i).isBlank()) {
                    continue;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> m = mapper.readValue(lines.get(i), Map.class);
                items.add(new MailItem((String) m.get("to"), (String) m.get("subject"), (String) m.get("text"),
                        LocalDateTime.parse((String) m.get("at"), FMT), Boolean.TRUE.equals(m.get("ok"))));
            }
        } catch (Exception e) {
            log.warn("读取本地发件箱失败: {}", e.getMessage());
        }
        return items;
    }

    private Path mailboxFile() {
        return Paths.get(props.getStorage().getUploadDir()).getParent().resolve("mailbox.jsonl");
    }
}
