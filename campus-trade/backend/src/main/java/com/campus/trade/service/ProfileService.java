package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.AccountStatus;
import com.campus.trade.constant.CertStatus;
import com.campus.trade.constant.ProductStatus;
import com.campus.trade.entity.Product;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.ProductImageMapper;
import com.campus.trade.mapper.ProductMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.security.AuthUser;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 个人主页：UC-33。
 * 公开字段以 §6.5 为准：昵称、认证标识、信用分、评价数、被核实争议数、在售商品、已公开评价公开；
 * 真实姓名、手机号、宿舍地址、成交记录、举报明细不公开。
 */
@Service
@RequiredArgsConstructor
public class ProfileService {

    private final StudentMapper studentMapper;
    private final ProductMapper productMapper;
    private final ProductImageMapper imageMapper;
    private final ReviewService reviewService;
    private final AppProperties props;

    public Views.ProfileVo view(AuthUser actor, Long studentId) {
        if (actor == null) {
            // UC-33 辅事件流 C：游客不可查看他人主页
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "请先登录后查看用户主页");
        }
        Student s = studentMapper.selectById(studentId);
        if (s == null) {
            throw BizException.notFound("该用户不存在");
        }
        boolean self = actor.isStudent() && actor.subjectId().equals(studentId);
        boolean admin = actor.isAdmin();
        boolean banned = AccountStatus.BANNED.equals(s.getAccountStatus());

        // 封禁账号主页仍可访问，但隐藏其在售商品（BR-10 已连带下架）
        List<Product> onSale = banned ? List.of() : productMapper.selectList(Wrappers.<Product>lambdaQuery()
                .eq(Product::getSellerId, studentId)
                .eq(Product::getStatus, ProductStatus.ON_SALE)
                .isNull(Product::getDeletedAt)
                .orderByDesc(Product::getPublishedAt));

        List<Views.ProductVo> products = onSale.stream().map(p -> new Views.ProductVo(
                p.getId(), p.getTitle(), p.getDescription(),
                BigDecimal.valueOf(p.getPriceCents(), 2).toPlainString(), p.getPriceCents(),
                p.getItemCondition(), p.getStatus(), p.getOffShelfReason(), null,
                p.getCategoryId(), null, p.getSellerId(), null,
                imageMapper.selectList(Wrappers.<com.campus.trade.entity.ProductImage>lambdaQuery()
                                .eq(com.campus.trade.entity.ProductImage::getProductId, p.getId())
                                .orderByAsc(com.campus.trade.entity.ProductImage::getSeq))
                        .stream().map(com.campus.trade.entity.ProductImage::getPath).toList(),
                p.getPublishedAt(), null, p.getViewCount(), null, null, false,
                false, false, false, false, false)).toList();

        Map<String, Object> selfExtra = null;
        if (self) {
            selfExtra = new LinkedHashMap<>();
            selfExtra.put("email", s.getEmail());
            selfExtra.put("phone", s.getPhone());
            selfExtra.put("dorm", s.getDorm());
            selfExtra.put("realName", s.getRealName());
            selfExtra.put("studentNo", s.getStudentNo());
            selfExtra.put("resubmitCount", s.getResubmitCount());
            selfExtra.put("entries", List.of("我的商品", "我的订单", "我的收藏", "我的私信", "我的举报", "信用分"));
        }

        // 管理员可见的认证资料（手机号/宿舍走「学生详情」并记审计）
        Map<String, Object> adminExtra = null;
        if (admin && !self) {
            adminExtra = new LinkedHashMap<>();
            adminExtra.put("realName", s.getRealName());
            adminExtra.put("email", s.getEmail());
            adminExtra.put("studentNo", s.getStudentNo());
            adminExtra.put("resubmitCount", s.getResubmitCount());
        }

        return new Views.ProfileVo(Views.PublicStudentVo.of(s),
                CertStatus.CERTIFIED.equals(s.getCertStatus()) ? "已认证" : "未认证",
                banned, products.size(), products, reviewService.publicReceived(studentId),
                self, selfExtra, adminExtra);
    }
}
