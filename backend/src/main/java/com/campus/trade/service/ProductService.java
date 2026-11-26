package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.common.PageResult;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.*;
import com.campus.trade.dto.ProductDtos;
import com.campus.trade.entity.*;
import com.campus.trade.mapper.*;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.ContentFilter;
import com.campus.trade.util.TimeProvider;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 商品：UC-05 发布、UC-06 审核、UC-07 搜索、UC-08 分类浏览、UC-11 下架/撤回/删除、
 * UC-17 我的商品、UC-32 编辑。
 * 状态机：ST-01～ST-04、ST-06～ST-09、ST-12（§7.4.1）；规则：BR-01/02/03/04/05/09/11/13/15/22。
 */
@Service
@RequiredArgsConstructor
public class ProductService {

    private static final Set<String> CONDITIONS = Set.of("全新", "九成新", "七成新", "其他");
    private static final Set<String> RESUBMITTABLE = Set.of(OffShelfReason.REJECTED, OffShelfReason.SELLER_WITHDRAW);

    private final ProductMapper productMapper;
    private final ProductImageMapper imageMapper;
    private final CategoryMapper categoryMapper;
    private final StudentMapper studentMapper;
    private final FavoriteMapper favoriteMapper;
    private final NotificationService notificationService;
    private final PermissionService permissionService;
    private final StorageService storageService;
    private final CreditService creditService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    /* ------------------------------------------------------------ UC-05 发布 */
    @Transactional
    public Views.ProductVo create(AuthUser user, ProductDtos.SaveRequest req) {
        Student seller = permissionService.requirePublishRights(user);
        long onSale = productMapper.selectCount(Wrappers.<Product>lambdaQuery()
                .eq(Product::getSellerId, seller.getId())
                .eq(Product::getStatus, ProductStatus.ON_SALE)
                .isNull(Product::getDeletedAt));
        if (onSale >= props.getLimits().getMaxOnSalePerStudent()) {
            throw BizException.state("在售商品已达 " + props.getLimits().getMaxOnSalePerStudent() + " 件，请先售出或下架");
        }
        Normalized n = normalize(req);
        List<String> images = req.images() == null ? List.of() : req.images();
        if (images.size() < props.getLimits().getImagesMin()) {
            throw BizException.validate("请至少上传 1 张图片");
        }
        if (images.size() > props.getLimits().getImagesMax()) {
            throw BizException.validate("图片最多 9 张");
        }

        Product p = new Product();
        p.setTitle(n.title());
        p.setDescription(n.description());
        p.setPriceCents(n.priceCents());
        p.setItemCondition(n.condition());
        p.setCategoryId(n.categoryId());
        p.setSellerId(seller.getId());
        p.setStatus(ProductStatus.PENDING);
        p.setPublishedAt(timeProvider.now());
        p.setViewCount(0);
        p.setCreatedAt(timeProvider.now());
        p.setUpdatedAt(timeProvider.now());
        productMapper.insert(p);

        saveImages(p.getId(), images);
        auditService.allowed(user, roleOf(seller), "product.publish", "product", p.getId(), null);
        return detail(user, p.getId(), false);
    }

