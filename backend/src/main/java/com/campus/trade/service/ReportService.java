package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.*;
import com.campus.trade.dto.SocialDtos;
import com.campus.trade.entity.*;
import com.campus.trade.mapper.*;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.TimeProvider;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 举报与处置：UC-12 举报违规商品或学生、UC-13 处理举报与违规处置。
 * 规则：BR-04（禁售清单闭集与举报受理范围）、BR-09、BR-10（封禁连带下架）、BR-14 ②（成立 −10）。
 */
@Service
@RequiredArgsConstructor
public class ReportService {

    private static final Set<String> PRODUCT_REPORT_TYPES =
            Set.of("违禁品", "虚假描述", "价格欺诈", "站外导流", "其他");
    private static final Set<String> STUDENT_REPORT_TYPES = Set.of("收款不履约", "其他");
    private static final List<String> ACTIONS =
            List.of("警告", "强制下架商品", "限制发布", "封禁账号", "扣信用分");

    private final ReportMapper reportMapper;
    private final ProductMapper productMapper;
    private final StudentMapper studentMapper;
    private final ChatMessageMapper messageMapper;
    private final TradeOrderMapper orderMapper;
    private final PermissionService permissionService;
    private final NotificationService notificationService;
    private final CreditService creditService;
    private final BanService banService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    /* --------------------------------------------------------------- UC-12 */
    @Transactional
    public Views.ReportVo submit(AuthUser user, SocialDtos.CreateReportRequest req) {
        Student reporter = permissionService.requireCertifiedStudent(user);
        String targetType = req.targetType().trim();
        String type = req.type().trim();
        if (!ReportTarget.PRODUCT.equals(targetType) && !ReportTarget.STUDENT.equals(targetType)) {
            throw BizException.validate("举报对象类型只能是「商品」或「学生」");
        }
        boolean typeOk = ReportTarget.PRODUCT.equals(targetType)
                ? PRODUCT_REPORT_TYPES.contains(type) : STUDENT_REPORT_TYPES.contains(type);
        if (!typeOk) {
            throw BizException.validate("举报类型与对象不匹配");
        }
        String reason = req.reason().trim();

        Long productId = null;
        Long studentId = null;
        if (ReportTarget.PRODUCT.equals(targetType)) {
            Product product = productMapper.selectById(req.targetId());
            if (product == null || product.getDeletedAt() != null) {
                throw BizException.notFound("该商品已不存在");
            }
            if (product.getSellerId().equals(reporter.getId())) {
                throw BizException.state("不能举报自己的商品");
            }
            productId = product.getId();
        } else {
            if (req.targetId().equals(reporter.getId())) {
                throw BizException.state("不能举报自己");
            }
            Student target = studentMapper.selectById(req.targetId());
            if (target == null) {
                throw BizException.notFound("被举报用户不存在");
            }
            // 辅事件流 C：只能举报与之发生过交易或沟通的用户
            boolean hasDeal = orderMapper.selectCount(Wrappers.<TradeOrder>lambdaQuery()
                    .and(w -> w.eq(TradeOrder::getBuyerId, reporter.getId()).eq(TradeOrder::getSellerId, target.getId())
                            .or(x -> x.eq(TradeOrder::getSellerId, reporter.getId()).eq(TradeOrder::getBuyerId, target.getId())))) > 0;
            boolean hasChat = messageMapper.selectCount(Wrappers.<ChatMessage>lambdaQuery()
                    .and(w -> w.eq(ChatMessage::getSenderId, reporter.getId()).eq(ChatMessage::getReceiverId, target.getId())
                            .or(x -> x.eq(ChatMessage::getSenderId, target.getId()).eq(ChatMessage::getReceiverId, reporter.getId())))) > 0;
            if (!hasDeal && !hasChat) {
                throw BizException.permission("只能举报与你发生过交易或沟通的用户");
            }
            studentId = target.getId();
        }

        String targetKey = String.valueOf(req.targetId());
        if (reportMapper.selectCount(Wrappers.<Report>lambdaQuery()
                .eq(Report::getReporterId, reporter.getId())
                .eq(Report::getTargetType, targetType)
                .eq(Report::getTargetKey, targetKey)) > 0) {
            throw BizException.state("你已举报过该对象");
        }

        Report report = new Report();
        report.setReporterId(reporter.getId());
        report.setTargetType(targetType);
        report.setTargetProductId(productId);
        report.setTargetStudentId(studentId);
        report.setTargetKey(targetKey);
        report.setType(type);
        report.setReason(reason);
        report.setHandleStatus(ReportStatus.PENDING);
        report.setCreatedAt(timeProvider.now());
        reportMapper.insert(report);

        notificationService.notifyAllAdmins(NotifyType.DISPOSE, "收到新的举报",
                "学生「" + reporter.getNickname() + "」提交了一条" + targetType + "举报（类型：" + type
                        + "），请在 24 小时内处理。", "report", report.getId());
        notificationService.notifyStudent(reporter.getId(), NotifyType.DISPOSE, "举报已受理",
                "你的举报已受理，管理员核实后会在「我的举报」中更新进度。", "report", report.getId(), null, null);
        auditService.allowed(user, roleOf(reporter), "report.submit", "report", report.getId(),
                "targetType=" + targetType + ", type=" + type);
        return toVo(report);
    }

