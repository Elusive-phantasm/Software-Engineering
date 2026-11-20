package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.constant.AccountStatus;
import com.campus.trade.constant.CertStatus;
import com.campus.trade.constant.NotifyType;
import com.campus.trade.constant.OffShelfReason;
import com.campus.trade.constant.OrderStatus;
import com.campus.trade.constant.ProductStatus;
import com.campus.trade.entity.Admin;
import com.campus.trade.entity.ChatMessage;
import com.campus.trade.entity.Product;
import com.campus.trade.entity.Student;
import com.campus.trade.entity.TradeOrder;
import com.campus.trade.mapper.AdminMapper;
import com.campus.trade.mapper.ChatMessageMapper;
import com.campus.trade.mapper.ProductMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.mapper.TradeOrderMapper;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.TimeProvider;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 站内私信：UC-29 联系卖家与沟通、UC-30 查看我的私信。
 * 规则：BR-20（必须绑定商品、仅已认证学生可发起、同一(商品,双方)只有一条会话、
 * 管理员仅可回复违规下架异议）、NFR-09（未读数、发送失败不得显示已发送）。
 * 「会话」不是实体：由同一（商品, 双方）的消息行聚合（§6.2.1）。
 */
@Service
@RequiredArgsConstructor
public class MessageService {

    private final ChatMessageMapper messageMapper;
    private final ProductMapper productMapper;
    private final StudentMapper studentMapper;
    private final AdminMapper adminMapper;
    private final TradeOrderMapper orderMapper;
    private final PermissionService permissionService;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;

    /* --------------------------------------------------------- UC-29 发送 */
    @Transactional
    public Views.MessageVo send(AuthUser user, Long productId, Long toId, String content) {
        Student student = permissionService.requireCertifiedStudent(user);
        String text = validateContent(content);

        Product product = productMapper.selectById(productId);
        if (product == null || product.getDeletedAt() != null) {
            throw BizException.notFound("该商品已不存在");
        }
        Long receiverId;
        String receiverType = "student";

        if (product.getSellerId().equals(student.getId())) {
            /* 卖家一侧：只能回复既有会话，或就违规下架向管理员提异议 */
            if (toId == null || toId.equals(student.getId())) {
                throw BizException.state("不能与自己对话");
            }
            Admin targetAdmin = adminMapper.selectById(toId);
            if (targetAdmin != null) {
                if (!OffShelfReason.ADMIN_OFF.equals(product.getOffShelfReason())) {
                    throw BizException.state("仅「管理员违规下架」的商品可向管理员发送异议私信");
                }
                receiverType = "admin";
                receiverId = toId;
            } else {
                if (!hasConversation(productId, student.getId(), toId)) {
                    throw BizException.permission("仅该商品的发布人、沟通过的买家与（违规下架时）管理员可参与");
                }
                receiverId = toId;
            }
        } else {
            /* 买家/咨询方：发起新会话 */
            if (toId != null && !toId.equals(product.getSellerId())) {
                throw BizException.permission("仅该商品的发布人、沟通过的买家与（违规下架时）管理员可参与");
            }
            receiverId = product.getSellerId();
            if (ProductStatus.SOLD.equals(product.getStatus())) {
                boolean isBuyer = orderMapper.selectCount(Wrappers.<TradeOrder>lambdaQuery()
                        .eq(TradeOrder::getProductId, productId)
                        .eq(TradeOrder::getStatus, OrderStatus.VALID)
                        .eq(TradeOrder::getBuyerId, student.getId())) > 0;
                if (!isBuyer) {
                    throw BizException.state("该商品已售出");
                }
            } else if (!ProductStatus.ON_SALE.equals(product.getStatus())) {
                throw BizException.state("该商品暂不可沟通");
            }
        }

        if ("student".equals(receiverType)) {
            Student peer = studentMapper.selectById(receiverId);
            if (peer == null) {
                throw BizException.notFound("对方账号不存在");
            }
            if (AccountStatus.BANNED.equals(peer.getAccountStatus())) {
                throw BizException.state("对方账号当前不可用");
            }
        }

        ChatMessage message = new ChatMessage();
        message.setProductId(productId);
        message.setSenderType("student");
        message.setSenderId(student.getId());
        message.setReceiverType(receiverType);
        message.setReceiverId(receiverId);
        message.setContent(text);
        message.setReadStatus("未读");
        message.setCreatedAt(timeProvider.now());
        messageMapper.insert(message);

        notificationService.notifyStudent(receiverId, NotifyType.MESSAGE, "收到一条新私信",
                student.getNickname() + " 就商品《" + product.getTitle() + "》给你发来消息：" + shortText(text),
                "conversation", message.getId(), productId, student.getId());
        auditService.allowed(user, "已认证学生", "message.send", "product", productId,
                "receiverType=" + receiverType + ", receiverId=" + receiverId);
        return toVo(message, student.getId());
    }