    /* ------------------------------------------------- UC-32 / ST-12 编辑 */
    @Transactional
    public Views.ProductVo update(AuthUser user, Long id, ProductDtos.SaveRequest req) {
        Student seller = permissionService.requireCertifiedStudent(user);
        Product p = loadVisible(id);
        permissionService.assertOwner(p.getSellerId(), seller, "仅限本人发布的商品");

        if (ProductStatus.SOLD.equals(p.getStatus())) {
            throw BizException.state("已售出商品不可修改");
        }
        if (ProductStatus.OFF_SHELF.equals(p.getStatus())) {
            throw BizException.state("该商品已下架，请使用「修改后重新提交」走重新审核（ST-08）");
        }
        if (!ProductStatus.PENDING.equals(p.getStatus()) && !ProductStatus.ON_SALE.equals(p.getStatus())) {
            throw BizException.state("当前业务状态不支持该操作");
        }

        Normalized n = normalize(req);
        String fromStatus = p.getStatus();
        java.time.LocalDateTime now = timeProvider.now();
        // 用显式 update wrapper：MyBatis-Plus 的 updateById 会跳过 null 字段，
        // 而「已下架 → 待审核」必须把下架原因等字段真正置空，否则违反 CHECK 约束。
        productMapper.update(null, Wrappers.<Product>lambdaUpdate()
                .eq(Product::getId, id)
                .set(Product::getTitle, n.title())
                .set(Product::getDescription, n.description())
                .set(Product::getPriceCents, n.priceCents())
                .set(Product::getItemCondition, n.condition())
                .set(Product::getCategoryId, n.categoryId())
                .set(Product::getStatus, ProductStatus.PENDING)
                .set(Product::getOffShelfReason, null)
                .set(Product::getReviewNote, null)
                .set(Product::getReviewedBy, null)
                .set(Product::getReviewedAt, null)
                .set(Product::getPublishedAt, now)
                .set(Product::getUpdatedAt, now));

        if (req.images() != null && !req.images().isEmpty()) {
            if (req.images().size() > props.getLimits().getImagesMax()) {
                throw BizException.validate("图片最多 9 张");
            }
            imageMapper.delete(Wrappers.<ProductImage>lambdaQuery().eq(ProductImage::getProductId, id));
            saveImages(id, req.images());
        }

        notificationService.notifyStudent(seller.getId(), NotifyType.PRODUCT_REVIEW, "修改已提交，等待重新审核",
                "商品《" + p.getTitle() + "》的修改已提交，需重新审核通过后才对外展示。", "product", id, id, null);
        if (ProductStatus.ON_SALE.equals(fromStatus)) {
            notifyFavoriters(id, "你收藏的商品已修改，等待重新审核",
                    "商品《" + p.getTitle() + "》的卖家修改了内容，需重新审核通过后才对外展示。");
        }
        auditService.allowed(user, roleOf(seller), "product.edit", "product", id, fromStatus + "->待审核");
        return detail(user, id, false);
    }

    /* --------------------------------------------------- ST-04 卖家撤回 */
    @Transactional
    public Views.ProductVo withdraw(AuthUser user, Long id) {
        Student seller = permissionService.currentStudent(user);
        Product p = loadVisible(id);
        permissionService.assertOwner(p.getSellerId(), seller, "仅限本人发布的商品");
        if (ProductStatus.SOLD.equals(p.getStatus())) {
            throw BizException.state("该商品已售出，不可下架或删除");
        }
        if (!ProductStatus.PENDING.equals(p.getStatus())) {
            throw BizException.state("仅「待审核」商品可撤回");
        }
        p.setStatus(ProductStatus.OFF_SHELF);
        p.setOffShelfReason(OffShelfReason.SELLER_WITHDRAW);
        p.setUpdatedAt(timeProvider.now());
        productMapper.updateById(p);
        auditService.allowed(user, roleOf(seller), "product.withdraw", "product", id, null);
        return detail(user, id, false);
    }

    /* --------------------------------------------------- ST-06 卖家下架 */
    @Transactional
    public Views.ProductVo takeDown(AuthUser user, Long id) {
        Student seller = permissionService.currentStudent(user);
        Product p = loadVisible(id);
        permissionService.assertOwner(p.getSellerId(), seller, "仅限本人发布的商品");
        if (ProductStatus.SOLD.equals(p.getStatus())) {
            throw BizException.state("该商品已售出，不可下架或删除");
        }
        if (ProductStatus.OFF_SHELF.equals(p.getStatus())) {
            if (OffShelfReason.ADMIN_OFF.equals(p.getOffShelfReason())) {
                throw BizException.permission("该商品已被管理员下架，卖家不能再操作");
            }
            throw BizException.state("该商品已下架");
        }
        if (ProductStatus.PENDING.equals(p.getStatus())) {
            throw BizException.state("「待审核」商品只能撤回，不能下架（UC-11 辅事件流 D）");
        }
        p.setStatus(ProductStatus.OFF_SHELF);
        p.setOffShelfReason(OffShelfReason.SELLER_OFF);
        p.setUpdatedAt(timeProvider.now());
        productMapper.updateById(p);
        notifyFavoriters(id, "你收藏的商品已下架", "卖家下架了商品《" + p.getTitle() + "》，该收藏已标记为「已失效」。");
        auditService.allowed(user, roleOf(seller), "product.takeDown", "product", id, null);
        return detail(user, id, false);
    }

