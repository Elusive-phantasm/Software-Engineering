package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.entity.Favorite;
import com.campus.trade.entity.Product;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.FavoriteMapper;
import com.campus.trade.mapper.ProductMapper;
import com.campus.trade.mapper.ProductImageMapper;
import com.campus.trade.entity.ProductImage;
import com.campus.trade.constant.ProductStatus;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.TimeProvider;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/**
 * 收藏：UC-09。规则 BR-11：组合唯一、上限 100 件、不锁定商品、状态变化不级联删除。
 */
@Service
@RequiredArgsConstructor
public class FavoriteService {

    private final FavoriteMapper favoriteMapper;
    private final ProductMapper productMapper;
    private final ProductImageMapper imageMapper;
    private final PermissionService permissionService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    @Transactional
    public void add(AuthUser user, Long productId) {
        Student s = permissionService.currentStudent(user);
        Product p = productMapper.selectById(productId);
        if (p == null || p.getDeletedAt() != null) {
            throw BizException.notFound("该商品已不存在");
        }
        Favorite exists = favoriteMapper.selectOne(Wrappers.<Favorite>lambdaQuery()
                .eq(Favorite::getStudentId, s.getId())
                .eq(Favorite::getProductId, productId));
        if (exists != null) {
            throw BizException.state("已收藏");
        }
        long count = favoriteMapper.selectCount(Wrappers.<Favorite>lambdaQuery()
                .eq(Favorite::getStudentId, s.getId()));
        if (count >= props.getLimits().getFavoriteLimit()) {
            throw BizException.state("收藏夹已满（上限 " + props.getLimits().getFavoriteLimit() + " 件），请先清理");
        }
        Favorite favorite = new Favorite();
        favorite.setStudentId(s.getId());
        favorite.setProductId(productId);
        favorite.setCreatedAt(timeProvider.now());
        favoriteMapper.insert(favorite);
        auditService.allowed(user, "学生", "favorite.add", "product", productId, null);
    }

    @Transactional
    public void remove(AuthUser user, Long productId) {
        Student s = permissionService.currentStudent(user);
        favoriteMapper.delete(Wrappers.<Favorite>lambdaQuery()
                .eq(Favorite::getStudentId, s.getId())
                .eq(Favorite::getProductId, productId));
        auditService.allowed(user, "学生", "favorite.remove", "product", productId, null);
    }

    public List<Views.FavoriteItemVo> mine(AuthUser user) {
        Student s = permissionService.currentStudent(user);
        List<Favorite> favorites = favoriteMapper.selectList(Wrappers.<Favorite>lambdaQuery()
                .eq(Favorite::getStudentId, s.getId())
                .orderByDesc(Favorite::getCreatedAt));
        return favorites.stream().map(f -> {
            Product p = productMapper.selectById(f.getProductId());
            if (p == null) {
                return new Views.FavoriteItemVo(f.getProductId(), "（商品已删除）", "0.00", null,
                        null, true, "已失效", null, f.getCreatedAt());
            }
            boolean invalid = p.getDeletedAt() != null || !ProductStatus.ON_SALE.equals(p.getStatus());
            String cover = imageMapper.selectList(Wrappers.<ProductImage>lambdaQuery()
                            .eq(ProductImage::getProductId, p.getId())
                            .orderByAsc(ProductImage::getSeq).last("LIMIT 1"))
                    .stream().findFirst().map(ProductImage::getPath).orElse(null);
            return new Views.FavoriteItemVo(p.getId(), p.getTitle(),
                    BigDecimal.valueOf(p.getPriceCents(), 2).toPlainString(), p.getItemCondition(),
                    p.getStatus(), invalid, invalid ? "已失效" : null, cover, f.getCreatedAt());
        }).toList();
    }
}