    /* ----------------------------------------------------- 管理员回复异议 */
    @Transactional
    public Views.MessageVo adminReply(AuthUser user, Long productId, Long toId, String content) {
        Admin admin = permissionService.currentAdmin(user);
        String text = validateContent(content);
        Product product = productMapper.selectById(productId);
        if (product == null || product.getDeletedAt() != null) {
            throw BizException.notFound("该商品已不存在");
        }
        if (!OffShelfReason.ADMIN_OFF.equals(product.getOffShelfReason())) {
            throw BizException.permission("管理员仅可回复处置异议会话");
        }
        if (toId == null || !toId.equals(product.getSellerId())) {
            throw BizException.permission("管理员仅可回复该商品的卖家");
        }
        if (!hasConversation(productId, admin.getId(), toId)) {
            throw BizException.permission("管理员仅可回复，不得主动发起私信");
        }

        ChatMessage message = new ChatMessage();
        message.setProductId(productId);
        message.setSenderType("admin");
        message.setSenderId(admin.getId());
        message.setReceiverType("student");
        message.setReceiverId(toId);
        message.setContent(text);
        message.setReadStatus("未读");
        message.setCreatedAt(timeProvider.now());
        messageMapper.insert(message);

        notificationService.notifyStudent(toId, NotifyType.MESSAGE, "管理员回复了你的处置异议",
                "就商品《" + product.getTitle() + "》的处置异议，管理员回复：" + shortText(text),
                "conversation", message.getId(), productId, admin.getId());
        auditService.allowed(user, "管理员", "message.adminReply", "product", productId, "toId=" + toId);
        return toVo(message, admin.getId());
    }

    /* ---------------------------------- 卖家就违规下架向管理员提出异议（UC-13 C） */
    @Transactional
    public Views.MessageVo appeal(AuthUser user, Long productId, String content) {
        Student seller = permissionService.requireCertifiedStudent(user);
        String text = validateContent(content);
        Product product = productMapper.selectById(productId);
        if (product == null || product.getDeletedAt() != null) {
            throw BizException.notFound("该商品已不存在");
        }
        if (!product.getSellerId().equals(seller.getId())) {
            throw BizException.permission("仅该商品的卖家可提出异议");
        }
        if (!OffShelfReason.ADMIN_OFF.equals(product.getOffShelfReason())) {
            throw BizException.state("仅「管理员违规下架」的商品可向管理员提出异议");
        }
        Admin admin = adminMapper.selectList(null).stream().findFirst()
                .orElseThrow(() -> BizException.of(com.campus.trade.common.ErrorCode.INTERNAL, "暂无可用管理员"));
        // 复用发送逻辑指向管理员
        return send(user, productId, admin.getId(), text);
    }

    /* ------------------------------------------------- UC-30 会话列表聚合 */
    public List<Views.ConversationVo> conversations(AuthUser user) {
        if (user == null) {
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "请先登录");
        }
        String kind = user.subjectType();
        Long me = user.subjectId();
        List<ChatMessage> rows = messageMapper.selectList(Wrappers.<ChatMessage>lambdaQuery()
                .and(w -> w.eq(ChatMessage::getSenderType, kind).eq(ChatMessage::getSenderId, me)
                        .or(x -> x.eq(ChatMessage::getReceiverType, kind).eq(ChatMessage::getReceiverId, me)))
                .orderByAsc(ChatMessage::getCreatedAt));

        Map<String, Views.ConversationVo> groups = new LinkedHashMap<>();
        Map<String, Integer> unread = new LinkedHashMap<>();
        Map<String, Integer> counts = new LinkedHashMap<>();
        Map<String, ChatMessage> last = new LinkedHashMap<>();
        Map<String, Long> peerIds = new LinkedHashMap<>();
        Map<String, String> peerTypes = new LinkedHashMap<>();
        Map<String, Long> productIds = new LinkedHashMap<>();