    /* ------------------------------------------------------ BR-09 永久删除 */
    @Transactional
    public void delete(AuthUser user, Long id) {
        Student seller = permissionService.currentStudent(user);
        Product p = loadVisible(id);
        permissionService.assertOwner(p.getSellerId(), seller, "仅限本人发布的商品");
        if (ProductStatus.SOLD.equals(p.getStatus())) {
            throw BizException.state("该商品已售出，不可下架或删除");
        }
        if (ProductStatus.ON_SALE.equals(p.getStatus())) {
            throw BizException.state("请先下架再删除");
        }
        if (ProductStatus.PENDING.equals(p.getStatus())) {
            throw BizException.state("「待审核」商品只能撤回，不能删除");
        }
        if (!ProductStatus.OFF_SHELF.equals(p.getStatus())) {
            throw BizException.state("当前业务状态不支持该操作");
        }
        if (OffShelfReason.ADMIN_OFF.equals(p.getOffShelfReason())) {
            throw BizException.permission("该商品已被管理员下架，卖家不能再操作");
        }
        // 软删除：从所有列表排除、不可恢复；历史成交与收藏记录保留
        p.setDeletedAt(timeProvider.now());
        p.setUpdatedAt(timeProvider.now());
        productMapper.updateById(p);
        auditService.allowed(user, roleOf(seller), "product.delete", "product", id, null);
    }

    /* --------------------------------------------------- ST-08 重新提交 */
    @Transactional
    public Views.ProductVo resubmit(AuthUser user, Long id, ProductDtos.SaveRequest req) {
        Student seller = permissionService.currentStudent(user);
        Product p = loadVisible(id);
        permissionService.assertOwner(p.getSellerId(), seller, "仅限本人发布的商品");
        if (!ProductStatus.OFF_SHELF.equals(p.getStatus())) {
            throw BizException.state("仅「已下架」商品可重新提交");
        }
        if (OffShelfReason.ADMIN_OFF.equals(p.getOffShelfReason())) {
            throw BizException.state("该商品因违规被管理员下架，请先在站内私信中联系管理员复核（UC-13 辅事件流 C）");
        }
        if (OffShelfReason.CANCEL_NO_TRADE.equals(p.getOffShelfReason())) {
            throw BizException.state("该商品因卖家账号封禁而不可交易，须先由管理员解除封禁");
        }
        if (!RESUBMITTABLE.contains(p.getOffShelfReason())) {
            throw BizException.state("当前下架原因不支持重新提交");
        }
        long onSale = productMapper.selectCount(Wrappers.<Product>lambdaQuery()
                .eq(Product::getSellerId, seller.getId())
                .eq(Product::getStatus, ProductStatus.ON_SALE)
                .isNull(Product::getDeletedAt));
        if (onSale >= props.getLimits().getMaxOnSalePerStudent()) {
            throw BizException.state("在售商品已达上限，请先售出或下架");
        }

        if (req != null && req.title() != null && !req.title().isBlank()) {
            Normalized n = normalize(req);
            productMapper.update(null, Wrappers.<Product>lambdaUpdate()
                    .eq(Product::getId, id)
                    .set(Product::getTitle, n.title())
                    .set(Product::getDescription, n.description())
                    .set(Product::getPriceCents, n.priceCents())
                    .set(Product::getItemCondition, n.condition())
                    .set(Product::getCategoryId, n.categoryId()));
            p.setTitle(n.title());
            if (req.images() != null && !req.images().isEmpty()) {
                imageMapper.delete(Wrappers.<ProductImage>lambdaQuery().eq(ProductImage::getProductId, id));
                saveImages(id, req.images());
            }
        }
        java.time.LocalDateTime now = timeProvider.now();
        productMapper.update(null, Wrappers.<Product>lambdaUpdate()
                .eq(Product::getId, id)
                .set(Product::getStatus, ProductStatus.PENDING)
                .set(Product::getOffShelfReason, null)
                .set(Product::getReviewNote, null)
                .set(Product::getReviewedBy, null)
                .set(Product::getReviewedAt, null)
                .set(Product::getPublishedAt, now)
                .set(Product::getUpdatedAt, now));
        auditService.allowed(user, roleOf(seller), "product.resubmit", "product", id, null);
        return detail(user, id, false);
    }