    public List<Views.ReportVo> mine(AuthUser user) {
        Student me = permissionService.currentStudent(user);
        return reportMapper.selectList(Wrappers.<Report>lambdaQuery()
                        .eq(Report::getReporterId, me.getId())
                        .orderByDesc(Report::getCreatedAt))
                .stream().map(this::toVo).toList();
    }

    /* --------------------------------------------------------------- UC-13 */
    public List<Views.ReportVo> adminList(String status) {
        var wrapper = Wrappers.<Report>lambdaQuery().orderByAsc(Report::getCreatedAt);
        if (status != null && !status.isBlank()) {
            wrapper.eq(Report::getHandleStatus, status);
        } else {
            wrapper.eq(Report::getHandleStatus, ReportStatus.PENDING);
        }
        return reportMapper.selectList(wrapper.last("LIMIT 300")).stream().map(this::toVo).toList();
    }

    @Transactional
    public Views.ReportVo handle(AuthUser user, Long reportId, SocialDtos.HandleReportRequest req) {
        Admin admin = permissionService.currentAdmin(user);
        Report report = reportMapper.selectById(reportId);
        if (report == null) {
            throw BizException.notFound("举报不存在");
        }
        if (!ReportStatus.PENDING.equals(report.getHandleStatus())) {
            throw BizException.state("该举报已被处理");
        }
        String resultText = req.result() == null ? "" : req.result().trim();
        if (resultText.isEmpty()) {
            throw BizException.validate("请填写处理结论");
        }
        LocalDateTime now = timeProvider.now();

        /* ------------------------------------------------ 不成立：只标驳回 */
        if (!req.upheld()) {
            reportMapper.update(null, Wrappers.<Report>lambdaUpdate()
                    .eq(Report::getId, reportId)
                    .set(Report::getHandleStatus, ReportStatus.REJECTED)
                    .set(Report::getResult, resultText)
                    .set(Report::getHandlerAdminId, admin.getId())
                    .set(Report::getHandledAt, now));
            notificationService.notifyStudent(report.getReporterId(), NotifyType.DISPOSE, "举报处理结果：不成立",
                    "你提交的举报经核实不成立，已驳回。恶意举报可能被反向处置。", "report", reportId, null, null);
            auditService.allowed(user, "管理员", "report.reject", "report", reportId, resultText);
            return toVo(reportMapper.selectById(reportId));
        }

        /* ------------------------------------------- 成立：执行处置手段 */
        List<String> picked = new ArrayList<>();
        if (req.actions() != null) {
            req.actions().stream().filter(ACTIONS::contains).forEach(picked::add);
        }
        if (picked.isEmpty()) {
            throw BizException.validate("请至少选择一项处置手段");
        }
        if (ReportTarget.STUDENT.equals(report.getTargetType()) && picked.contains("强制下架商品")) {
            throw BizException.validate("对象为学生的举报不得包含「强制下架商品」");
        }
        // UC-13 辅事件流 G：收款不履约核实成立 → 应同时封禁
        if (ReportType.NO_PAY.equals(report.getType()) && !picked.contains("封禁账号")) {
            picked.add("封禁账号");
        }

        Product product = report.getTargetProductId() == null ? null : productMapper.selectById(report.getTargetProductId());
        Long targetStudentId = ReportTarget.STUDENT.equals(report.getTargetType())
                ? report.getTargetStudentId()
                : (product == null ? null : product.getSellerId());
        if (targetStudentId == null) {
            throw BizException.state("举报对象已不可用，无法处置");
        }

        String code = req.categoryCode() == null ? "" : req.categoryCode().trim().toUpperCase();
        boolean offShelfDone = false;
        if (ReportTarget.PRODUCT.equals(report.getTargetType()) && picked.contains("强制下架商品")
                && product != null && !ProductStatus.SOLD.equals(product.getStatus())
                && product.getDeletedAt() == null) {
            if (!code.isEmpty() && !ForbiddenCategories.exists(code)) {
                throw BizException.validate("禁售类目编号不存在");
            }
            String note = "举报核实成立" + (code.isEmpty() ? "" : "（§4.3 " + code + " "
                    + ForbiddenCategories.nameOf(code) + "）") + "：" + resultText;
            productMapper.update(null, Wrappers.<Product>lambdaUpdate()
                    .eq(Product::getId, product.getId())
                    .set(Product::getStatus, ProductStatus.OFF_SHELF)
                    .set(Product::getOffShelfReason, OffShelfReason.ADMIN_OFF)
                    .set(Product::getReviewNote, truncate(note, 200))
                    .set(Product::getReviewedBy, admin.getId())
                    .set(Product::getReviewedAt, now)
                    .set(Product::getUpdatedAt, now));
            offShelfDone = true;
            notificationService.notifyStudent(targetStudentId, NotifyType.DISPOSE, "商品因违规被强制下架",
                    "商品《" + product.getTitle() + "》经核实违规，已被强制下架。原因：" + note
                            + "。如认为处置有误，可在该商品的站内私信向管理员提出异议。",
                    "product", product.getId(), product.getId(), null);
        }

        // BR-14 ②：举报成立，被举报方 −10（同一举报只扣一次）
        creditService.apply(targetStudentId, props.getCredit().getViolationPenalty(), CreditEvent.VIOLATION,
                "举报核实成立：" + resultText, "violation:report:" + reportId, null);

        if (picked.contains("封禁账号")) {
            banService.ban(targetStudentId, admin.getId(), "举报成立并封禁：" + resultText);
        } else if (picked.contains("限制发布")) {
            studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                    .eq(Student::getId, targetStudentId)
                    .set(Student::getAccountStatus, AccountStatus.RESTRICTED)
                    .set(Student::getUpdatedAt, now));
        }

