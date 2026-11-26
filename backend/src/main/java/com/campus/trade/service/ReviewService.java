package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.CertStatus;
import com.campus.trade.constant.CreditEvent;
import com.campus.trade.constant.NotifyType;
import com.campus.trade.constant.OrderStatus;
import com.campus.trade.entity.Review;
import com.campus.trade.entity.Student;
import com.campus.trade.entity.TradeOrder;
import com.campus.trade.mapper.ReviewMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.mapper.TradeOrderMapper;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.ContentFilter;
import com.campus.trade.util.TimeProvider;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 评价：UC-14。规则 BR-08（仅有效成交双方、每人一次、不可改、仅文字、7 天内、双方均提交后展示、
 * 已撤销不可评价）、BR-14 ①（评价人 +2）。
 */
@Service
@RequiredArgsConstructor
public class ReviewService {

    private static final Set<String> ABUSE_WORDS = Set.of("傻逼", "sb", "垃圾东西", "骗子死全家");

    private final ReviewMapper reviewMapper;
    private final TradeOrderMapper orderMapper;
    private final StudentMapper studentMapper;
    private final PermissionService permissionService;
    private final NotificationService notificationService;
    private final CreditService creditService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    @Transactional
    public Views.ReviewVo submit(AuthUser user, Long orderId, String rawContent) {
        Student actor = permissionService.requireCertifiedStudent(user, "请先登录", "管理员无评价权限");
        String content = validate(rawContent);

        TradeOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw BizException.notFound("成交记录不存在");
        }
        if (!actor.getId().equals(order.getBuyerId()) && !actor.getId().equals(order.getSellerId())) {
            throw BizException.permission("仅成交双方可评价");
        }
        if (OrderStatus.CANCELLED.equals(order.getStatus())) {
            throw BizException.state("该成交已撤销，不可评价");
        }
        if (reviewMapper.selectCount(Wrappers.<Review>lambdaQuery()
                .eq(Review::getOrderId, orderId)
                .eq(Review::getReviewerId, actor.getId())) > 0) {
            throw BizException.state("该订单已评价");
        }
        LocalDateTime deadline = order.getCreatedAt().plusHours(props.getDeadlines().getReviewWindowHours());
        if (!timeProvider.now().isBefore(deadline)) {
            throw BizException.state("评价期限已过");
        }

        Long targetId = actor.getId().equals(order.getBuyerId()) ? order.getSellerId() : order.getBuyerId();
        Review review = new Review();
        review.setOrderId(orderId);
        review.setReviewerId(actor.getId());
        review.setTargetId(targetId);
        review.setContent(content);
        review.setCreatedAt(timeProvider.now());
        reviewMapper.insert(review);