    /* ---------------------------------------------------- UC-07/08 浏览与搜索 */
    public PageResult<Views.ProductVo> list(AuthUser user, Map<String, String> query) {
        int page = parseInt(query.get("page"), 1);
        int pageSize = Math.min(60, Math.max(1, parseInt(query.get("pageSize"), 12)));
        var wrapper = Wrappers.<Product>lambdaQuery()
                .eq(Product::getStatus, ProductStatus.ON_SALE)
                .isNull(Product::getDeletedAt);

        String keyword = trimToNull(query.get("keyword"));
        if (keyword != null) {
            wrapper.and(w -> w.like(Product::getTitle, keyword).or().like(Product::getDescription, keyword));
        }
        Long categoryId = parseLong(query.get("categoryId"));
        if (categoryId != null) {
            wrapper.eq(Product::getCategoryId, categoryId);
        }
        String condition = trimToNull(query.get("condition"));
        if (condition != null && CONDITIONS.contains(condition)) {
            wrapper.eq(Product::getItemCondition, condition);
        }
        Long minPrice = parseYuanToCents(query.get("minPrice"));
        if (minPrice != null) {
            wrapper.ge(Product::getPriceCents, minPrice);
        }
        Long maxPrice = parseYuanToCents(query.get("maxPrice"));
        if (maxPrice != null) {
            wrapper.le(Product::getPriceCents, maxPrice);
        }

        String sort = query.getOrDefault("sort", "latest");
        switch (sort) {
            case "priceAsc" -> wrapper.orderByAsc(Product::getPriceCents);
            case "priceDesc" -> wrapper.orderByDesc(Product::getPriceCents);
            case "hot" -> wrapper.orderByDesc(Product::getViewCount);
            default -> wrapper.orderByDesc(Product::getPublishedAt);
        }

        Page<Product> result = productMapper.selectPage(new Page<>(page, pageSize), wrapper);
        List<Views.ProductVo> items = result.getRecords().stream().map(p -> toVo(p, user, false)).toList();
        return PageResult.of(items, result.getTotal(), page, pageSize);
    }

    public Views.ProductVo detail(AuthUser user, Long id, boolean countView) {
        Product p = productMapper.selectById(id);
        if (p == null || p.getDeletedAt() != null) {
            throw BizException.notFound("该商品已不存在");
        }
        boolean owner = user != null && user.isStudent() && user.subjectId().equals(p.getSellerId());
        boolean admin = user != null && user.isAdmin();
        boolean publicVisible = ProductStatus.ON_SALE.equals(p.getStatus()) || ProductStatus.SOLD.equals(p.getStatus());
        if (!publicVisible && !owner && !admin) {
            throw BizException.notFound("该商品已不存在");
        }
        if (countView && !owner) {
            p.setViewCount((p.getViewCount() == null ? 0 : p.getViewCount()) + 1);
            productMapper.updateById(p);
        }
        return toVo(p, user, admin);
    }

