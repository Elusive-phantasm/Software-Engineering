package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.CancelJudgement;
import com.campus.trade.constant.CertStatus;
import com.campus.trade.constant.CreditEvent;
import com.campus.trade.constant.NotifyType;
import com.campus.trade.constant.OrderStatus;
import com.campus.trade.constant.ProductStatus;
import com.campus.trade.constant.ReportStatus;
import com.campus.trade.entity.CertificationApplication;
import com.campus.trade.entity.Notification;
import com.campus.trade.entity.Product;
import com.campus.trade.entity.Report;
import com.campus.trade.entity.Review;
import com.campus.trade.entity.Student;
import com.campus.trade.entity.TradeOrder;
import com.campus.trade.mapper.CertificationApplicationMapper;
import com.campus.trade.mapper.NotificationMapper;
import com.campus.trade.mapper.ProductMapper;
import com.campus.trade.mapper.ReportMapper;
import com.campus.trade.mapper.ReviewMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.mapper.TradeOrderMapper;
import com.campus.trade.util.TimeProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 定时任务（需求中没有「定时任务」用例，但以下判定必须由系统完成）：
 *   AT-06 学生证审核超 24 小时 → 提醒管理员、计入超时统计，**不得自动通过**
 *   AT-07 注册满 7 天未提交核验 → 每日提醒一次，**不得自动驳回或封禁**
 *   商品审核 / 举报处理超 24 小时 → 提醒管理员
 *   BR-14 ③ 成交满 7 天未评价 → 未评价方 −1
 *   UC-31 辅事件流 C 撤销满 7 天对方未判定 → 自动置「计违约」，撤销方 −2
 * 所有时间以服务端 now() 为准，判定区间左闭右开（恰好到点即视为超期）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SchedulerService {

    private static final int REMIND_DEDUPE_HOURS = 6;

    private final StudentMapper studentMapper;
    private final ProductMapper productMapper;
    private final TradeOrderMapper orderMapper;
    private final ReviewMapper reviewMapper;
    private final CertificationApplicationMapper certMapper;
    private final ReportMapper reportMapper;
    private final NotificationMapper notificationMapper;
    private final NotificationService notificationService;
    private final CreditService creditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    @Scheduled(fixedDelay = 30_000, initialDelay = 20_000)
    public void tick() {
        try {
            Map<String, Object> result = runAll();
            if (!((Map<?, ?>) result.get("counts")).isEmpty()) {
                log.debug("定时判定执行: {}", result.get("counts"));
            }
        } catch (Exception e) {
            log.warn("定时任务执行失败: {}", e.getMessage(), e);
        }
    }

    @Transactional
    public Map<String, Object> runAll() {
        LocalDateTime now = timeProvider.now();
        Map<String, Integer> counts = new LinkedHashMap<>();
        counts.put("certReminders", certSubmitReminder(now));
        counts.put("certTimeouts", certReviewTimeout(now));
        counts.put("productTimeouts", productReviewTimeout(now));
        counts.put("reportTimeouts", reportTimeout(now));
        counts.put("noReviewPenalties", noReviewPenalty(now));
        counts.put("cancelAutoJudgements", cancelJudgeTimeout(now));
        counts.values().removeIf(v -> v == 0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("at", now.toString());
        result.put("counts", counts);
        return result;
    }

    /* ------------------------------------------------ AT-07 提交期限提醒 */
    private int certSubmitReminder(LocalDateTime now) {
        int count = 0;
        List<Student> students = studentMapper.selectList(Wrappers.<Student>lambdaQuery()
                .eq(Student::getCertStatus, CertStatus.NONE));
        for (Student s : students) {
            if (s.getRegisteredAt() == null) {
                continue;
            }
            LocalDateTime deadline = s.getRegisteredAt().plusHours(props.getDeadlines().getCertSubmitHours());
            if (now.isBefore(deadline)) {
                continue;
            }
            if (s.getLastCertReminderAt() != null && s.getLastCertReminderAt().isAfter(now.minusHours(20))) {
                continue;
            }
            notificationService.notifyStudent(s.getId(), NotifyType.CERT, "请尽快提交学生证核验",
                    "你已注册满 7 天但尚未提交学生证核验。未通过核验前可以浏览与收藏，但无法发布商品、下单、评价与举报。",
                    "cert", null, null, null);
            studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                    .eq(Student::getId, s.getId())
                    .set(Student::getLastCertReminderAt, now));
            count++;
        }
        return count;
    }

    /* ------------------------------------------------ AT-06 审核超时提醒 */
    private int certReviewTimeout(LocalDateTime now) {
        int count = 0;
        List<CertificationApplication> apps = certMapper.selectList(Wrappers.<CertificationApplication>lambdaQuery()
                .eq(CertificationApplication::getReviewStatus, "待审核"));
        for (CertificationApplication app : apps) {
            LocalDateTime deadline = app.getSubmittedAt()
                    .plusHours(props.getDeadlines().getCertReviewTimeoutHours());
            if (now.isBefore(deadline) || recentlyNotified("核验", app.getId(), now)) {
                continue;
            }
            notificationService.notifyAllAdmins(NotifyType.CERT, "学生证核验已超时",
                    "认证申请 #" + app.getId() + " 已超过 24 小时未出结论，请尽快审核（系统不会自动通过）。",
                    "cert", app.getId());
            count++;
        }
        return count;
    }

    /* -------------------------------------------- 商品审核超时 / 举报超时 */
    private int productReviewTimeout(LocalDateTime now) {
        int count = 0;
        List<Product> products = productMapper.selectList(Wrappers.<Product>lambdaQuery()
                .eq(Product::getStatus, ProductStatus.PENDING).isNull(Product::getDeletedAt));
        for (Product p : products) {
            LocalDateTime deadline = p.getPublishedAt()
                    .plusHours(props.getDeadlines().getProductReviewTimeoutHours());
            if (now.isBefore(deadline) || recentlyNotified("商品审核", p.getId(), now)) {
                continue;
            }
            notificationService.notifyAllAdmins(NotifyType.PRODUCT_REVIEW, "商品审核已超时",
                    "商品《" + p.getTitle() + "》已超过 24 小时未审核，请尽快处理。", "product", p.getId());
            count++;
        }
        return count;
    }

    private int reportTimeout(LocalDateTime now) {
        int count = 0;
        List<Report> reports = reportMapper.selectList(Wrappers.<Report>lambdaQuery()
                .eq(Report::getHandleStatus, ReportStatus.PENDING));
        for (Report r : reports) {
            LocalDateTime deadline = r.getCreatedAt()
                    .plusHours(props.getDeadlines().getReportHandleTimeoutHours());
            if (now.isBefore(deadline) || recentlyNotified("处置", r.getId(), now)) {
                continue;
            }
            notificationService.notifyAllAdmins(NotifyType.DISPOSE, "举报处理已超时",
                    "举报 #" + r.getId() + " 已超过 24 小时未处理，请尽快判定。", "report", r.getId());
            count++;
        }
        return count;
    }

    /* ------------------------------------------- BR-14 ③ 7 天未评价 −1 */
    private int noReviewPenalty(LocalDateTime now) {
        int count = 0;
        List<TradeOrder> orders = orderMapper.selectList(Wrappers.<TradeOrder>lambdaQuery()
                .eq(TradeOrder::getStatus, OrderStatus.VALID));
        for (TradeOrder o : orders) {
            LocalDateTime deadline = o.getCreatedAt()
                    .plusHours(props.getDeadlines().getNoReviewPenaltyHours());
            if (now.isBefore(deadline)) {
                continue;
            }
            for (Long studentId : List.of(o.getBuyerId(), o.getSellerId())) {
                boolean reviewed = reviewMapper.selectCount(Wrappers.<Review>lambdaQuery()
                        .eq(Review::getOrderId, o.getId())
                        .eq(Review::getReviewerId, studentId)
                        .isNull(Review::getDeletedAt)) > 0;
                if (reviewed) {
                    continue;
                }
                var res = creditService.apply(studentId, props.getCredit().getNoReviewPenalty(),
                        CreditEvent.NO_REVIEW, "成交后 7 天内未提交评价",
                        "noreview:" + o.getId() + ":" + studentId, o.getId());
                if (res.applied() != 0) {
                    count++;
                }
            }
        }
        return count;
    }

    /* --------------------------------- UC-31 辅事件流 C 7 天未判定 → 计违约 */
    private int cancelJudgeTimeout(LocalDateTime now) {
        int count = 0;
        List<TradeOrder> orders = orderMapper.selectList(Wrappers.<TradeOrder>lambdaQuery()
                .eq(TradeOrder::getStatus, OrderStatus.CANCELLED)
                .eq(TradeOrder::getCancelJudgement, CancelJudgement.PENDING));
        for (TradeOrder o : orders) {
            LocalDateTime deadline = o.getCancelledAt()
                    .plusHours(props.getDeadlines().getCancelJudgementHours());
            if (now.isBefore(deadline)) {
                continue;
            }
            // 与「对方人工判定」竞态：以「待判定」为条件，先落库者为准
            int changed = orderMapper.update(null, Wrappers.<TradeOrder>lambdaUpdate()
                    .eq(TradeOrder::getId, o.getId())
                    .eq(TradeOrder::getCancelJudgement, CancelJudgement.PENDING)
                    .set(TradeOrder::getCancelJudgement, CancelJudgement.BREACH)
                    .set(TradeOrder::getJudgementAt, now)
                    .set(TradeOrder::getUpdatedAt, now));
            if (changed == 0) {
                continue;
            }
            creditService.apply(o.getCancelInitiatorId(), props.getCredit().getCancelPenalty(),
                    CreditEvent.CANCEL_BREACH, "撤销成交后 7 天内对方未作判定，系统自动计违约",
                    "cancel:" + o.getId(), o.getId());
            Long peerId = o.getCancelInitiatorId().equals(o.getBuyerId()) ? o.getSellerId() : o.getBuyerId();
            notificationService.notifyStudent(o.getCancelInitiatorId(), NotifyType.DEAL, "撤销被判计违约",
                    "你发起的撤销在 7 天内未获对方免责判定，系统已自动计违约，信用分 "
                            + props.getCredit().getCancelPenalty() + "。", "order", o.getId(), o.getProductId(), null);
            notificationService.notifyStudent(peerId, NotifyType.DEAL, "撤销免责判定已超时",
                    "你在 7 天内未对这笔撤销作出判定，系统已自动计对方违约。",
                    "order", o.getId(), o.getProductId(), o.getCancelInitiatorId());
            count++;
        }
        return count;
    }

    private boolean recentlyNotified(String msgType, Long relatedId, LocalDateTime now) {
        return notificationMapper.selectCount(Wrappers.<Notification>lambdaQuery()
                .eq(Notification::getMsgType, msgType)
                .eq(Notification::getRelatedId, relatedId)
                .ge(Notification::getCreatedAt, now.minusHours(REMIND_DEDUPE_HOURS))) > 0;
    }
}
