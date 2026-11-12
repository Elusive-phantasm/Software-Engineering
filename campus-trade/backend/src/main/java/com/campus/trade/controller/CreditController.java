package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.common.BizException;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.service.CreditService;
import com.campus.trade.service.PermissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 信用分：UC-15。本人可见分数与明细，他人只可见分数（§6.5）。
 */
@Tag(name = "06-信用分", description = "查看本人/他人信用分")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CreditController {

    private final CreditService creditService;
    private final PermissionService permissionService;

    @Operation(summary = "我的信用分与变动明细")
    @GetMapping("/me/credit")
    public ApiResponse<Object> mine(@CurrentUser AuthUser user) {
        var me = permissionService.currentStudent(user);
        return ApiResponse.ok(creditService.summary(me.getId(), true, null));
    }

    @Operation(summary = "查看他人信用分（仅分数，不含明细）")
    @GetMapping("/students/{id}/credit")
    public ApiResponse<Object> ofStudent(@CurrentUser AuthUser user, @PathVariable Long id) {
        var me = permissionService.currentStudent(user);
        if (me.getId().equals(id)) {
            return ApiResponse.ok(creditService.summary(id, true, null));
        }
        return ApiResponse.ok(creditService.summary(id, false,
                "他人信用分仅展示分数，不展示变动明细与具体交易记录（NFR-04）"));
    }

    @Operation(summary = "管理员查看某学生信用分明细")
    @GetMapping("/admin/students/{id}/credit")
    public ApiResponse<Object> adminView(@CurrentUser AuthUser user, @PathVariable Long id) {
        permissionService.currentAdmin(user);
        var vo = creditService.summary(id, true, null);
        if (vo == null) {
            throw BizException.notFound("学生不存在");
        }
        return ApiResponse.ok(vo);
    }
}
