package com.campus.trade.service;

import com.campus.trade.common.BizException;
import com.campus.trade.common.ErrorCode;
import com.campus.trade.config.AppProperties;
import com.campus.trade.mapper.AdminMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.security.AuthUser;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class PermissionServiceTest {

    private final PermissionService service = new PermissionService(
            mock(StudentMapper.class), mock(AdminMapper.class), new AppProperties());

    @Test
    void publishAndOrderUseSrsGuestAndAdminMessages() {
        BizException guestPublish = assertThrows(BizException.class, () -> service.requirePublishRights(null));
        assertEquals(ErrorCode.UNAUTHORIZED, guestPublish.getErrorCode());
        assertEquals("请先登录并完成学生证核验", guestPublish.getMessage());

        BizException guestOrder = assertThrows(BizException.class, () -> service.requireOrderRights(null));
        assertEquals(ErrorCode.UNAUTHORIZED, guestOrder.getErrorCode());
        assertEquals("请先登录并完成学生证核验", guestOrder.getMessage());

        AuthUser admin = new AuthUser("admin", 1L, "管理员");
        BizException adminPublish = assertThrows(BizException.class, () -> service.requirePublishRights(admin));
        assertEquals(ErrorCode.FORBIDDEN, adminPublish.getErrorCode());
        assertEquals("管理员无发布商品权限", adminPublish.getMessage());

        BizException adminOrder = assertThrows(BizException.class, () -> service.requireOrderRights(admin));
        assertEquals(ErrorCode.FORBIDDEN, adminOrder.getErrorCode());
        assertEquals("管理员无下单权限", adminOrder.getMessage());

        BizException adminReview = assertThrows(BizException.class, () ->
                service.requireCertifiedStudent(admin, "请先登录", "管理员无评价权限"));
        assertEquals(ErrorCode.FORBIDDEN, adminReview.getErrorCode());
        assertEquals("管理员无评价权限", adminReview.getMessage());

        BizException adminReport = assertThrows(BizException.class, () -> service.requireCertifiedStudent(
                admin, "请先登录", "管理员不能以举报人身份提交举报"));
        assertEquals(ErrorCode.FORBIDDEN, adminReport.getErrorCode());
        assertEquals("管理员不能以举报人身份提交举报", adminReport.getMessage());
    }

    @Test
    void genericStudentGuardStillUsesGenericLoginMessage() {
        BizException exception = assertThrows(BizException.class, () -> service.currentStudent(null));
        assertEquals("请先登录", exception.getMessage());
    }
}
