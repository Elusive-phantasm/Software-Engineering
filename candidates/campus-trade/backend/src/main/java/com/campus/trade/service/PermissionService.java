package com.campus.trade.service;

import com.campus.trade.common.BizException;
import com.campus.trade.common.ErrorCode;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.AccountStatus;
import com.campus.trade.constant.CertStatus;
import com.campus.trade.entity.Admin;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.AdminMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 权限与资格守卫（SRS §5.1 角色口径 / §5.2 权限矩阵 / §5.3 业务条件）。
 * 所有业务规则都从这里取「当前主体」，保证鉴权只有一个入口。
 */
@Service
@RequiredArgsConstructor
public class PermissionService {

    private final StudentMapper studentMapper;
    private final AdminMapper adminMapper;
    private final AppProperties props;

    public Student currentStudent(AuthUser user) {
        if (user == null) {
            throw BizException.of(ErrorCode.UNAUTHORIZED, "请先登录");
        }
        if (user.isAdmin()) {
            throw BizException.permission("管理员不参与学生功能");
        }
        Student s = studentMapper.selectById(user.subjectId());
        if (s == null) {
            throw BizException.of(ErrorCode.UNAUTHORIZED, "账号不存在");
        }
        return s;
    }

    public Admin currentAdmin(AuthUser user) {
        if (user == null) {
            throw BizException.of(ErrorCode.UNAUTHORIZED, "请先登录");
        }
        if (!user.isAdmin()) {
            throw BizException.permission("仅管理员可执行该操作");
        }
        Admin admin = adminMapper.selectById(user.subjectId());
        if (admin == null) {
            throw BizException.of(ErrorCode.UNAUTHORIZED, "管理员账号不存在");
        }
        return admin;
    }

    /** 认证状态三态给出各自提示语（§5.2 拒绝提示语表） */
    public void assertCertified(Student s) {
        if (CertStatus.CERTIFIED.equals(s.getCertStatus())) {
            return;
        }
        if (CertStatus.NONE.equals(s.getCertStatus())) {
            throw BizException.permission("请先上传学生证");
        }
        if (CertStatus.PENDING.equals(s.getCertStatus())) {
            throw BizException.permission("核验审核中，请等待");
        }
        throw BizException.permission("核验未通过，请按原因修改后重新提交");
    }

    public void assertNotBanned(Student s) {
        if (AccountStatus.BANNED.equals(s.getAccountStatus())) {
            throw BizException.of(ErrorCode.ACCOUNT_BANNED, "账号已封禁，不可发布与下单");
        }
    }

    /** 发布资格：已认证 + 未封禁 + 信用分 ≥ 60（BR-01、BR-13） */
    public Student requirePublishRights(AuthUser user) {
        Student s = currentStudent(user);
        assertCertified(s);
        assertNotBanned(s);
        if (s.getCreditScore() < props.getCredit().getPublishThreshold()) {
            throw BizException.permission("信用分不足，暂不可发布新商品");
        }
        return s;
    }

    /** 下单资格：已认证 + 未封禁 + 信用分 ≥ 40（BR-01、BR-13） */
    public Student requireOrderRights(AuthUser user) {
        Student s = currentStudent(user);
        assertCertified(s);
        assertNotBanned(s);
        if (s.getCreditScore() < props.getCredit().getOrderThreshold()) {
            throw BizException.permission("信用分不足，暂不可下单");
        }
        return s;
    }

    /** 评价 / 举报 / 发起私信资格：已认证 + 未封禁 */
    public Student requireCertifiedStudent(AuthUser user) {
        Student s = currentStudent(user);
        assertCertified(s);
        assertNotBanned(s);
        return s;
    }

    public void assertOwner(Long ownerId, Student actor, String message) {
        if (ownerId == null || !ownerId.equals(actor.getId())) {
            throw BizException.permission(message);
        }
    }
}
