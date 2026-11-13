package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.AccountStatus;
import com.campus.trade.constant.CertStatus;
import com.campus.trade.constant.CodePurpose;
import com.campus.trade.dto.AuthDtos;
import com.campus.trade.entity.Admin;
import com.campus.trade.entity.EmailCode;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.AdminMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.TokenService;
import com.campus.trade.util.TimeProvider;
import com.campus.trade.vo.Views;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 账号与登录：UC-01 注册与登录、UC-04 管理员登录、UC-34 找回密码、个人资料。
 * 非功能：NFR-05（连续失败 5 次锁定 15 分钟）、NFR-10（邮箱验证码安全）。
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final StudentMapper studentMapper;
    private final AdminMapper adminMapper;
    private final PasswordEncoder passwordEncoder;
    private final EmailCodeService emailCodeService;
    private final MailService mailService;
    private final TokenService tokenService;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    /* ---------------------------------------------------------- UC-01 发送验证码 */
    @Transactional
    public void sendRegisterCode(String rawEmail) {
        String email = normalizeEmail(rawEmail);
        if (findByEmail(email) != null) {
            auditService.log("guest", null, "游客", "auth.register.sendCode", "email", null,
                    "denied", "EMAIL_TAKEN", email);
            throw BizException.conflict("该邮箱已注册，请直接登录或找回密码");
        }
        emailCodeService.assertRate(email);
        String code = emailCodeService.issue(email, CodePurpose.REGISTER);
        mailService.send(email, "【拾光二手】注册验证码", mailBody(code, "注册"));
    }

    /* ------------------------------------------------------------ UC-01 注册 */
    @Transactional
    public Views.SelfStudentVo register(AuthDtos.RegisterRequest req) {
        String email = normalizeEmail(req.email());
        if (!req.agree()) {
            throw BizException.validate("请先阅读并同意《用户协议》与《隐私政策》");
        }
        if (findByEmail(email) != null) {
            throw BizException.conflict("该邮箱已注册，请直接登录或找回密码");
        }
        EmailCode rec = emailCodeService.verify(email, CodePurpose.REGISTER, req.code());
        emailCodeService.consume(rec);

        Student s = new Student();
        s.setEmail(email);
        s.setStudentNo(null);
        s.setNickname(req.nickname().trim());
        s.setRealName(req.realName().trim());
        s.setPasswordHash(passwordEncoder.encode(req.password()));
        s.setPhone(req.phone() == null || req.phone().isBlank() ? null : req.phone().trim());
        s.setCertStatus(CertStatus.NONE);
        s.setAccountStatus(AccountStatus.NORMAL);
        s.setCreditScore(props.getCredit().getInitial());
        s.setReviewCount(0);
        s.setVerifiedDisputeCount(0);
        s.setResubmitCount(0);
        s.setFailedLoginCount(0);
        s.setRegisteredAt(timeProvider.now());
        s.setCreatedAt(timeProvider.now());
        s.setUpdatedAt(timeProvider.now());
        studentMapper.insert(s);

        notificationService.notifyStudent(s.getId(), "核验", "注册成功，请提交学生证核验",
                "账号已创建。请上传学生证并申报学号；核验通过后才能发布商品与下单（BR-01）。",
                "cert", null, null, null);
        auditService.log("student", s.getId(), "未认证学生", "auth.register", "student", s.getId(), "allowed", null, null);
        return Views.SelfStudentVo.of(s);
    }

    /* ------------------------------------------------------------ UC-01 登录 */
    @Transactional
    public Views.LoginResult loginStudent(AuthDtos.LoginRequest req, String ip, String userAgent) {
        String email = normalizeEmail(req.email());
        Student s = findByEmail(email);
        if (s == null) {
            auditService.log("guest", null, "游客", "auth.login", "email", null, "failed", "BAD_CREDENTIAL", email);
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "邮箱或密码不正确");
        }
        assertNotLocked(s.getLockedUntil());

        if (!passwordEncoder.matches(req.password(), s.getPasswordHash())) {
            countLoginFailure(s);
            auditService.log("student", s.getId(), "游客", "auth.login", "student", s.getId(), "failed", "BAD_CREDENTIAL", null);
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "邮箱或密码不正确");
        }
        if (AccountStatus.BANNED.equals(s.getAccountStatus())) {
            auditService.log("student", s.getId(), "未认证学生", "auth.login", "student", s.getId(), "denied", "ACCOUNT_BANNED", null);
            throw BizException.of(com.campus.trade.common.ErrorCode.ACCOUNT_BANNED, "账号不可用");
        }

        clearLoginFailure(s);
        String token = tokenService.create("student", s.getId(), ip, userAgent);

        if (props.getFeatures().isLoginSuccessNotification()) {
            notificationService.notifyStudent(s.getId(), "账号", "登录成功",
                    "你的账号于 " + timeProvider.now() + " 登录。若非本人操作，请立即通过邮箱验证码重置密码。",
                    "account", null, null, null);
        }
        auditService.log("student", s.getId(), roleByCert(s), "auth.login", "student", s.getId(), "allowed", null, null);

        String notice = AccountStatus.RESTRICTED.equals(s.getAccountStatus())
                ? "账号当前为受限状态：部分操作会被限制（BR-13）" : null;
        return new Views.LoginResult(token, Views.SelfStudentVo.of(s), notice);
    }

    @Transactional
    public void logout(String token) {
        tokenService.revoke(token);
    }

    public Object me(AuthUser user) {
        if (user == null) {
            return null;
        }
        if (user.isAdmin()) {
            Admin admin = adminMapper.selectById(user.subjectId());
            return Views.AdminVo.of(admin);
        }
        Student s = studentMapper.selectById(user.subjectId());
        return Views.SelfStudentVo.of(s);
    }

    /* -------------------------------------------------------- UC-04 管理员登录 */
    @Transactional
    public Views.AdminLoginResult loginAdmin(AuthDtos.AdminLoginRequest req, String ip, String userAgent) {
        Admin admin = adminMapper.selectOne(Wrappers.<Admin>lambdaQuery()
                .eq(Admin::getAdminNo, req.adminNo().trim()));
        if (admin == null) {
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "账号或密码不正确");
        }
        assertNotLocked(admin.getLockedUntil());
        if (!passwordEncoder.matches(req.password(), admin.getPasswordHash())) {
            int fails = (admin.getFailedCount() == null ? 0 : admin.getFailedCount()) + 1;
            admin.setFailedCount(fails);
            if (fails >= props.getSecurity().getLoginFailLimit()) {
                admin.setLockedUntil(timeProvider.now().plusMinutes(props.getSecurity().getLockMinutes()));
            }
            adminMapper.updateById(admin);
            auditService.log("guest", null, "游客", "admin.login", "admin", admin.getId(), "failed", "BAD_CREDENTIAL", null);
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "账号或密码不正确");
        }
        admin.setFailedCount(0);
        admin.setLockedUntil(null);
        adminMapper.update(null, Wrappers.<Admin>lambdaUpdate()
                .eq(Admin::getId, admin.getId())
                .set(Admin::getFailedCount, 0)
                .set(Admin::getLockedUntil, null));
        String token = tokenService.create("admin", admin.getId(), ip, userAgent);
        auditService.log("admin", admin.getId(), "管理员", "admin.login", "admin", admin.getId(), "allowed", null, null);
        return new Views.AdminLoginResult(token, Views.AdminVo.of(admin));
    }

    @Transactional
    public void changeAdminPassword(AuthUser user, AuthDtos.ChangePasswordRequest req) {
        Admin admin = adminMapper.selectById(user.subjectId());
        if (!passwordEncoder.matches(req.oldPassword(), admin.getPasswordHash())) {
            throw BizException.validate("原密码不正确");
        }
        if (passwordEncoder.matches(req.newPassword(), admin.getPasswordHash())) {
            throw BizException.validate("新密码不能与当前密码相同");
        }
        admin.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        admin.setMustChangePassword(0);
        adminMapper.updateById(admin);
        auditService.log("admin", admin.getId(), "管理员", "admin.changePassword", "admin", admin.getId(), "allowed", null, null);
    }

    /* -------------------------------------------------------- UC-34 找回密码 */
    /**
     * 防账号枚举（NFR-10 ⑤）：无论邮箱是否存在，
     * 都先做频控、都返回同一提示，且不暴露任何差异。
     */
    @Transactional
    public void forgotSendCode(String rawEmail) {
        String email = normalizeEmail(rawEmail);
        // 频控必须前置：否则「存在邮箱第二次报 429、不存在邮箱不报」会被用来枚举账号
        emailCodeService.assertRate(email);
        Student s = findByEmail(email);
        if (s == null) {
            auditService.log("guest", null, "游客", "auth.forgot.sendCode", "email", null,
                    "denied", "EMAIL_NOT_FOUND_SILENT", email);
            return;
        }
        String code = emailCodeService.issue(email, CodePurpose.RESET);
        mailService.send(email, "【拾光二手】找回密码验证码", mailBody(code, "找回密码"));
        auditService.log("guest", null, "游客", "auth.forgot.sendCode", "student", s.getId(), "allowed", null, null);
    }

    @Transactional
    public void resetPassword(AuthDtos.ResetPasswordRequest req) {
        String email = normalizeEmail(req.email());
        Student s = findByEmail(email);
        if (s == null) {
            // 与「验证码错误」完全一致，不透露账号是否存在
            throw BizException.validate("验证码错误或已失效，请重新获取");
        }
        EmailCode rec = emailCodeService.verify(email, CodePurpose.RESET, req.code());
        if (passwordEncoder.matches(req.newPassword(), s.getPasswordHash())) {
            throw BizException.validate("新密码不能与当前密码相同");
        }
        emailCodeService.consume(rec);
        s.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        s.setUpdatedAt(timeProvider.now());
        studentMapper.updateById(s);
        // NFR-10 ⑥：重置成功后该账号所有既有会话立即失效
        tokenService.revokeAll("student", s.getId());
        notificationService.notifyStudent(s.getId(), "核验", "密码已重置",
                "你的登录密码已通过邮箱验证码重置，原登录会话已全部失效。如非本人操作，请立即联系管理员。",
                "account", null, null, null);
        auditService.log("student", s.getId(), "未认证学生", "auth.resetPassword", "student", s.getId(), "allowed", null, null);
    }

    /* ------------------------------------------------------------ 个人资料 */
    @Transactional
    public Views.SelfStudentVo updateProfile(AuthUser user, AuthDtos.UpdateProfileRequest req) {
        Student s = requireStudent(user);
        if (req.nickname() != null && !req.nickname().isBlank()) {
            String nick = req.nickname().trim();
            if (nick.length() > props.getLimits().getNicknameMax()) {
                throw BizException.validate("昵称不得超过 " + props.getLimits().getNicknameMax() + " 个字符");
            }
            s.setNickname(nick);
        }
        if (req.phone() != null) {
            String phone = req.phone().trim();
            if (!phone.isEmpty() && !phone.matches("^1[3-9]\\d{9}$")) {
                throw BizException.validate("手机号格式不正确（须为 11 位中国大陆手机号）");
            }
            s.setPhone(phone.isEmpty() ? null : phone);
        }
        if (req.dorm() != null) {
            String dorm = req.dorm().trim();
            s.setDorm(dorm.isEmpty() ? null : dorm.substring(0, Math.min(100, dorm.length())));
        }
        if (req.realName() != null && !req.realName().isBlank()) {
            if (CertStatus.CERTIFIED.equals(s.getCertStatus())) {
                // 已认证后改真实姓名会破坏「证件姓名 ↔ 账号姓名」的核验口径，必须重新核验
                throw BizException.state("已认证账号不可自行修改真实姓名，如需更正请联系管理员");
            }
            s.setRealName(req.realName().trim());
        }
        s.setUpdatedAt(timeProvider.now());
        // 显式 wrapper：允许把手机号 / 宿舍地址真正清空（updateById 会跳过 null）
        studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                .eq(Student::getId, s.getId())
                .set(Student::getNickname, s.getNickname())
                .set(Student::getPhone, s.getPhone())
                .set(Student::getDorm, s.getDorm())
                .set(Student::getRealName, s.getRealName())
                .set(Student::getUpdatedAt, s.getUpdatedAt()));
        auditService.log("student", s.getId(), roleByCert(s), "student.updateProfile", "student", s.getId(), "allowed", null, null);
        return Views.SelfStudentVo.of(s);
    }

    /* ---------------------------------------------------------------- 内部方法 */

    public Student requireStudent(AuthUser user) {
        if (user == null) {
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "请先登录");
        }
        if (user.isAdmin()) {
            throw BizException.permission("管理员不参与学生功能");
        }
        Student s = studentMapper.selectById(user.subjectId());
        if (s == null) {
            throw BizException.of(com.campus.trade.common.ErrorCode.UNAUTHORIZED, "账号不存在");
        }
        return s;
    }

    private Student findByEmail(String email) {
        return studentMapper.selectOne(Wrappers.<Student>lambdaQuery().eq(Student::getEmail, email));
    }

    private void assertNotLocked(LocalDateTime lockedUntil) {
        if (lockedUntil != null && lockedUntil.isAfter(timeProvider.now())) {
            throw BizException.of(com.campus.trade.common.ErrorCode.ACCOUNT_LOCKED,
                    "账号已暂时锁定，请稍后重试");
        }
    }

    /**
     * 失败计数（NFR-05）。
     * 关键：锁定到期后计数必须清零，否则到期后一次误输就会立刻再次锁定 15 分钟。
     */
    private void countLoginFailure(Student s) {
        LocalDateTime now = timeProvider.now();
        int current = s.getFailedLoginCount() == null ? 0 : s.getFailedLoginCount();
        LocalDateTime lockedUntil = s.getLockedUntil();
        if (lockedUntil != null && !lockedUntil.isAfter(now)) {
            // 锁定已到期：计数归零后重新累计，避免「到期后错一次又被锁 15 分钟」
            current = 0;
            lockedUntil = null;
        }
        int next = current + 1;
        LocalDateTime nextLock = next >= props.getSecurity().getLoginFailLimit()
                ? now.plusMinutes(props.getSecurity().getLockMinutes()) : lockedUntil;
        // 显式 wrapper：updateById 会跳过 null，无法把 locked_until 置回空
        studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                .eq(Student::getId, s.getId())
                .set(Student::getFailedLoginCount, next)
                .set(Student::getLockedUntil, nextLock)
                .set(Student::getUpdatedAt, now));
        s.setFailedLoginCount(next);
        s.setLockedUntil(nextLock);
    }

    private void clearLoginFailure(Student s) {
        if ((s.getFailedLoginCount() != null && s.getFailedLoginCount() > 0) || s.getLockedUntil() != null) {
            studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                    .eq(Student::getId, s.getId())
                    .set(Student::getFailedLoginCount, 0)
                    .set(Student::getLockedUntil, null)
                    .set(Student::getUpdatedAt, timeProvider.now()));
            s.setFailedLoginCount(0);
            s.setLockedUntil(null);
        }
    }

    private String roleByCert(Student s) {
        return CertStatus.CERTIFIED.equals(s.getCertStatus()) ? "已认证学生" : "未认证学生";
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    private String mailBody(String code, String purpose) {
        return "同学你好：\n\n你正在拾光二手（校园二手交易平台）进行" + purpose + "操作，验证码为：\n\n    "
                + code + "\n\n验证码 " + props.getSecurity().getCodeTtlMinutes()
                + " 分钟内有效，且只能使用一次；连续输错 " + props.getSecurity().getCodeMaxFails()
                + " 次即作废。\n如非本人操作，请忽略本邮件。\n\n—— 拾光二手（本邮件由系统自动发送）";
    }
}
