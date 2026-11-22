package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.*;
import com.campus.trade.entity.*;
import com.campus.trade.mapper.*;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.TimeProvider;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

/**
 * 订单（成交记录）：UC-10 下单成交、UC-16 我的订单、UC-31 撤销成交。
 * 本版订单**没有状态机**，只有「成交状态」与「撤销免责判定」两个标记（SRS §7.1）。
 * 事务与幂等：BR-06（下单即成交、同商品最多一条有效成交）、BR-21（单方即时撤销、7 天判定）。
 */
@Service
@RequiredArgsConstructor
public class OrderService {

    public static final Set<String> CANCEL_REASONS =
            Set.of("买家不想要了", "卖家不卖了", "货物与描述不符", "约不上时间", "其他");

    private final TradeOrderMapper orderMapper;
    private final ProductMapper productMapper;
    private final ReviewMapper reviewMapper;
    private final StudentMapper studentMapper;
    private final FavoriteMapper favoriteMapper;
    private final PermissionService permissionService;
    private final NotificationService notificationService;
    private final CreditService creditService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    /* ------------------------------------------------------ UC-10 / ST-05 */
    @Transactional
    public Views.OrderVo create(AuthUser user, Long productId) {
        Student buyer = permissionService.requireOrderRights(user);

        Product product = productMapper.selectById(productId);
        if (product == null || product.getDeletedAt() != null) {
            throw BizException.notFound("该商品已不存在");
        }
        if (product.getSellerId().equals(buyer.getId())) {
            throw BizException.state("不能购买自己发布的商品");
        }
        if (ProductStatus.SOLD.equals(product.getStatus())) {
            // 重复提交同一购买请求 → 返回同一订单，不重复成交（UC-10 辅事件流 F）
            TradeOrder mine = orderMapper.selectOne(Wrappers.<TradeOrder>lambdaQuery()
                    .eq(TradeOrder::getProductId, productId)
                    .eq(TradeOrder::getBuyerId, buyer.getId())
                    .eq(TradeOrder::getStatus, OrderStatus.VALID));
            if (mine != null) {
                return detail(user, mine.getId());
            }
            throw BizException.state("该商品已售出");
        }
        if (!ProductStatus.ON_SALE.equals(product.getStatus())) {
            throw BizException.state("该商品不可购买");
        }
        long activeOrders = orderMapper.selectCount(Wrappers.<TradeOrder>lambdaQuery()
                .eq(TradeOrder::getBuyerId, buyer.getId())
                .eq(TradeOrder::getStatus, OrderStatus.VALID));
        if (activeOrders >= props.getLimits().getMaxActiveOrdersPerStudent()) {
            throw BizException.state("个人有效订单数已达到上限（"
                    + props.getLimits().getMaxActiveOrdersPerStudent() + " 笔）");
        }

        // 原子切换：条件更新 + 唯一索引（uk_order_one_valid）双重保证并发只有一笔成功
        int changed = productMapper.update(null, Wrappers.<Product>lambdaUpdate()
                .eq(Product::getId, productId)
                .eq(Product::getStatus, ProductStatus.ON_SALE)
                .isNull(Product::getDeletedAt)
                .set(Product::getStatus, ProductStatus.SOLD)
                .set(Product::getUpdatedAt, timeProvider.now()));
        if (changed == 0) {
            throw BizException.state("该商品已售出");
        }

        TradeOrder order = new TradeOrder();
        order.setProductId(productId);
        order.setBuyerId(buyer.getId());
        order.setSellerId(product.getSellerId());
        order.setAmountCents(product.getPriceCents());
        order.setStatus(OrderStatus.VALID);
        order.setCreatedAt(timeProvider.now());
        order.setDeliveryDeadline(timeProvider.now().plusHours(props.getDeadlines().getDeliveryWindowHours()));
        order.setUpdatedAt(timeProvider.now());
        orderMapper.insert(order);

        String amount = BigDecimal.valueOf(product.getPriceCents(), 2).toPlainString();
        notificationService.notifyStudent(buyer.getId(), NotifyType.DEAL, "下单成功，交易已成交",
                "你已买下《" + product.getTitle() + "》，成交金额 " + amount
                        + " 元。平台不展示对方手机号，请在站内私信中与卖家约定取货时间与地点。",
                "order", order.getId(), productId, product.getSellerId());
        notificationService.notifyStudent(product.getSellerId(), NotifyType.DEAL, "你的商品已成交",
                "《" + product.getTitle() + "》已被买家下单成交，成交金额 " + amount
                        + " 元。请在站内私信中与买家约定取货时间与地点。",
                "order", order.getId(), productId, buyer.getId());
        auditService.allowed(user, roleOf(buyer), "order.create", "order", order.getId(),
                "productId=" + productId + ", amount=" + amount);

        return detail(user, order.getId());
    }

