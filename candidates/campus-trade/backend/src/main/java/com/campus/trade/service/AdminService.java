package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.AccountStatus;
import com.campus.trade.constant.CertStatus;
import com.campus.trade.constant.CreditEvent;
import com.campus.trade.constant.NotifyType;
import com.campus.trade.constant.OffShelfReason;
import com.campus.trade.constant.OrderStatus;
import com.campus.trade.constant.ProductStatus;
import com.campus.trade.entity.AuditLog;
import com.campus.trade.entity.Product;
import com.campus.trade.entity.Student;
import com.campus.trade.entity.TradeOrder;
import com.campus.trade.mapper.AuditLogMapper;
import com.campus.trade.mapper.ProductMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.mapper.TradeOrderMapper;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.TimeProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理端：看板统计、学生管理、账号处置（BR-10 / ST-13）、信用分人工调整、审计检索。
 */
@Service
@RequiredArgsConstructor
public class AdminService {

    private final StudentMapper studentMapper;
    private final ProductMapper productMapper;
    private final TradeOrderMapper orderMapper;
    private final AuditLogMapper auditLogMapper;
    private final PermissionService permissionService;
    private final BanService banService;
    private final CreditService creditService;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    /* ------------------------------------------------------------ 看板统计 */
    public Map<String, Object> dashboard() {
        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, Object> students = new LinkedHashMap<>();
        students.put("total", studentMapper.selectCount(null));
        students.put("certified", studentMapper.selectCount(Wrappers.<Student>lambdaQuery()
                .eq(Student::getCertStatus, CertStatus.CERTIFIED)));
        students.put("pendingCert", studentMapper.selectCount(Wrappers.<Student>lambdaQuery()
                .eq(Student::getCertStatus, CertStatus.PENDING)));
        students.put("banned", studentMapper.selectCount(Wrappers.<Student>lambdaQuery()
                .eq(Student::getAccountStatus, AccountStatus.BANNED)));
        students.put("restricted", studentMapper.selectCount(Wrappers.<Student>lambdaQuery()
                .eq(Student::getAccountStatus, AccountStatus.RESTRICTED)));
        result.put("students", students);

        Map<String, Object> products = new LinkedHashMap<>();
        for (String status : List.of(ProductStatus.PENDING, ProductStatus.ON_SALE,
                ProductStatus.SOLD, ProductStatus.OFF_SHELF)) {
            products.put(status, productMapper.selectCount(Wrappers.<Product>lambdaQuery()
                    .eq(Product::getStatus, status).isNull(Product::getDeletedAt)));
        }
        result.put("products", products);

        long validOrders = orderMapper.selectCount(Wrappers.<TradeOrder>lambdaQuery()
                .eq(TradeOrder::getStatus, OrderStatus.VALID));
        long cancelledOrders = orderMapper.selectCount(Wrappers.<TradeOrder>lambdaQuery()
                .eq(TradeOrder::getStatus, OrderStatus.CANCELLED));
        Map<String, Object> orders = new LinkedHashMap<>();
        orders.put("valid", validOrders);
        orders.put("cancelled", cancelledOrders);
        result.put("orders", orders);
        return result;
    }

    /* ------------------------------------------------------------ 学生管理 */
    public List<Map<String, Object>> students(String keyword, String certStatus, String accountStatus) {
        var wrapper = Wrappers.<Student>lambdaQuery().orderByDesc(Student::getRegisteredAt).last("LIMIT 300");
        if (keyword != null && !keyword.isBlank()) {
            wrapper.and(w -> w.like(Student::getNickname, keyword)
                    .or().like(Student::getEmail, keyword)
                    .or().like(Student::getStudentNo, keyword));
        }
        if (certStatus != null && !certStatus.isBlank()) {
            wrapper.eq(Student::getCertStatus, certStatus);
        }
        if (accountStatus != null && !accountStatus.isBlank()) {
            wrapper.eq(Student::getAccountStatus, accountStatus);
        }
        return studentMapper.selectList(wrapper).stream().map(this::brief).toList();
    }

    /** 学生详情：含手机号 / 宿舍地址，属敏感读取，必须逐次审计（§5.5 第 5 条） */
    public Map<String, Object> studentDetail(AuthUser admin, Long studentId) {
        permissionService.currentAdmin(admin);
        Student s = studentMapper.selectById(studentId);
        if (s == null) {
            throw BizException.notFound("学生不存在");
        }
        Map<String, Object> detail = brief(s);
        detail.put("phone", s.getPhone());
        detail.put("dorm", s.getDorm());
        detail.put("realName", s.getRealName());
        detail.put("failedLoginCount", s.getFailedLoginCount());
        detail.put("lockedUntil", s.getLockedUntil());
        detail.put("credit", creditService.summary(studentId, true, null));
        detail.put("products", productMapper.selectList(Wrappers.<Product>lambdaQuery()
                        .eq(Product::getSellerId, studentId)
                        .isNull(Product::getDeletedAt)
                        .orderByDesc(Product::getPublishedAt).last("LIMIT 50"))
                .stream().map(p -> Map.of("id", p.getId(), "title", p.getTitle(), "status", p.getStatus(),
                        "offShelfReason", p.getOffShelfReason() == null ? "" : p.getOffShelfReason()))
                .toList());
        auditService.allowed(admin, "管理员", "student.readSensitive", "student", studentId,
                "读取手机号与宿舍地址");
        return detail;
    }

