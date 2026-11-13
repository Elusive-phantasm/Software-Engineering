package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.CertStatus;
import com.campus.trade.constant.CreditEvent;
import com.campus.trade.constant.NotifyType;
import com.campus.trade.dto.VerificationDtos;
import com.campus.trade.entity.CertificationApplication;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.CertificationApplicationMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.TimeProvider;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 学生证核验：UC-02 提交核验、UC-03 审核学生证。
 * 状态机 AT-01～AT-08；规则 BR-16（7 天 / 24 小时，均不自动通过）、BR-17（重提上限）、
 * BR-18（伪造必须封禁）、BR-19（认证状态与账号状态分离）。
 */
@Service
@RequiredArgsConstructor
public class VerificationService {

    private static final Pattern STUDENT_NO = Pattern.compile("^\\d{6,20}$");

    private final CertificationApplicationMapper certMapper;
    private final StudentMapper studentMapper;
    private final StorageService storageService;
    private final PermissionService permissionService;
    private final NotificationService notificationService;
    private final CreditService creditService;
    private final BanService banService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    /* ------------------------------------------------------ UC-02 提交 / 重提 */
    @Transactional
    public Views.CertStateVo submit(AuthUser user, VerificationDtos.SubmitRequest req) {
        Student s = permissionService.currentStudent(user);
        if (CertStatus.CERTIFIED.equals(s.getCertStatus())) {
            throw BizException.state("你已完成核验，无需重复提交");
        }
        if (CertStatus.PENDING.equals(s.getCertStatus())) {
            throw BizException.state("核验审核中，请等待");
        }
        boolean isResubmit = CertStatus.REJECTED.equals(s.getCertStatus());
        int limit = props.getCertification().getResubmitLimit();
        if (isResubmit && s.getResubmitCount() != null && s.getResubmitCount() >= limit) {
            throw BizException.state("重新提交次数已达上限（" + limit + " 次），请联系管理员");
        }
        String declaredNo = req.declaredNo() == null ? "" : req.declaredNo().trim();
        if (!STUDENT_NO.matcher(declaredNo).matches()) {
            throw BizException.validate("申报学号格式不正确（6～20 位数字）");
        }
        Student occupied = studentMapper.selectOne(Wrappers.<Student>lambdaQuery()
                .eq(Student::getStudentNo, declaredNo)
                .eq(Student::getCertStatus, CertStatus.CERTIFIED)
                .ne(Student::getId, s.getId()));
        if (occupied != null) {
            throw BizException.conflict("该学号已被其他账号认证占用，如属冒用请举报");
        }

        String imagePath = storageService.saveDataUrl(req.cardImage(), "cert");

        CertificationApplication app = new CertificationApplication();
        app.setStudentId(s.getId());
        app.setDeclaredNo(declaredNo);
        app.setCardImage(imagePath);
        app.setReviewStatus("待审核");
        app.setForgeryFlag(0);
        app.setSubmittedAt(timeProvider.now());
        certMapper.insert(app);

        s.setCertStatus(CertStatus.PENDING);
        if (isResubmit) {
            s.setResubmitCount(Math.min(limit, (s.getResubmitCount() == null ? 0 : s.getResubmitCount()) + 1));
        }
        s.setUpdatedAt(timeProvider.now());
        studentMapper.updateById(s);

        notificationService.notifyStudent(s.getId(), NotifyType.CERT, "核验申请已提交",
                "你的学生证核验申请已提交，管理员将在 24 小时内作出结论（BR-16）。审核期间可浏览与收藏，暂不可发布与交易。",
                "cert", app.getId(), null, null);
        notificationService.notifyAllAdmins(NotifyType.CERT, "新的学生证核验申请",
                "学生「" + s.getNickname() + "」提交了核验申请（申报学号 " + declaredNo + "），请在 24 小时内审核。",
                "cert", app.getId());
        auditService.allowed(user, "未认证学生", "cert.submit", "cert", app.getId(), null);

        return mine(user);
    }