    public List<Views.CategoryVo> categories() {
        List<Category> cats = categoryMapper.selectList(Wrappers.<Category>lambdaQuery()
                .eq(Category::getActive, 1).orderByAsc(Category::getSort));
        List<Product> onSale = productMapper.selectList(Wrappers.<Product>lambdaQuery()
                .eq(Product::getStatus, ProductStatus.ON_SALE).isNull(Product::getDeletedAt));
        Map<Long, Long> counts = onSale.stream()
                .collect(Collectors.groupingBy(Product::getCategoryId, Collectors.counting()));
        return cats.stream().map(c -> new Views.CategoryVo(c.getId(), c.getName(), c.getSort(),
                counts.getOrDefault(c.getId(), 0L))).toList();
    }

    /* --------------------------------------------------------- UC-17 我的商品 */
    public Views.MyProductsVo myProducts(AuthUser user) {
        Student seller = permissionService.currentStudent(user);
        List<Product> rows = productMapper.selectList(Wrappers.<Product>lambdaQuery()
                .eq(Product::getSellerId, seller.getId())
                .isNull(Product::getDeletedAt)
                .orderByDesc(Product::getPublishedAt));
        Map<String, List<Views.ProductVo>> groups = new LinkedHashMap<>();
        for (String status : List.of(ProductStatus.PENDING, ProductStatus.ON_SALE,
                ProductStatus.SOLD, ProductStatus.OFF_SHELF)) {
            groups.put(status, new ArrayList<>());
        }
        for (Product p : rows) {
            groups.computeIfAbsent(p.getStatus(), k -> new ArrayList<>()).add(toVo(p, user, false));
        }
        return new Views.MyProductsVo(rows.size(), groups);
    }

    /* ------------------------------------------------------------- UC-06 审核 */
    public List<Views.ProductVo> pendingProducts() {
        return productMapper.selectList(Wrappers.<Product>lambdaQuery()
                        .eq(Product::getStatus, ProductStatus.PENDING)
                        .isNull(Product::getDeletedAt)
                        .orderByAsc(Product::getPublishedAt))
                .stream().map(p -> toVo(p, null, true)).toList();
    }

    public List<Views.ProductVo> adminList(String status, String keyword) {
        var wrapper = Wrappers.<Product>lambdaQuery().isNull(Product::getDeletedAt);
        if (status != null && !status.isBlank()) {
            wrapper.eq(Product::getStatus, status);
        }
        if (keyword != null && !keyword.isBlank()) {
            wrapper.like(Product::getTitle, keyword);
        }
        wrapper.orderByDesc(Product::getPublishedAt).last("LIMIT 300");
        return productMapper.selectList(wrapper).stream().map(p -> toVo(p, null, true)).toList();
    }

    /** ST-02 审核通过 */
    @Transactional
    public void approve(AuthUser user, Long id) {
        Admin admin = permissionService.currentAdmin(user);
        Product p = loadVisible(id);
        if (!ProductStatus.PENDING.equals(p.getStatus())) {
            throw BizException.state("当前业务状态不支持该操作");
        }
        productMapper.update(null, Wrappers.<Product>lambdaUpdate()
                .eq(Product::getId, id)
                .set(Product::getStatus, ProductStatus.ON_SALE)
                .set(Product::getOffShelfReason, null)
                .set(Product::getReviewNote, "审核通过")
                .set(Product::getReviewedBy, admin.getId())
                .set(Product::getReviewedAt, timeProvider.now())
                .set(Product::getUpdatedAt, timeProvider.now()));

        notificationService.notifyStudent(p.getSellerId(), NotifyType.PRODUCT_REVIEW, "商品审核通过",
                "商品《" + p.getTitle() + "》已审核通过并上架。", "product", id, id, null);
        notifyFavoriters(id, "你收藏的商品已上架", "商品《" + p.getTitle() + "》已审核通过，可以下单了。");
        auditService.allowed(user, "管理员", "product.approve", "product", id, null);
    }