        if (ReportTarget.STUDENT.equals(report.getTargetType())) {
            studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                    .eq(Student::getId, targetStudentId)
                    .setSql("verified_dispute_count = verified_dispute_count + 1"));
        }

        reportMapper.update(null, Wrappers.<Report>lambdaUpdate()
                .eq(Report::getId, reportId)
                .set(Report::getHandleStatus, ReportStatus.HANDLED)
                .set(Report::getActions, String.join(",", picked))
                .set(Report::getViolationCodes, code.isEmpty() ? null : code)
                .set(Report::getResult, resultText)
                .set(Report::getHandlerAdminId, admin.getId())
                .set(Report::getHandledAt, now));

        notificationService.notifyStudent(report.getReporterId(), NotifyType.DISPOSE, "举报处理结果：成立",
                "你提交的举报经核实成立，已执行处置：" + String.join("、", picked) + "。处理结果：" + resultText,
                "report", reportId, null, null);
        if (!picked.contains("封禁账号")) {
            notificationService.notifyStudent(targetStudentId, NotifyType.DISPOSE, "你被举报的事项已核实成立",
                    "处理结果：" + resultText + "。已执行处置：" + String.join("、", picked) + "。",
                    "report", reportId, null, null);
        }
        auditService.allowed(user, "管理员", "report.handle", "report", reportId,
                "actions=" + String.join(",", picked) + ", offShelf=" + offShelfDone + ", code=" + code);
        return toVo(reportMapper.selectById(reportId));
    }

    /* ---------------------------------------------------------------- 工具 */

    private Views.ReportVo toVo(Report r) {
        Student reporter = studentMapper.selectById(r.getReporterId());
        Product product = r.getTargetProductId() == null ? null : productMapper.selectById(r.getTargetProductId());
        Student target = r.getTargetStudentId() == null ? null : studentMapper.selectById(r.getTargetStudentId());
        List<String> actions = r.getActions() == null || r.getActions().isBlank()
                ? List.of() : List.of(r.getActions().split(","));
        List<String> allowed = ReportTarget.STUDENT.equals(r.getTargetType())
                ? ACTIONS.stream().filter(a -> !"强制下架商品".equals(a)).toList()
                : ACTIONS;
        return new Views.ReportVo(r.getId(), r.getReporterId(), reporter == null ? null : reporter.getNickname(),
                r.getTargetType(), r.getTargetProductId(), product == null ? null : product.getTitle(),
                product == null ? null : product.getStatus(), r.getTargetStudentId(),
                target == null ? null : target.getNickname(), r.getType(), r.getReason(),
                r.getHandleStatus(), actions, r.getViolationCodes(), r.getResult(),
                r.getHandlerAdminId(), r.getHandledAt(), r.getCreatedAt(), allowed);
    }

    private String roleOf(Student s) {
        return CertStatus.CERTIFIED.equals(s.getCertStatus()) ? "已认证学生" : "未认证学生";
    }

    private String truncate(String text, int max) {
        return text == null ? null : (text.length() <= max ? text : text.substring(0, max));
    }
}