        for (ChatMessage m : rows) {
            boolean mine = kind.equals(m.getSenderType()) && m.getSenderId().equals(me);
            Long peerId = mine ? m.getReceiverId() : m.getSenderId();
            String peerType = mine ? m.getReceiverType() : m.getSenderType();
            String key = m.getProductId() + "|" + peerType + "|" + peerId;
            if (!groups.containsKey(key)) {
                productIds.put(key, m.getProductId());
                peerIds.put(key, peerId);
                peerTypes.put(key, peerType);
                counts.put(key, 0);
                unread.put(key, 0);
                last.put(key, m);
            }
            counts.merge(key, 1, Integer::sum);
            if (!mine && "未读".equals(m.getReadStatus())) {
                unread.merge(key, 1, Integer::sum);
            }
            ChatMessage prev = last.get(key);
            if (prev == null || !m.getCreatedAt().isBefore(prev.getCreatedAt())) {
                last.put(key, m);
            }
        }

        List<Views.ConversationVo> list = new ArrayList<>();
        for (Map.Entry<String, Long> e : productIds.entrySet()) {
            String key = e.getKey();
            Product product = productMapper.selectById(productIds.get(key));
            Long peerId = peerIds.get(key);
            String peerType = peerTypes.get(key);
            String peerNickname;
            boolean peerBanned = false;
            if ("admin".equals(peerType)) {
                Admin admin = adminMapper.selectById(peerId);
                peerNickname = admin == null ? "管理员" : admin.getDisplayName();
            } else {
                Student peer = studentMapper.selectById(peerId);
                peerNickname = peer == null ? "未知用户" : peer.getNickname();
                peerBanned = peer != null && AccountStatus.BANNED.equals(peer.getAccountStatus());
            }
            ChatMessage lastMsg = last.get(key);
            boolean lastFromMe = kind.equals(lastMsg.getSenderType()) && lastMsg.getSenderId().equals(me);
            list.add(new Views.ConversationVo(productIds.get(key),
                    product == null ? "（商品已删除）" : product.getTitle(),
                    product == null ? null : product.getStatus(), peerId, peerNickname, peerBanned,
                    unread.get(key), counts.get(key), shortText(lastMsg.getContent()),
                    lastMsg.getCreatedAt(), lastFromMe));
        }
        list.sort(Comparator.comparing(Views.ConversationVo::lastAt).reversed());
        return list;
    }

    /* ------------------------------------------- UC-30 会话详情 + 置已读 */
    @Transactional
    public Views.ConversationDetailVo conversation(AuthUser user, Long productId, Long peerId) {
        if (user == null) {
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "请先登录");
        }
        String kind = user.subjectType();
        Long me = user.subjectId();
        Product product = productMapper.selectById(productId);
        List<ChatMessage> candidates = messageMapper.selectList(Wrappers.<ChatMessage>lambdaQuery()
                .eq(ChatMessage::getProductId, productId)
                .and(w -> w.and(x -> x.eq(ChatMessage::getSenderType, kind).eq(ChatMessage::getSenderId, me))
                        .or(x -> x.eq(ChatMessage::getReceiverType, kind).eq(ChatMessage::getReceiverId, me)))
                .orderByAsc(ChatMessage::getCreatedAt));
        // 只保留「我 ↔ 指定对方」的会话，避免把同一商品下其它会话混进来
        List<ChatMessage> rows = candidates.stream()
                .filter(m -> (kind.equals(m.getSenderType()) && m.getSenderId().equals(me)
                        && peerId.equals(m.getReceiverId()))
                        || (kind.equals(m.getReceiverType()) && m.getReceiverId().equals(me)
                        && peerId.equals(m.getSenderId())))
                .toList();
        if (rows.isEmpty()) {
            // 首次联系卖家时还没有任何消息，应允许打开一个空会话；
            // 能否真正发送由 send() 按 BR-20 再校验（认证、商品状态、封禁）。
            boolean canStart = false;
            if ("student".equals(kind) && product != null && product.getDeletedAt() == null
                    && !product.getSellerId().equals(me)
                    && product.getSellerId().equals(peerId)) {
                if (ProductStatus.SOLD.equals(product.getStatus())) {
                    canStart = orderMapper.selectCount(Wrappers.<TradeOrder>lambdaQuery()
                            .eq(TradeOrder::getProductId, productId)
                            .eq(TradeOrder::getStatus, OrderStatus.VALID)
                            .eq(TradeOrder::getBuyerId, me)) > 0;
                    if (!canStart) {
                        throw BizException.state("该商品已售出");
                    }
                } else if (ProductStatus.ON_SALE.equals(product.getStatus())) {
                    canStart = true;
                } else {
                    throw BizException.state("该商品暂不可沟通");
                }
            }
            if (!canStart) {
                throw BizException.permission("非本人参与的会话");
            }
        }
        if (kind.equals("admin") && product != null
                && !OffShelfReason.ADMIN_OFF.equals(product.getOffShelfReason())) {
            throw BizException.permission("管理员仅可查看处置异议会话");
        }

        messageMapper.update(null, Wrappers.<ChatMessage>lambdaUpdate()
                .eq(ChatMessage::getProductId, productId)
                .eq(ChatMessage::getReceiverType, kind)
                .eq(ChatMessage::getReceiverId, me)
                .eq(ChatMessage::getSenderId, peerId)
                .eq(ChatMessage::getReadStatus, "未读")
                .set(ChatMessage::getReadStatus, "已读"));

        // 置读后响应也要反映已读，避免「刚打开却仍显示未读」
        List<Views.MessageVo> messages = rows.stream()
                .map(m -> toVo(m, me, true))
                .toList();

        String peerNickname;
        boolean peerBanned = false;
        boolean iAmSeller = kind.equals("student") && product != null && product.getSellerId().equals(me);
        if ("admin".equals(kind) || isAdminId(peerId)) {
            Admin admin = adminMapper.selectById(peerId);
            peerNickname = admin == null ? "管理员" : admin.getDisplayName();
        } else {
            Student peer = studentMapper.selectById(peerId);
            peerNickname = peer == null ? "未知用户" : peer.getNickname();
            peerBanned = peer != null && AccountStatus.BANNED.equals(peer.getAccountStatus());
        }
        return new Views.ConversationDetailVo(productId, product == null ? "（商品已删除）" : product.getTitle(),
                product == null ? null : product.getStatus(),
                product == null ? null : product.getOffShelfReason(),
                peerId, peerNickname, peerBanned, iAmSeller, messages);
    }

    public int unreadCount(AuthUser user) {
        if (user == null) {
            return 0;
        }
        return Math.toIntExact(messageMapper.selectCount(Wrappers.<ChatMessage>lambdaQuery()
                .eq(ChatMessage::getReceiverType, user.subjectType())
                .eq(ChatMessage::getReceiverId, user.subjectId())
                .eq(ChatMessage::getReadStatus, "未读")));
    }

    /* ---------------------------------------------------------------- 工具 */

    private boolean isAdminId(Long id) {
        return adminMapper.selectById(id) != null;
    }

    private boolean hasConversation(Long productId, Long a, Long b) {
        return messageMapper.selectCount(Wrappers.<ChatMessage>lambdaQuery()
                .eq(ChatMessage::getProductId, productId)
                .and(w -> w.and(x -> x.eq(ChatMessage::getSenderId, a).eq(ChatMessage::getReceiverId, b))
                        .or(x -> x.eq(ChatMessage::getSenderId, b).eq(ChatMessage::getReceiverId, a)))) > 0;
    }

    private String validateContent(String content) {
        String text = content == null ? "" : content.trim();
        if (text.isEmpty()) {
            throw BizException.validate("消息内容不能为空");
        }
        if (text.length() > 500) {
            throw BizException.validate("消息长度不得超过 500 字");
        }
        return text;
    }

    private Views.MessageVo toVo(ChatMessage m, Long me) {
        return toVo(m, me, false);
    }

    private Views.MessageVo toVo(ChatMessage m, Long me, boolean forceReadForMe) {
        boolean mine = me != null && m.getSenderId().equals(me);
        boolean read = "已读".equals(m.getReadStatus()) || (forceReadForMe && !mine);
        return new Views.MessageVo(m.getId(), m.getProductId(), m.getSenderType(), m.getSenderId(),
                m.getReceiverType(), m.getReceiverId(), m.getContent(), read, mine, m.getCreatedAt());
    }

    private String shortText(String text) {
        return text == null ? null : (text.length() <= 60 ? text : text.substring(0, 60));
    }
}