    /** ST-03 审核不通过。普通内容问题与禁售问题都可以驳回。 */
    @Transactional
    public void reject(AuthUser user, Long id, ProductDtos.RejectRequest req) {
        Admin admin = permissionService.currentAdmin(user);
        Product p = loadVisible(id);
        if (!ProductStatus.PENDING.equals(p.getStatus())) {
            throw BizException.state("当前业务状态不支持该操作");
        }
        String code = req.categoryCode() == null ? "" : req.categoryCode().trim().toUpperCase();
        String reason = req.reason() == null ? "" : req.reason().trim();
        if (reason.isEmpty()) {
            throw BizException.validate("请填写驳回原因");
        }
        String note = ForbiddenCategories.exists(code)
                ? code + " " + ForbiddenCategories.nameOf(code) + "：" + reason
                : reason;

        p.setStatus(ProductStatus.OFF_SHELF);
        p.setOffShelfReason(OffShelfReason.REJECTED);
        p.setReviewNote(truncate(note, 200));
        p.setReviewedBy(admin.getId());
        p.setReviewedAt(timeProvider.now());
        p.setUpdatedAt(timeProvider.now());
        productMapper.updateById(p);

        notificationService.notifyStudent(p.getSellerId(), NotifyType.PRODUCT_REVIEW, "商品审核不通过",
                "商品《" + p.getTitle() + "》未通过审核。原因：" + note + "。可删除违规内容后重新提交（ST-08）。",
                "product", id, id, null);
        auditService.allowed(user, "管理员", "product.reject", "product", id, note);
    }

    /** ST-07 管理员违规下架（同时按 BR-14 ② 扣 −10） */
    @Transactional
    public void forceOff(AuthUser user, Long id, ProductDtos.ForceOffRequest req) {
        Admin admin = permissionService.currentAdmin(user);
        Product p = loadVisible(id);
        if (!ProductStatus.ON_SALE.equals(p.getStatus()) && !ProductStatus.PENDING.equals(p.getStatus())) {
            throw BizException.state("仅「在售」或「待审核」商品可被强制下架（已售出商品任何角色不可下架）");
        }
        String reason = req.reason() == null ? "" : req.reason().trim();
        if (reason.isEmpty()) {
            throw BizException.validate("请填写处理理由");
        }
        String code = req.categoryCode() == null ? "" : req.categoryCode().trim().toUpperCase();
        if (!code.isEmpty() && !ForbiddenCategories.exists(code)) {
            throw BizException.validate("禁售类目编号不存在");
        }
        String note = ForbiddenCategories.exists(code)
                ? code + " " + ForbiddenCategories.nameOf(code) + "：" + reason
                : reason;

        p.setStatus(ProductStatus.OFF_SHELF);
        p.setOffShelfReason(OffShelfReason.ADMIN_OFF);
        p.setReviewNote(truncate(note, 200));
        p.setReviewedBy(admin.getId());
        p.setReviewedAt(timeProvider.now());
        p.setUpdatedAt(timeProvider.now());
        productMapper.updateById(p);

        if (!Boolean.FALSE.equals(req.deduct())) {
            creditService.apply(p.getSellerId(), props.getCredit().getViolationPenalty(), CreditEvent.VIOLATION,
                    "商品《" + p.getTitle() + "》被管理员强制下架（§4.3 " + code + "）：" + reason,
                    "violation:product:" + id + ":" + timeProvider.now(), null);
        }
        notificationService.notifyStudent(p.getSellerId(), NotifyType.DISPOSE, "商品被强制下架",
                "商品《" + p.getTitle() + "》因违规被管理员强制下架。原因：" + note
                        + "。如认为处置有误，可在该商品的站内私信向管理员提出异议。", "product", id, id, null);
        auditService.allowed(user, "管理员", "product.forceOff", "product", id, note);
    }