        // 被评价人「收到的评价数」+1（展示仍受「双方均提交」约束）
        studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                .eq(Student::getId, targetId)
                .setSql("review_count = review_count + 1"));

        // BR-14 ①：提交评价方 +2（不要求对方也评价）
        creditService.apply(actor.getId(), props.getCredit().getReviewBonus(), CreditEvent.REVIEW_BONUS,
                "提交交易评价", "review:" + orderId + ":" + actor.getId(), orderId);

        notificationService.notifyStudent(targetId, NotifyType.DEAL, "你收到一条交易评价",
                "对方已对这笔成交提交评价。双方均已提交后，评价将在你的个人主页展示（BR-08）。",
                "order", orderId, order.getProductId(), actor.getId());
        auditService.allowed(user, roleOf(actor), "review.submit", "review", review.getId(), "orderId=" + orderId);

        Student reviewer = studentMapper.selectById(actor.getId());
        return new Views.ReviewVo(review.getId(), orderId, actor.getId(), reviewer == null ? null : reviewer.getNickname(),
                targetId, content, review.getCreatedAt());
    }

    /** BR-08：仅当双方均已提交时才对外展示 */
    public List<Views.ReviewVo> publicReceived(Long studentId) {
        List<Review> rows = reviewMapper.selectList(Wrappers.<Review>lambdaQuery()
                .eq(Review::getTargetId, studentId)
                .isNull(Review::getDeletedAt)
                .orderByDesc(Review::getCreatedAt));
        return rows.stream()
                .filter(r -> reviewMapper.selectCount(Wrappers.<Review>lambdaQuery()
                        .eq(Review::getOrderId, r.getOrderId())
                        .isNull(Review::getDeletedAt)) >= 2)
                .map(this::toVo)
                .toList();
    }

    public List<Views.ReviewVo> writtenBy(AuthUser user) {
        Student me = permissionService.currentStudent(user);
        return reviewMapper.selectList(Wrappers.<Review>lambdaQuery()
                        .eq(Review::getReviewerId, me.getId())
                        .isNull(Review::getDeletedAt)
                        .orderByDesc(Review::getCreatedAt))
                .stream().map(this::toVo).toList();
    }

    public List<Views.ReviewVo> receivedBy(AuthUser user) {
        Student me = permissionService.currentStudent(user);
        return reviewMapper.selectList(Wrappers.<Review>lambdaQuery()
                        .eq(Review::getTargetId, me.getId())
                        .isNull(Review::getDeletedAt)
                        .orderByDesc(Review::getCreatedAt))
                .stream().map(this::toVo).toList();
    }

    /** 管理员删除他人评价（§5.2 权限矩阵） */
    @Transactional
    public void deleteByAdmin(AuthUser user, Long reviewId, String reason) {
        permissionService.currentAdmin(user);
        Review review = reviewMapper.selectById(reviewId);
        if (review == null) {
            throw BizException.notFound("评价不存在");
        }
        if (review.getDeletedAt() != null) {
            throw BizException.state("该评价已删除");
        }
        String note = reason == null ? "" : reason.trim();
        if (note.isEmpty()) {
            throw BizException.validate("请填写删除依据");
        }
        reviewMapper.update(null, Wrappers.<Review>lambdaUpdate()
                .eq(Review::getId, reviewId)
                .set(Review::getDeletedBy, user.subjectId())
                .set(Review::getDeletedAt, timeProvider.now()));
        studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                .eq(Student::getId, review.getTargetId())
                .setSql("review_count = CASE WHEN review_count > 0 THEN review_count - 1 ELSE 0 END"));
        notificationService.notifyStudent(review.getTargetId(), NotifyType.DISPOSE, "一条评价已被管理员删除",
                "依据 BR-04 处置范围，你收到的一条评价已被管理员删除。理由：" + note, "review", reviewId, null, null);
        auditService.allowed(user, "管理员", "review.delete", "review", reviewId, note);
    }

    private String validate(String raw) {
        String content = raw == null ? "" : raw.trim();
        if (content.isEmpty()) {
            throw BizException.validate("请填写评价内容");
        }
        if (content.length() > props.getLimits().getReviewMax()) {
            throw BizException.validate("评价内容不得超过 " + props.getLimits().getReviewMax() + " 字");
        }
        if (ContentFilter.isOffsiteDiversion(content)) {
            throw BizException.validate("评价中不得包含站外联系方式或广告（站外导流）");
        }
        String lower = content.toLowerCase();
        if (ABUSE_WORDS.stream().anyMatch(lower::contains)) {
            throw BizException.validate("评价含有不当用语，请修改后提交");
        }
        return content;
    }

    private Views.ReviewVo toVo(Review r) {
        Student reviewer = studentMapper.selectById(r.getReviewerId());
        return new Views.ReviewVo(r.getId(), r.getOrderId(), r.getReviewerId(),
                reviewer == null ? null : reviewer.getNickname(), r.getTargetId(), r.getContent(), r.getCreatedAt());
    }

    private String roleOf(Student s) {
        return CertStatus.CERTIFIED.equals(s.getCertStatus()) ? "已认证学生" : "未认证学生";
    }

    public Map<String, Object> stats(Long studentId) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("received", reviewMapper.selectCount(Wrappers.<Review>lambdaQuery()
                .eq(Review::getTargetId, studentId).isNull(Review::getDeletedAt)));
        map.put("written", reviewMapper.selectCount(Wrappers.<Review>lambdaQuery()
                .eq(Review::getReviewerId, studentId).isNull(Review::getDeletedAt)));
        return map;
    }
}
