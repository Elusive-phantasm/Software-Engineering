package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.NotifyType;
import com.campus.trade.entity.Notification;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.AdminMapper;
import com.campus.trade.mapper.NotificationMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.TimeProvider;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 站内通知（BR-15）。通知由系统事件触发，不是用例；用户主动查看是 UC-18。
 */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationMapper notificationMapper;
    private final StudentMapper studentMapper;
    private final AdminMapper adminMapper;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    public void notifyStudent(Long studentId, String msgType, String title, String content,
                              String relatedKind, Long relatedId, Long productId, Long peerId) {
        if (studentId == null) {
            return;
        }
        insert("student", studentId, msgType, title, content, relatedKind, relatedId, productId, peerId);
    }

    public void notifyAdmin(Long adminId, String msgType, String title, String content,
                            String relatedKind, Long relatedId) {
        insert("admin", adminId, msgType, title, content, relatedKind, relatedId, null, null);
    }

    /** 通知全部管理员（新举报、新核验申请等） */
    public void notifyAllAdmins(String msgType, String title, String content, String relatedKind, Long relatedId) {
        adminMapper.selectList(null).forEach(a ->
                notifyAdmin(a.getId(), msgType, title, content, relatedKind, relatedId));
    }

    /** BR-15：通知收藏过该商品的买家 */
    public void notifyFavoriters(List<Long> studentIds, String title, String content, Long productId) {
        for (Long sid : studentIds) {
            notifyStudent(sid, NotifyType.PRODUCT_REVIEW, title, content, "product", productId, productId, null);
        }
    }

    /* ------------------------------------------------------------ UC-18 */
    public Map<String, Object> list(AuthUser user, int page, int size) {
        if (user == null) {
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "请先登录");
        }
        int p = Math.max(1, page);
        int s = Math.min(100, Math.max(1, size));
        LocalDateTime cutoff = timeProvider.now().minusDays(props.getRetention().getNotificationDays());

        long total = notificationMapper.selectCount(Wrappers.<Notification>lambdaQuery()
                .eq(Notification::getRecipientType, user.subjectType())
                .eq(Notification::getRecipientId, user.subjectId())
                .ge(Notification::getCreatedAt, cutoff));
        List<Notification> rows = notificationMapper.selectList(Wrappers.<Notification>lambdaQuery()
                .eq(Notification::getRecipientType, user.subjectType())
                .eq(Notification::getRecipientId, user.subjectId())
                .ge(Notification::getCreatedAt, cutoff)
                .orderByDesc(Notification::getCreatedAt)
                .last("LIMIT " + s + " OFFSET " + ((p - 1) * s)));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total);
        result.put("page", p);
        result.put("pageSize", s);
        result.put("retentionDays", props.getRetention().getNotificationDays());
        result.put("unread", unreadCount(user.subjectType(), user.subjectId()));
        result.put("items", rows.stream().map(this::toVo).toList());
        return result;
    }

    public void markRead(AuthUser user, Long id) {
        if (user == null) {
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "请先登录");
        }
        Notification n = notificationMapper.selectById(id);
        if (n == null || !n.getRecipientType().equals(user.subjectType())
                || !n.getRecipientId().equals(user.subjectId())) {
            throw BizException.permission("仅可操作本人通知");
        }
        if (!"已读".equals(n.getReadStatus())) {
            notificationMapper.update(null, Wrappers.<Notification>lambdaUpdate()
                    .eq(Notification::getId, id).set(Notification::getReadStatus, "已读"));
        }
    }

    public void markAllRead(AuthUser user) {
        if (user == null) {
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "请先登录");
        }
        notificationMapper.update(null, Wrappers.<Notification>lambdaUpdate()
                .eq(Notification::getRecipientType, user.subjectType())
                .eq(Notification::getRecipientId, user.subjectId())
                .eq(Notification::getReadStatus, "未读")
                .set(Notification::getReadStatus, "已读"));
    }

    public long unreadCount(String recipientType, Long recipientId) {
        return notificationMapper.selectCount(Wrappers.<Notification>lambdaQuery()
                .eq(Notification::getRecipientType, recipientType)
                .eq(Notification::getRecipientId, recipientId)
                .eq(Notification::getReadStatus, "未读"));
    }

    public Student student(Long id) {
        return id == null ? null : studentMapper.selectById(id);
    }

    /* ---------------------------------------------------------------- 工具 */

    private void insert(String recipientType, Long recipientId, String msgType, String title, String content,
                        String relatedKind, Long relatedId, Long productId, Long peerId) {
        Notification n = new Notification();
        n.setRecipientType(recipientType);
        n.setRecipientId(recipientId);
        n.setMsgType(msgType);
        n.setTitle(truncate(title, 100));
        n.setContent(truncate(content, 500));
        n.setRelatedKind(relatedKind);
        n.setRelatedId(relatedId);
        n.setProductId(productId);
        n.setPeerId(peerId);
        n.setReadStatus("未读");
        n.setCreatedAt(timeProvider.now());
        notificationMapper.insert(n);
    }

    private Views.NotificationVo toVo(Notification n) {
        return new Views.NotificationVo(n.getId(), n.getMsgType(), n.getTitle(), n.getContent(),
                n.getRelatedKind(), n.getRelatedId(), n.getProductId(), n.getPeerId(),
                "已读".equals(n.getReadStatus()), n.getCreatedAt());
    }

    private String truncate(String text, int max) {
        return text == null ? null : (text.length() <= max ? text : text.substring(0, max));
    }
}
