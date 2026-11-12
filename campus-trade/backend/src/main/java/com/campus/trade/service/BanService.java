package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.constant.AccountStatus;
import com.campus.trade.constant.NotifyType;
import com.campus.trade.constant.OffShelfReason;
import com.campus.trade.constant.ProductStatus;
import com.campus.trade.entity.Product;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.ProductMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.util.TimeProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 账号封禁与连带处置（BR-10 / ST-13）。
 * 封禁必须在**同一处置动作**中把该卖家名下「在售」与「待审核」商品转为「已下架（管理员违规下架）」，
 * 不得只封禁不下架；「已售出」商品不受影响（BR-09）。
 * 认证状态不因封禁改变（BR-19）。
 */
@Service
@RequiredArgsConstructor
public class BanService {

    private final StudentMapper studentMapper;
    private final ProductMapper productMapper;
    private final NotificationService notificationService;
    private final TimeProvider timeProvider;

    @Transactional
    public int ban(Long studentId, Long adminId, String reason) {
        Student s = studentMapper.selectById(studentId);
        if (s == null) {
            return 0;
        }
        if (!AccountStatus.BANNED.equals(s.getAccountStatus())) {
            s.setAccountStatus(AccountStatus.BANNED);
            s.setUpdatedAt(timeProvider.now());
            studentMapper.updateById(s);
        }

        List<Product> affected = productMapper.selectList(Wrappers.<Product>lambdaQuery()
                .eq(Product::getSellerId, studentId)
                .in(Product::getStatus, ProductStatus.ON_SALE, ProductStatus.PENDING)
                .isNull(Product::getDeletedAt));

        for (Product p : affected) {
            p.setStatus(ProductStatus.OFF_SHELF);
            p.setOffShelfReason(OffShelfReason.ADMIN_OFF);
            p.setReviewNote("账号封禁联动下架（BR-10 / ST-13）");
            p.setReviewedBy(adminId);
            p.setReviewedAt(timeProvider.now());
            p.setUpdatedAt(timeProvider.now());
            productMapper.updateById(p);
            notificationService.notifyStudent(studentId, NotifyType.DISPOSE, "商品被联动下架",
                    "因账号被封禁，商品《" + p.getTitle() + "》已联动下架（BR-10）。", "product", p.getId(), p.getId(), null);
        }

        notificationService.notifyStudent(studentId, NotifyType.DISPOSE, "账号已被封禁",
                "你的账号已被封禁，名下 " + affected.size() + " 件在售与待审核商品已联动下架。封禁不改变认证状态（BR-19）。"
                        + (reason == null ? "" : "原因：" + reason),
                "student", studentId, null, null);
        return affected.size();
    }
}