    /* ---------------------------------------------------------- 账号处置 */
    @Transactional
    public Map<String, Object> setAccountStatus(AuthUser user, Long studentId, String status,
                                                String reason, Boolean deductCredit) {
        permissionService.currentAdmin(user);
        if (!AccountStatus.NORMAL.equals(status) && !AccountStatus.RESTRICTED.equals(status)
                && !AccountStatus.BANNED.equals(status)) {
            throw BizException.validate("账号状态取值非法");
        }
        String note = reason == null ? "" : reason.trim();
        if (note.isEmpty()) {
            throw BizException.validate("请填写处理理由");
        }
        Student s = studentMapper.selectById(studentId);
        if (s == null) {
            throw BizException.notFound("学生不存在");
        }
        // BR-19：认证状态与账号状态分开，封禁不撤销认证
        int offShelf = 0;
        if (AccountStatus.BANNED.equals(status)) {
            offShelf = banService.ban(studentId, user.subjectId(), note);
        } else {
            studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                    .eq(Student::getId, studentId)
                    .set(Student::getAccountStatus, status)
                    .set(Student::getUpdatedAt, timeProvider.now()));
            notificationService.notifyStudent(studentId, NotifyType.DISPOSE,
                    "账号状态变更为「" + status + "」", "理由：" + note, "student", studentId, null, null);
        }
        if (Boolean.TRUE.equals(deductCredit)) {
            creditService.apply(studentId, props.getCredit().getViolationPenalty(), CreditEvent.VIOLATION,
                    "账号被处置（" + status + "）：" + note,
                    "violation:ban:" + studentId + ":" + timeProvider.now(), null);
        }
        auditService.allowed(user, "管理员", "student.setAccountStatus", "student", studentId,
                "status=" + status + ", offShelf=" + offShelf + ", note=" + note);
        return Map.of("offShelf", offShelf);
    }

    /* -------------------------------------------------------- 信用分调整 */
    @Transactional
    public Map<String, Object> adjustCredit(AuthUser user, Long studentId, Integer delta, String reason) {
        permissionService.currentAdmin(user);
        List<Integer> allowed = List.of(props.getCredit().getReviewBonus(), props.getCredit().getNoReviewPenalty(),
                props.getCredit().getCancelPenalty(), props.getCredit().getViolationPenalty());
        if (delta == null || !allowed.contains(delta)) {
            throw BizException.validate("信用分调整幅度须为 BR-14 规定的事件幅度之一（+2 / −1 / −2 / −10）");
        }
        String note = reason == null ? "" : reason.trim();
        if (note.isEmpty()) {
            throw BizException.validate("请填写调整理由");
        }
        var result = creditService.apply(studentId, delta,
                delta > 0 ? CreditEvent.REVIEW_BONUS : CreditEvent.VIOLATION,
                "管理员人工调整：" + note, "manual:" + studentId + ":" + timeProvider.now(), null);
        auditService.allowed(user, "管理员", "student.adjustCredit", "student", studentId,
                "delta=" + delta + ", applied=" + result.applied());
        return Map.of("applied", result.applied(), "score", result.score());
    }

    /* -------------------------------------------------------------- 审计 */
    public List<AuditLog> auditLogs(int limit, String action) {
        var wrapper = Wrappers.<AuditLog>lambdaQuery().orderByDesc(AuditLog::getCreatedAt)
                .last("LIMIT " + Math.min(limit, 500));
        if (action != null && !action.isBlank()) {
            wrapper.eq(AuditLog::getAction, action);
        }
        return auditLogMapper.selectList(wrapper);
    }

    /** 强制下架清单 */
    public List<Map<String, Object>> forcedOffList() {
        return productMapper.selectList(Wrappers.<Product>lambdaQuery()
                        .eq(Product::getStatus, ProductStatus.OFF_SHELF)
                        .eq(Product::getOffShelfReason, OffShelfReason.ADMIN_OFF)
                        .isNull(Product::getDeletedAt)
                        .orderByDesc(Product::getReviewedAt).last("LIMIT 200"))
                .stream().map(p -> {
                    Student seller = studentMapper.selectById(p.getSellerId());
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", p.getId());
                    m.put("title", p.getTitle());
                    m.put("note", p.getReviewNote());
                    m.put("reviewedAt", p.getReviewedAt());
                    m.put("sellerId", p.getSellerId());
                    m.put("sellerNickname", seller == null ? null : seller.getNickname());
                    return m;
                }).toList();
    }

    /* ---------------------------------------------------------------- 工具 */

    private Map<String, Object> brief(Student s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("nickname", s.getNickname());
        m.put("email", s.getEmail());
        m.put("studentNo", s.getStudentNo());
        m.put("certStatus", s.getCertStatus());
        m.put("accountStatus", s.getAccountStatus());
        m.put("creditScore", s.getCreditScore());
        m.put("reviewCount", s.getReviewCount());
        m.put("verifiedDisputeCount", s.getVerifiedDisputeCount());
        m.put("resubmitCount", s.getResubmitCount());
        m.put("registeredAt", s.getRegisteredAt());
        return m;
    }
}