    public Views.CertStateVo mine(AuthUser user) {
        Student s = permissionService.currentStudent(user);
        CertificationApplication latest = certMapper.selectOne(Wrappers.<CertificationApplication>lambdaQuery()
                .eq(CertificationApplication::getStudentId, s.getId())
                .orderByDesc(CertificationApplication::getSubmittedAt)
                .last("LIMIT 1"));
        int used = s.getResubmitCount() == null ? 0 : s.getResubmitCount();
        int limit = props.getCertification().getResubmitLimit();
        boolean canSubmit = (CertStatus.NONE.equals(s.getCertStatus()) || CertStatus.REJECTED.equals(s.getCertStatus()))
                && used < limit;
        return new Views.CertStateVo(s.getCertStatus(), used, limit, canSubmit, s.getStudentNo(),
                Views.CertApplicationVo.of(latest));
    }

    /* -------------------------------------------------------- UC-03 审核队列 */
    public List<Views.AdminCertApplicationVo> list(String status) {
        var query = Wrappers.<CertificationApplication>lambdaQuery()
                .orderByDesc(CertificationApplication::getSubmittedAt);
        if (status != null && !status.isBlank()) {
            query.eq(CertificationApplication::getReviewStatus, status);
        } else {
            query.eq(CertificationApplication::getReviewStatus, "待审核");
        }
        List<CertificationApplication> apps = certMapper.selectList(query.last("LIMIT 200"));
        return apps.stream().map(a -> {
            Student s = studentMapper.selectById(a.getStudentId());
            return new Views.AdminCertApplicationVo(a.getId(), a.getStudentId(),
                    s == null ? null : s.getNickname(), s == null ? null : s.getRealName(),
                    s == null ? null : s.getEmail(), a.getDeclaredNo(),
                    s == null ? 0 : s.getResubmitCount(), a.getReviewStatus(), a.getRejectReason(),
                    a.getForgeryFlag() != null && a.getForgeryFlag() == 1, a.getSubmittedAt(), a.getReviewedAt());
        }).toList();
    }

    /** NFR-08：只允许管理员读取学生证图片，且不经过任何公开路由 */
    public byte[] image(AuthUser user, Long id) {
        permissionService.currentAdmin(user);
        CertificationApplication app = certMapper.selectById(id);
        if (app == null) {
            throw BizException.notFound("认证申请不存在");
        }
        auditService.allowed(user, "管理员", "cert.readImage", "cert", id, null);
        try {
            return java.nio.file.Files.readAllBytes(storageService.certFile(app.getCardImage()));
        } catch (java.io.IOException e) {
            throw BizException.notFound("学生证图片不存在");
        }
    }

    public String imageContentType(Long id) {
        CertificationApplication app = certMapper.selectById(id);
        return app == null ? "image/jpeg" : storageService.contentTypeOf(app.getCardImage());
    }

    /* ------------------------------------------------------------ AT-03 通过 */
    @Transactional
    public void approve(AuthUser user, Long id) {
        permissionService.currentAdmin(user);
        CertificationApplication app = certMapper.selectById(id);
        if (app == null) {
            throw BizException.notFound("认证申请不存在");
        }
        if (!"待审核".equals(app.getReviewStatus())) {
            throw BizException.state("当前业务状态不支持该操作");
        }
        Student occupied = studentMapper.selectOne(Wrappers.<Student>lambdaQuery()
                .eq(Student::getStudentNo, app.getDeclaredNo())
                .eq(Student::getCertStatus, CertStatus.CERTIFIED)
                .ne(Student::getId, app.getStudentId()));
        if (occupied != null) {
            throw BizException.conflict("该学号已被其他账号认证占用，不得通过");
        }
        Student s = studentMapper.selectById(app.getStudentId());

        app.setReviewStatus("已通过");
        app.setReviewerId(user.subjectId());
        app.setReviewedAt(timeProvider.now());
        certMapper.updateById(app);

        s.setCertStatus(CertStatus.CERTIFIED);
        s.setStudentNo(app.getDeclaredNo());
        s.setUpdatedAt(timeProvider.now());
        studentMapper.updateById(s);

        notificationService.notifyStudent(s.getId(), NotifyType.CERT, "学生证核验已通过",
                "你的学生证核验已通过，现在可以发布商品、下单、评价与举报。封禁状态不会因核验通过而解除（BR-19）。",
                "cert", id, null, null);
        auditService.allowed(user, "管理员", "cert.approve", "cert", id, null);
    }