    /** ST-09 管理员撤销违规处置：已下架(管理员违规下架) → 在售，扣分不回滚 */
    @Transactional
    public void restore(AuthUser user, Long id, String reason) {
        Admin admin = permissionService.currentAdmin(user);
        Product p = loadVisible(id);
        if (!ProductStatus.OFF_SHELF.equals(p.getStatus())
                || !OffShelfReason.ADMIN_OFF.equals(p.getOffShelfReason())) {
            throw BizException.state("仅「已下架（管理员违规下架）」的商品可撤销处置");
        }
        String note = reason == null ? "" : reason.trim();
        if (note.isEmpty()) {
            throw BizException.validate("请填写撤销处置的理由");
        }
        productMapper.update(null, Wrappers.<Product>lambdaUpdate()
                .eq(Product::getId, id)
                .set(Product::getStatus, ProductStatus.ON_SALE)
                .set(Product::getOffShelfReason, null)
                .set(Product::getReviewNote, truncate("撤销处置：" + note, 200))
                .set(Product::getReviewedBy, admin.getId())
                .set(Product::getReviewedAt, timeProvider.now())
                .set(Product::getUpdatedAt, timeProvider.now()));

        notificationService.notifyStudent(p.getSellerId(), NotifyType.PRODUCT_REVIEW, "商品已恢复在售",
                "经复核，商品《" + p.getTitle() + "》的违规处置已撤销，商品重新上架（信用分不因复核而回滚）。",
                "product", id, id, null);
        notifyFavoriters(id, "你收藏的商品重新在售", "商品《" + p.getTitle() + "》已恢复在售，可以下单了。");
        auditService.allowed(user, "管理员", "product.restore", "product", id, note);
    }

    /* ---------------------------------------------------------------- 工具 */

    private Product loadVisible(Long id) {
        Product p = productMapper.selectById(id);
        if (p == null || p.getDeletedAt() != null) {
            throw BizException.notFound("该商品已不存在");
        }
        return p;
    }

    private record Normalized(String title, String description, int priceCents, String condition, Long categoryId) {
    }

    private Normalized normalize(ProductDtos.SaveRequest req) {
        String title = req.title() == null ? "" : req.title().trim();
        if (title.isEmpty()) {
            throw BizException.validate("请填写标题");
        }
        if (title.length() > props.getLimits().getTitleMax()) {
            throw BizException.validate("标题不得超过 " + props.getLimits().getTitleMax() + " 个字符");
        }
        if (ContentFilter.isOffsiteDiversion(title)) {
            throw BizException.validate("标题中不得包含站外联系方式或广告（站外导流）");
        }
        String desc = req.description() == null ? "" : req.description().trim();
        if (desc.isEmpty()) {
            throw BizException.validate("请填写描述");
        }
        if (desc.length() > props.getLimits().getDescMax()) {
            throw BizException.validate("描述不得超过 " + props.getLimits().getDescMax() + " 个字符");
        }
        if (ContentFilter.isOffsiteDiversion(desc)) {
            throw BizException.validate("描述中不得包含站外联系方式或广告（站外导流），请改为站内私信沟通");
        }
        if (req.condition() == null || !CONDITIONS.contains(req.condition().trim())) {
            throw BizException.validate("成色取值不合法（全新 / 九成新 / 七成新 / 其他）");
        }
        int priceCents = parsePrice(req.price());
        Category category = categoryMapper.selectById(req.categoryId());
        if (category == null || category.getActive() == null || category.getActive() != 1) {
            throw BizException.validate("分类不可用");
        }
        return new Normalized(title, desc, priceCents, req.condition().trim(), category.getId());
    }