    /* ------------------------------------------------------ UC-16 我的订单 */
    public List<Views.OrderVo> myOrders(AuthUser user, String role) {
        Student me = permissionService.currentStudent(user);
        var wrapper = Wrappers.<TradeOrder>lambdaQuery().orderByDesc(TradeOrder::getCreatedAt);
        if ("buyer".equals(role)) {
            wrapper.eq(TradeOrder::getBuyerId, me.getId());
        } else if ("seller".equals(role)) {
            wrapper.eq(TradeOrder::getSellerId, me.getId());
        } else {
            wrapper.and(w -> w.eq(TradeOrder::getBuyerId, me.getId()).or().eq(TradeOrder::getSellerId, me.getId()));
        }
        return orderMapper.selectList(wrapper).stream().map(o -> toVo(o, user)).toList();
    }

    public Views.OrderVo detail(AuthUser user, Long orderId) {
        TradeOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw BizException.notFound("成交记录不存在");
        }
        if (user == null) {
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "请先登录");
        }
        boolean buyer = user.isStudent() && user.subjectId().equals(order.getBuyerId());
        boolean seller = user.isStudent() && user.subjectId().equals(order.getSellerId());
        if (!buyer && !seller && !user.isAdmin()) {
            throw BizException.permission("仅成交双方可查看该成交记录");
        }
        return toVo(order, user);
    }

    /* ------------------------------------------------------ UC-31 / ST-10、ST-11 */
    @Transactional
    public Views.OrderVo cancel(AuthUser user, Long orderId, String reason) {
        Student actor = permissionService.requireCertifiedStudent(user);
        String reasonV = reason == null ? "" : reason.trim();
        if (!CANCEL_REASONS.contains(reasonV)) {
            throw BizException.validate("撤销原因须取自固定选项");
        }

        TradeOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw BizException.notFound("成交记录不存在");
        }
        if (!actor.getId().equals(order.getBuyerId()) && !actor.getId().equals(order.getSellerId())) {
            throw BizException.permission("仅限本人参与的成交可撤销");
        }
        if (OrderStatus.CANCELLED.equals(order.getStatus())) {
            throw BizException.state("该成交已撤销");
        }
        long reviewCount = reviewMapper.selectCount(Wrappers.<Review>lambdaQuery()
                .eq(Review::getOrderId, orderId).isNull(Review::getDeletedAt));
        if (reviewCount > 0) {
            throw BizException.state("评价已提交，成交不可撤销");
        }
        Product product = productMapper.selectById(order.getProductId());
        if (product == null || !ProductStatus.SOLD.equals(product.getStatus())) {
            throw BizException.state("该成交对应商品当前不处于「已售出」，无法撤销");
        }

        LocalDateTime now = timeProvider.now();
        int changed = orderMapper.update(null, Wrappers.<TradeOrder>lambdaUpdate()
                .eq(TradeOrder::getId, orderId)
                .eq(TradeOrder::getStatus, OrderStatus.VALID)
                .set(TradeOrder::getStatus, OrderStatus.CANCELLED)
                .set(TradeOrder::getCancelInitiatorId, actor.getId())
                .set(TradeOrder::getCancelReason, reasonV.length() > 200 ? reasonV.substring(0, 200) : reasonV)
                .set(TradeOrder::getCancelledAt, now)
                .set(TradeOrder::getCancelJudgement, CancelJudgement.PENDING)
                .set(TradeOrder::getJudgementAt, null)
                .set(TradeOrder::getUpdatedAt, now));
        if (changed == 0) {
            throw BizException.state("该成交已撤销");
        }

        Student seller = studentMapper.selectById(order.getSellerId());
        boolean sellerBanned = seller != null && AccountStatus.BANNED.equals(seller.getAccountStatus());
        boolean backToOnSale;
        if (sellerBanned) {
            // ST-11：撤销时卖家已封禁 → 转「已下架（撤销后不可交易）」
            productMapper.update(null, Wrappers.<Product>lambdaUpdate()
                    .eq(Product::getId, product.getId())
                    .set(Product::getStatus, ProductStatus.OFF_SHELF)
                    .set(Product::getOffShelfReason, OffShelfReason.CANCEL_NO_TRADE)
                    .set(Product::getReviewNote, "撤销成交时卖家账号已封禁（ST-11）")
                    .set(Product::getUpdatedAt, now));
            backToOnSale = false;
        } else {
            productMapper.update(null, Wrappers.<Product>lambdaUpdate()
                    .eq(Product::getId, product.getId())
                    .set(Product::getStatus, ProductStatus.ON_SALE)
                    .set(Product::getOffShelfReason, null)
                    .set(Product::getUpdatedAt, now));
            backToOnSale = true;
        }

        Long peerId = actor.getId().equals(order.getBuyerId()) ? order.getSellerId() : order.getBuyerId();
        notificationService.notifyStudent(peerId, NotifyType.DEAL, "对方已撤销这笔成交",
                "对方撤销了《" + product.getTitle() + "》的这笔成交（原因：" + reasonV
                        + "）。你可选择「同意免责」或「计其违约」；7 天内未处理默认计违约。",
                "order", orderId, product.getId(), actor.getId());
        notificationService.notifyStudent(actor.getId(), NotifyType.DEAL, "撤销已生效",
                backToOnSale
                        ? "《" + product.getTitle() + "》的成交已撤销，商品已回到「在售」。等待对方在 7 天内判定是否计你违约。"
                        : "《" + product.getTitle() + "》的成交已撤销。因卖家账号已封禁，商品转为「已下架（撤销后不可交易）」（ST-11）。",
                "order", orderId, product.getId(), peerId);
        if (backToOnSale) {
            notifyFavoriters(product.getId(), product.getTitle());
        }
        auditService.allowed(user, roleOf(actor), "order.cancel", "order", orderId,
                "reason=" + reasonV + ", backToOnSale=" + backToOnSale);
        return detail(user, orderId);
    }

    /* -------------------------------------- UC-31 第 5 步 / BR-14 ④ 免责判定 */
    @Transactional
    public Views.OrderVo judge(AuthUser user, Long orderId, String judgement) {
        Student actor = permissionService.requireCertifiedStudent(user);
        if (!CancelJudgement.EXEMPT.equals(judgement) && !CancelJudgement.BREACH.equals(judgement)) {
            throw BizException.validate("判定结论只能是「已免责」或「计违约」");
        }

        TradeOrder order = orderMapper.selectById(orderId);
        if (order == null) {
            throw BizException.notFound("成交记录不存在");
        }
        if (!actor.getId().equals(order.getBuyerId()) && !actor.getId().equals(order.getSellerId())) {
            throw BizException.permission("仅成交双方可作免责判定");
        }
        if (!OrderStatus.CANCELLED.equals(order.getStatus())) {
            throw BizException.state("该成交未撤销，无需判定");
        }
        if (actor.getId().equals(order.getCancelInitiatorId())) {
            throw BizException.permission("撤销方不能判定自己是否违约");
        }
        if (!CancelJudgement.PENDING.equals(order.getCancelJudgement())) {
            throw BizException.state("该撤销已完成判定");
        }

        LocalDateTime deadline = order.getCancelledAt()
                .plusHours(props.getDeadlines().getCancelJudgementHours());
        boolean overdue = !timeProvider.now().isBefore(deadline);
        String finalJudgement = overdue ? CancelJudgement.BREACH : judgement;
        LocalDateTime now = timeProvider.now();

        // 与定时任务的超时判定竞态：以「待判定」为条件，先落库者为准
        int changed = orderMapper.update(null, Wrappers.<TradeOrder>lambdaUpdate()
                .eq(TradeOrder::getId, orderId)
                .eq(TradeOrder::getCancelJudgement, CancelJudgement.PENDING)
                .set(TradeOrder::getCancelJudgement, finalJudgement)
                .set(TradeOrder::getJudgementAt, now)
                .set(TradeOrder::getUpdatedAt, now));
        if (changed == 0) {
            throw BizException.state("该撤销已完成判定");
        }

        if (CancelJudgement.BREACH.equals(finalJudgement)) {
            creditService.apply(order.getCancelInitiatorId(), props.getCredit().getCancelPenalty(),
                    CreditEvent.CANCEL_BREACH,
                    overdue ? "撤销成交后 7 天内对方未作判定，系统自动计违约" : "撤销成交被判「计违约」",
                    "cancel:" + orderId, orderId);
        }
        notificationService.notifyStudent(order.getCancelInitiatorId(), NotifyType.DEAL,
                "撤销免责判定结果：" + finalJudgement,
                CancelJudgement.BREACH.equals(finalJudgement)
                        ? "对方判定本次撤销为违约（或已超时自动判定），你的信用分 " + props.getCredit().getCancelPenalty() + "。"
                        : "对方已同意免责，本次撤销不计违约，不扣分。",
                "order", orderId, order.getProductId(), null);
        notificationService.notifyStudent(actor.getId(), NotifyType.DEAL, "免责判定已提交",
                "你已对这笔撤销作出判定：" + finalJudgement + "。判定结果不影响已完成撤销的商品状态。",
                "order", orderId, order.getProductId(), null);
        auditService.allowed(user, roleOf(actor), "order.judgeCancel", "order", orderId,
                "judgement=" + finalJudgement + ", overdue=" + overdue);
        return detail(user, orderId);
    }

    /* ------------------------------------------------------------- 内部方法 */

    private void notifyFavoriters(Long productId, String title) {
        List<Long> ids = favoriteMapper.selectList(Wrappers.<Favorite>lambdaQuery()
                        .eq(Favorite::getProductId, productId))
                .stream().map(Favorite::getStudentId).toList();
        notificationService.notifyFavoriters(ids, "你收藏的商品重新在售",
                "商品《" + title + "》已重新回到「在售」，可以下单了。", productId);
    }

    private Views.OrderVo toVo(TradeOrder o, AuthUser user) {
        Product product = productMapper.selectById(o.getProductId());
        Student buyer = studentMapper.selectById(o.getBuyerId());
        Student seller = studentMapper.selectById(o.getSellerId());
        boolean isBuyer = user != null && user.isStudent() && user.subjectId().equals(o.getBuyerId());
        boolean isSeller = user != null && user.isStudent() && user.subjectId().equals(o.getSellerId());

        List<Review> reviews = reviewMapper.selectList(Wrappers.<Review>lambdaQuery()
                .eq(Review::getOrderId, o.getId()).isNull(Review::getDeletedAt));
        boolean myReviewed = reviews.stream().anyMatch(r -> user != null && r.getReviewerId().equals(user.subjectId()));
        Long peerId = isBuyer ? o.getSellerId() : isSeller ? o.getBuyerId() : null;
        boolean peerReviewed = peerId != null && reviews.stream().anyMatch(r -> r.getReviewerId().equals(peerId));

        LocalDateTime reviewDeadline = o.getCreatedAt() == null ? null
                : o.getCreatedAt().plusHours(props.getDeadlines().getReviewWindowHours());
        boolean canReview = (isBuyer || isSeller)
                && OrderStatus.VALID.equals(o.getStatus())
                && !myReviewed
                && reviewDeadline != null && timeProvider.now().isBefore(reviewDeadline);

        LocalDateTime judgeDeadline = o.getCancelledAt() == null ? null
                : o.getCancelledAt().plusHours(props.getDeadlines().getCancelJudgementHours());
        boolean canCancel = (isBuyer || isSeller)
                && OrderStatus.VALID.equals(o.getStatus())
                && reviews.isEmpty()
                && product != null && ProductStatus.SOLD.equals(product.getStatus());
        boolean canJudge = (isBuyer || isSeller)
                && OrderStatus.CANCELLED.equals(o.getStatus())
                && CancelJudgement.PENDING.equals(o.getCancelJudgement())
                && !o.getCancelInitiatorId().equals(user == null ? null : user.subjectId())
                && judgeDeadline != null && timeProvider.now().isBefore(judgeDeadline);

        Student peer = peerId == null ? null : studentMapper.selectById(peerId);
        String remaining = null;
        if (judgeDeadline != null && timeProvider.now().isBefore(judgeDeadline)) {
            Duration d = Duration.between(timeProvider.now(), judgeDeadline);
            remaining = d.toDays() + " 天 " + (d.toHoursPart()) + " 小时";
        }

        return new Views.OrderVo(o.getId(), o.getProductId(),
                product == null ? "（商品已删除）" : product.getTitle(),
                product == null ? null : product.getStatus(),
                BigDecimal.valueOf(o.getAmountCents(), 2).toPlainString(),
                o.getStatus(), o.getCreatedAt(), o.getDeliveryDeadline(), o.getBuyerId(), o.getSellerId(),
                Views.PublicStudentVo.of(buyer), Views.PublicStudentVo.of(seller),
                isBuyer ? "buyer" : isSeller ? "seller" : "admin",
                peerId, peer == null ? null : peer.getNickname(),
                o.getCancelInitiatorId(), o.getCancelReason(), o.getCancelledAt(),
                o.getCancelJudgement(), o.getJudgementAt(),
                canReview, canCancel, canJudge, reviewDeadline, judgeDeadline, remaining,
                myReviewed, peerReviewed);
    }

    private String roleOf(Student s) {
        return CertStatus.CERTIFIED.equals(s.getCertStatus()) ? "已认证学生" : "未认证学生";
    }
}
