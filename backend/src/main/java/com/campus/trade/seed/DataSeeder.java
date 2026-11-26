package com.campus.trade.seed;

import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.*;
import com.campus.trade.entity.*;
import com.campus.trade.mapper.*;
import com.campus.trade.util.TimeProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 演示数据初始化：仅在库为空时灌入，保证「开箱即用」。
 *
 * <p>口令来源与去向：
 * <ul>
 *   <li>优先取 {@code app.seed.admin-password} / {@code app.seed.demo-password}（可由环境变量注入）；</li>
 *   <li>未配置时首次灌入随机生成，并写入 {@code app.seed.credentials-file}（默认 backend/data，已在 .gitignore 中忽略）；</li>
 *   <li>代码与仓库不保存任何明文口令，日志只输出文件路径，不输出口令本身。</li>
 * </ul>
 * 正式部署应把 {@code app.seed.enabled} 置为 false。
 */
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String PWD_ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%";
    private static final int PWD_LENGTH = 14;

    private final AdminMapper adminMapper;
    private final StudentMapper studentMapper;
    private final CategoryMapper categoryMapper;
    private final ProductMapper productMapper;
    private final ProductImageMapper imageMapper;
    private final TradeOrderMapper orderMapper;
    private final ReviewMapper reviewMapper;
    private final ReportMapper reportMapper;
    private final ChatMessageMapper messageMapper;
    private final NotificationMapper notificationMapper;
    private final CertificationApplicationMapper certMapper;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties props;
    private final TimeProvider timeProvider;

    @Override
    @Transactional
    public void run(String... args) {
        if (!props.getSeed().isEnabled()) {
            log.info("app.seed.enabled=false，跳过演示数据初始化");
            return;
        }
        if (adminMapper.selectCount(null) > 0) {
            log.info("检测到已有数据，跳过演示数据初始化");
            return;
        }
        log.info("开始初始化演示数据…");
        LocalDateTime now = timeProvider.now();

        // 口令来源优先级：配置/环境变量 > 上次生成的凭据文件 > 随机生成
        // 复用旧凭据是为了让「重置演示数据」不会悄悄换掉正在用的口令
        Map<String, String> existing = readCredentials();
        String adminPassword = resolvePassword(props.getSeed().getAdminPassword(), existing.get("admin-password"));
        String studentPassword = resolvePassword(props.getSeed().getDemoPassword(), existing.get("student-password"));
        List<String> generated = new ArrayList<>();
        if (isBlank(props.getSeed().getAdminPassword()) && isBlank(existing.get("admin-password"))) {
            generated.add("admin-no=" + props.getSeed().getAdminNo());
            generated.add("admin-password=" + adminPassword);
        }
        if (isBlank(props.getSeed().getDemoPassword()) && isBlank(existing.get("student-password"))) {
            generated.add("student-password=" + studentPassword);
        }

        // 管理员
        Admin admin = new Admin();
        admin.setAdminNo(props.getSeed().getAdminNo());
        admin.setDisplayName("系统管理员");
        admin.setPasswordHash(passwordEncoder.encode(adminPassword));
        admin.setMustChangePassword(props.getSeed().isAdminMustChangePassword() ? 1 : 0);
        admin.setFailedCount(0);
        admin.setCreatedAt(now);
        adminMapper.insert(admin);

        // 分类（单层，SRS §6.2.1）
        String[] categories = {"教材书籍", "电子数码", "生活用品", "代步工具", "运动户外", "服饰鞋包", "乐器文具", "其他闲置"};
        Long[] categoryIds = new Long[categories.length];
        for (int i = 0; i < categories.length; i++) {
            Category c = new Category();
            c.setName(categories[i]);
            c.setSort(i);
            c.setActive(1);
            categoryMapper.insert(c);
            categoryIds[i] = c.getId();
        }

        String pwd = passwordEncoder.encode(studentPassword);
        Student lin = student("lin@campus.edu", "林同学", "林初仁", "20230001", CertStatus.CERTIFIED, AccountStatus.NORMAL, 102, 1, pwd, now);
        Student zhao = student("zhao@campus.edu", "赵同学", "赵俊豪", "20230002", CertStatus.CERTIFIED, AccountStatus.NORMAL, 102, 1, pwd, now);
        Student ma = student("ma@campus.edu", "马同学", "马歆远", "20230003", CertStatus.PENDING, AccountStatus.NORMAL, 100, 0, pwd, now);
        Student guo = student("guo@campus.edu", "过同学", "过振宇", "20230004", CertStatus.REJECTED, AccountStatus.NORMAL, 100, 0, pwd, now);
        Student lv = student("lv@campus.edu", "吕同学", "吕锦浩", null, CertStatus.NONE, AccountStatus.NORMAL, 100, 0, pwd, now);
        Student ban = student("ban@campus.edu", "违规同学", "违规生", "20230006", CertStatus.CERTIFIED, AccountStatus.BANNED, 80, 0, pwd, now);
        Student low = student("low@campus.edu", "低信用同学", "低信用", "20230007", CertStatus.CERTIFIED, AccountStatus.NORMAL, 55, 0, pwd, now);

        // 待审核的核验申请（马的）
        CertificationApplication cert = new CertificationApplication();
        cert.setStudentId(ma.getId());
        cert.setDeclaredNo("20230003");
        cert.setCardImage("/secure/cert/seed-card.svg");
        cert.setReviewStatus("待审核");
        cert.setForgeryFlag(0);
        cert.setSubmittedAt(now.minusHours(2));
        certMapper.insert(cert);

        // 商品：刻意分散到多个已认证卖家，避免市场里只有一个卖家
        Product p1 = product(lin.getId(), categoryIds[0], "高等数学（第七版）上下册", "教材，有少量笔记，不影响阅读。", 2500, ItemCondition.SEVENTY, ProductStatus.ON_SALE, null, now.minusDays(3), 1);
        Product p2 = product(lin.getId(), categoryIds[1], "iPad 2021 64G WiFi 版", "已恢复出厂设置，无账号，附保护壳。", 135000, ItemCondition.NINETY, ProductStatus.ON_SALE, null, now.minusDays(2), 2);
        product(zhao.getId(), categoryIds[3], "捷安特山地车", "毕业转让，链条刚换，带车锁。", 38000, ItemCondition.SEVENTY, ProductStatus.ON_SALE, null, now.minusDays(7), 3);
        product(low.getId(), categoryIds[2], "宿舍小电饭煲 3L", "一人食刚好，内胆无划痕。", 6000, ItemCondition.NINETY, ProductStatus.ON_SALE, null, now.minusDays(1), 4);
        Product lamp = product(low.getId(), categoryIds[2], "可调光宿舍台灯", "三档亮度，插头国标。", 3500, ItemCondition.NINETY, ProductStatus.ON_SALE, null, now.minusHours(5), 5);
        Product p5 = product(lin.getId(), categoryIds[4], "羽毛球拍（单支）", "只用过两次，待管理员审核。", 5000, ItemCondition.NINETY, ProductStatus.PENDING, null, now.minusHours(3), 6);
        Product sold = product(lin.getId(), categoryIds[1], "罗技无线鼠标 M330", "静音款，含电池。", 4500, ItemCondition.NINETY, ProductStatus.SOLD, null, now.minusDays(6), 7);
        product(lin.getId(), categoryIds[4], "瑜伽垫（已下架）", "已下架：卖家主动下架，可重新上架。", 5000, ItemCondition.NINETY, ProductStatus.OFF_SHELF, OffShelfReason.SELLER_OFF, now.minusDays(8), 8);
        // 被封禁卖家的商品：应为已下架（管理员违规下架），演示 BR-10 的存量处置结果
        product(ban.getId(), categoryIds[7], "违规商品示例（管制刀具）", "已被管理员下架，仅用于演示封禁联动。", 9900, ItemCondition.OTHER, ProductStatus.OFF_SHELF, OffShelfReason.ADMIN_OFF, now.minusDays(9), 9);

        // 已成交订单 + 互评
        TradeOrder order = new TradeOrder();
        order.setProductId(sold.getId());
        order.setBuyerId(zhao.getId());
        order.setSellerId(lin.getId());
        order.setAmountCents(sold.getPriceCents());
        order.setStatus(OrderStatus.VALID);
        order.setCreatedAt(now.minusDays(5));
        order.setUpdatedAt(now.minusDays(5));
        orderMapper.insert(order);

        review(order.getId(), zhao.getId(), lin.getId(), "书不错，卖家很好沟通。", now.minusDays(4));
        review(order.getId(), lin.getId(), zhao.getId(), "买家很爽快，当面交易顺利。", now.minusDays(4));

        // 一条待处理举报
        Report report = new Report();
        report.setReporterId(zhao.getId());
        report.setTargetType(ReportTarget.PRODUCT);
        report.setTargetProductId(lamp.getId());
        report.setTargetKey(String.valueOf(lamp.getId()));
        report.setType(ReportType.FAKE_DESC);
        report.setReason("描述说可调光，实际只有一个亮度。");
        report.setHandleStatus(ReportStatus.PENDING);
        report.setCreatedAt(now.minusHours(1));
        reportMapper.insert(report);

        // 一段私信会话（lin 与 zhao 就该商品）
        message(sold.getId(), "student", zhao.getId(), "student", lin.getId(), "同学你好，鼠标还在吗？", now.minusDays(6), "已读");
        message(sold.getId(), "student", lin.getId(), "student", zhao.getId(), "在的，明天中午图书馆门口可以吗？", now.minusDays(6), "已读");
        message(p2.getId(), "student", zhao.getId(), "student", lin.getId(), "iPad 能便宜点吗？", now.minusHours(5), "未读");

        // 通知
        notification(lin.getId(), NotifyType.DEAL, "你的商品已成交",
                "《罗技无线鼠标 M330》已被买家下单成交。请在站内私信中约定取货时间与地点。", "order", order.getId(), now.minusDays(5));
        notification(lin.getId(), NotifyType.DISPOSE, "收到新的举报",
                "你的商品《可调光宿舍台灯》被举报（虚假描述），管理员会尽快核实。", "report", report.getId(), now.minusHours(1));

        log.info("演示数据初始化完成：8 分类 / 7 学生 / 9 商品（来自 4 位卖家）/ 1 订单 / 1 举报");
        if (!generated.isEmpty()) {
            writeCredentials(generated);
        }
    }

    /** 未配置口令时优先沿用上次生成的值，仍没有才随机生成；不写入日志或代码 */
    private String resolvePassword(String configured, String previous) {
        if (configured != null && !configured.isBlank()) {
            return configured;
        }
        if (previous != null && !previous.isBlank()) {
            return previous;
        }
        StringBuilder sb = new StringBuilder(PWD_LENGTH);
        for (int i = 0; i < PWD_LENGTH; i++) {
            sb.append(PWD_ALPHABET.charAt(RANDOM.nextInt(PWD_ALPHABET.length())));
        }
        return sb.toString();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /** 读取上次生成的凭据文件（不存在或读不了则返回空表） */
    private Map<String, String> readCredentials() {
        Path file = Paths.get(props.getSeed().getCredentialsFile()).toAbsolutePath().normalize();
        Map<String, String> out = new java.util.HashMap<>();
        if (!Files.exists(file)) {
            return out;
        }
        try {
            for (String raw : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                String line = raw.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int idx = line.indexOf('=');
                if (idx > 0) {
                    out.put(line.substring(0, idx).trim(), line.substring(idx + 1).trim());
                }
            }
        } catch (Exception e) {
            log.warn("读取已有演示凭据失败（{}），本次将重新生成", e.getMessage());
        }
        return out;
    }

    /**
     * 把本次随机生成的口令写入本地文件，供演示者查阅。
     * 文件位于运行目录（默认 backend/data），已在 .gitignore 中忽略；日志只打印路径。
     */
    private void writeCredentials(List<String> lines) {
        Path file = Paths.get(props.getSeed().getCredentialsFile()).toAbsolutePath().normalize();
        List<String> body = new ArrayList<>();
        body.add("# 拾光二手 · 演示账号凭据（本文件由首次启动自动生成，请勿提交到仓库）");
        body.add("# 生成时间：" + timeProvider.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        body.addAll(lines);
        body.add("# 修改口令后请删除本文件，或改由环境变量 APP_SEED_ADMIN_PASSWORD / APP_SEED_DEMO_PASSWORD 提供");
        try {
            if (file.getParent() != null) {
                Files.createDirectories(file.getParent());
            }
            Files.write(file, body, StandardCharsets.UTF_8);
            log.warn("已生成演示口令并写入 {}（请勿提交到仓库；正式部署请改用环境变量注入）", file);
        } catch (Exception e) {
            log.warn("演示口令写入失败（{}）：请改用环境变量 APP_SEED_ADMIN_PASSWORD / APP_SEED_DEMO_PASSWORD 提供口令",
                    e.getMessage());
        }
    }

    private Student student(String email, String nickname, String realName, String studentNo,
                            String certStatus, String accountStatus, int credit, int reviewCount,
                            String pwd, LocalDateTime now) {
        Student s = new Student();
        s.setEmail(email);
        s.setStudentNo(studentNo);
        s.setNickname(nickname);
        s.setRealName(realName);
        s.setPasswordHash(pwd);
        s.setCertStatus(certStatus);
        s.setAccountStatus(accountStatus);
        s.setCreditScore(credit);
        s.setReviewCount(reviewCount);
        s.setVerifiedDisputeCount(0);
        s.setResubmitCount(0);
        s.setFailedLoginCount(0);
        s.setRegisteredAt(now.minusDays(30));
        s.setCreatedAt(now.minusDays(30));
        s.setUpdatedAt(now);
        studentMapper.insert(s);
        return s;
    }

    private Product product(Long sellerId, Long categoryId, String title, String description, int priceCents,
                            String condition, String status, String offReason, LocalDateTime publishedAt, int imageNo) {
        Product p = new Product();
        p.setTitle(title);
        p.setDescription(description);
        p.setPriceCents(priceCents);
        p.setItemCondition(condition);
        p.setSellerId(sellerId);
        p.setCategoryId(categoryId);
        p.setStatus(status);
        p.setOffShelfReason(offReason);
        p.setPublishedAt(publishedAt);
        p.setViewCount(imageNo * 7);
        p.setCreatedAt(publishedAt);
        p.setUpdatedAt(publishedAt);
        productMapper.insert(p);

        String fileName = "seed-" + imageNo + ".svg";
        writeSeedImage(fileName, title);
        ProductImage img = new ProductImage();
        img.setProductId(p.getId());
        img.setSeq(1);
        img.setPath(props.getStorage().getPublicPrefix() + "/" + fileName);
        imageMapper.insert(img);
        return p;
    }

    private void writeSeedImage(String fileName, String title) {
        try {
            Path dir = Paths.get(props.getStorage().getUploadDir(), "product");
            Files.createDirectories(dir);
            Path file = dir.resolve(fileName);
            if (Files.exists(file)) {
                return;
            }
            String safe = title.replace("&", "&amp;").replace("<", "&lt;");
            String shortTitle = safe.length() > 14 ? safe.substring(0, 14) + "…" : safe;
            String svg = """
                    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="450" viewBox="0 0 600 450">
                      <defs>
                        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stop-color="#e5ede6"/>
                          <stop offset="0.55" stop-color="#f2efe3"/>
                          <stop offset="1" stop-color="#d9e4dd"/>
                        </linearGradient>
                      </defs>
                      <rect width="600" height="450" fill="url(#bg)"/>
                      <circle cx="470" cy="96" r="78" fill="#ffffff" opacity="0.38"/>
                      <circle cx="96" cy="372" r="96" fill="#165c46" opacity="0.06"/>
                      <rect x="36" y="330" width="86" height="26" rx="13" fill="#ffffff" opacity="0.75"/>
                      <text x="79" y="348" font-size="13" fill="#165c46" text-anchor="middle"
                            font-family="Microsoft YaHei, sans-serif">校园闲置</text>
                      <text x="300" y="228" font-size="27" fill="#173d31" text-anchor="middle"
                            font-weight="600" font-family="Microsoft YaHei, sans-serif">%s</text>
                    </svg>
                    """.formatted(shortTitle);
            Files.writeString(file, svg, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.warn("写入演示图片失败: {}", e.getMessage());
        }
    }

    private void review(Long orderId, Long reviewerId, Long targetId, String content, LocalDateTime at) {
        Review r = new Review();
        r.setOrderId(orderId);
        r.setReviewerId(reviewerId);
        r.setTargetId(targetId);
        r.setContent(content);
        r.setCreatedAt(at);
        reviewMapper.insert(r);
    }

    private void message(Long productId, String senderType, Long senderId, String receiverType, Long receiverId,
                         String content, LocalDateTime at, String readStatus) {
        ChatMessage m = new ChatMessage();
        m.setProductId(productId);
        m.setSenderType(senderType);
        m.setSenderId(senderId);
        m.setReceiverType(receiverType);
        m.setReceiverId(receiverId);
        m.setContent(content);
        m.setReadStatus(readStatus);
        m.setCreatedAt(at);
        messageMapper.insert(m);
    }

    private void notification(Long studentId, String type, String title, String content, String kind,
                              Long relatedId, LocalDateTime at) {
        Notification n = new Notification();
        n.setRecipientType("student");
        n.setRecipientId(studentId);
        n.setMsgType(type);
        n.setTitle(title);
        n.setContent(content);
        n.setRelatedKind(kind);
        n.setRelatedId(relatedId);
        n.setReadStatus("未读");
        n.setCreatedAt(at);
        notificationMapper.insert(n);
    }
}