    /** BR-05：大于 0 且不超过 50000 元，最多 2 位小数 */
    private int parsePrice(String price) {
        if (price == null || price.isBlank()) {
            throw BizException.validate("请填写价格");
        }
        BigDecimal value;
        try {
            value = new BigDecimal(price.trim());
        } catch (NumberFormatException e) {
            throw BizException.validate("价格须为合法数值");
        }
        if (value.scale() > 2) {
            throw BizException.validate("价格最多保留 2 位小数");
        }
        if (value.compareTo(BigDecimal.ZERO) <= 0) {
            throw BizException.validate("价格须大于 0");
        }
        if (value.compareTo(BigDecimal.valueOf(props.getLimits().getPriceMaxYuan())) > 0) {
            throw BizException.validate("价格不得超过 " + props.getLimits().getPriceMaxYuan() + " 元");
        }
        return value.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).intValueExact();
    }

    private void saveImages(Long productId, List<String> images) {
        int seq = 1;
        for (String img : images) {
            String path = storageService.saveDataUrl(img, "product");
            ProductImage entity = new ProductImage();
            entity.setProductId(productId);
            entity.setSeq(seq++);
            entity.setPath(path);
            imageMapper.insert(entity);
        }
    }

    private List<String> imagesOf(Long productId) {
        return imageMapper.selectList(Wrappers.<ProductImage>lambdaQuery()
                        .eq(ProductImage::getProductId, productId)
                        .orderByAsc(ProductImage::getSeq))
                .stream().map(ProductImage::getPath).toList();
    }

    private void notifyFavoriters(Long productId, String title, String content) {
        List<Long> ids = favoriteMapper.selectList(Wrappers.<Favorite>lambdaQuery()
                        .eq(Favorite::getProductId, productId))
                .stream().map(Favorite::getStudentId).toList();
        notificationService.notifyFavoriters(ids, title, content, productId);
    }

    private Views.ProductVo toVo(Product p, AuthUser user, boolean adminView) {
        Student seller = studentMapper.selectById(p.getSellerId());
        Category category = categoryMapper.selectById(p.getCategoryId());
        boolean owner = user != null && user.isStudent() && user.subjectId().equals(p.getSellerId());
        Boolean favorited = user != null && user.isStudent()
                && favoriteMapper.selectCount(Wrappers.<Favorite>lambdaQuery()
                .eq(Favorite::getStudentId, user.subjectId())
                .eq(Favorite::getProductId, p.getId())) > 0;
        long favoriteCount = favoriteMapper.selectCount(Wrappers.<Favorite>lambdaQuery()
                .eq(Favorite::getProductId, p.getId()));
        String price = BigDecimal.valueOf(p.getPriceCents(), 2).toPlainString();

        boolean canEdit = owner && (ProductStatus.PENDING.equals(p.getStatus()) || ProductStatus.ON_SALE.equals(p.getStatus()));
        boolean canWithdraw = owner && ProductStatus.PENDING.equals(p.getStatus());
        boolean canTakeDown = owner && ProductStatus.ON_SALE.equals(p.getStatus());
        boolean canDelete = owner && ProductStatus.OFF_SHELF.equals(p.getStatus())
                && !OffShelfReason.ADMIN_OFF.equals(p.getOffShelfReason());
        boolean canResubmit = owner && ProductStatus.OFF_SHELF.equals(p.getStatus())
                && RESUBMITTABLE.contains(p.getOffShelfReason());

        return new Views.ProductVo(p.getId(), p.getTitle(), p.getDescription(), price, p.getPriceCents(),
                p.getItemCondition(), p.getStatus(), p.getOffShelfReason(),
                adminView || owner ? p.getReviewNote() : null,
                p.getCategoryId(), category == null ? null : category.getName(),
                p.getSellerId(), Views.PublicStudentVo.of(seller), imagesOf(p.getId()),
                p.getPublishedAt(), p.getReviewedAt(), p.getViewCount(), favoriteCount, favorited, owner,
                canEdit, canWithdraw, canTakeDown, canDelete, canResubmit);
    }

    private String roleOf(Student s) {
        return CertStatus.CERTIFIED.equals(s.getCertStatus()) ? "已认证学生" : "未认证学生";
    }

    private int parseInt(String value, int fallback) {
        try {
            return value == null ? fallback : Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private Long parseLong(String value) {
        try {
            return value == null || value.isBlank() ? null : Long.parseLong(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Long parseYuanToCents(String value) {
        try {
            return value == null || value.isBlank() ? null
                    : new BigDecimal(value).movePointRight(2).longValueExact();
        } catch (Exception e) {
            return null;
        }
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String truncate(String text, int max) {
        return text == null ? null : (text.length() <= max ? text : text.substring(0, max));
    }
}