    /* ------------------------------------------------------------ AT-04 驳回 */
    @Transactional
    public void reject(AuthUser user, Long id, VerificationDtos.RejectRequest req) {
        permissionService.currentAdmin(user);
        CertificationApplication app = certMapper.selectById(id);
        if (app == null) {
            throw BizException.notFound("认证申请不存在");
        }
        if (!"待审核".equals(app.getReviewStatus())) {
            throw BizException.state("当前业务状态不支持该操作");
        }
        String reason = req.reason() == null ? "" : req.reason().trim();
        if (reason.isEmpty()) {
            throw BizException.validate("请填写驳回原因");
        }
        Student s = studentMapper.selectById(app.getStudentId());

        app.setReviewStatus("已驳回");
        app.setReviewerId(user.subjectId());
        app.setReviewedAt(timeProvider.now());
        app.setRejectReason(reason.length() > 200 ? reason.substring(0, 200) : reason);
        app.setForgeryFlag(req.forgery() ? 1 : 0);
        certMapper.updateById(app);

        // 驳回只改变认证状态，不增加「累计重提次数」——计数在重提成功时 +1（见 docs §2.6）
        s.setCertStatus(CertStatus.REJECTED);
        s.setUpdatedAt(timeProvider.now());
        studentMapper.updateById(s);

        notificationService.notifyStudent(s.getId(), NotifyType.CERT, "学生证核验未通过",
                "核验未通过。原因：" + reason + "。修改后可重新提交。", "cert", id, null, null);

        if (req.forgery()) {
            // BR-18：核实伪造的必须按违规处置 —— 应封禁并连带下架
            banService.ban(s.getId(), user.subjectId(), "学生证涉嫌伪造/冒用（BR-18）");
            auditService.allowed(user, "管理员", "cert.rejectForgery", "cert", id, "forgery=true");
        } else {
            auditService.allowed(user, "管理员", "cert.reject", "cert", id, reason);
        }
    }

    /* ---------------------------------- AT-08 已认证后事后核实伪造，改回已驳回 */
    @Transactional
    public void revokeCertification(AuthUser user, Long studentId, VerificationDtos.RevokeRequest req) {
        permissionService.currentAdmin(user);
        Student s = studentMapper.selectById(studentId);
        if (s == null) {
            throw BizException.notFound("学生不存在");
        }
        if (!CertStatus.CERTIFIED.equals(s.getCertStatus())) {
            throw BizException.state("仅「已认证」账号可执行事后核实处置");
        }
        String reason = req.reason() == null ? "" : req.reason().trim();
        if (reason.isEmpty()) {
            throw BizException.validate("请填写撤销认证的依据");
        }

        s.setCertStatus(CertStatus.REJECTED);
        s.setUpdatedAt(timeProvider.now());
        studentMapper.updateById(s);
        banService.ban(studentId, user.subjectId(), "学生证伪造/冒用，事后核实（AT-08）");
        if (req.deductCredit()) {
            creditService.apply(studentId, props.getCredit().getViolationPenalty(), CreditEvent.VIOLATION,
                    "经核实学生证伪造/冒用（AT-08）：" + reason,
                    "violation:cert:" + studentId + ":" + timeProvider.now(), null);
        }
        notificationService.notifyStudent(studentId, NotifyType.DISPOSE, "认证资格已撤销",
                "经事后核实，你的学生证存在伪造/冒用情形，认证状态已改回「已驳回」，账号已封禁。", "cert", null, null, null);
        auditService.allowed(user, "管理员", "cert.revoke", "student", studentId, reason);
    }
}
