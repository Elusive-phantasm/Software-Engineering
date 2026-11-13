package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.constant.ForbiddenCategories;
import com.campus.trade.constant.OffShelfReason;
import com.campus.trade.dto.SocialDtos;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.service.AdminService;
import com.campus.trade.service.ReportService;
import com.campus.trade.service.ReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理端：看板、学生管理、举报处置、审计、评价删除、元数据。
 */
@Tag(name = "13-管理端·治理", description = "看板、学生管理、举报处置、审计日志、评价删除")
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final ReportService reportService;
    private final ReviewService reviewService;
    private final com.campus.trade.service.MessageService messageService;

    @Operation(summary = "看板统计")
    @GetMapping("/dashboard")
    public ApiResponse<Object> dashboard() {
        return ApiResponse.ok(adminService.dashboard());
    }

    @Operation(summary = "学生列表")
    @GetMapping("/students")
    public ApiResponse<Object> students(@RequestParam(required = false) String keyword,
                                        @RequestParam(required = false) String certStatus,
                                        @RequestParam(required = false) String accountStatus) {
        return ApiResponse.ok(adminService.students(keyword, certStatus, accountStatus));
    }

    @Operation(summary = "学生详情（含联系方式，读取即写审计）")
    @GetMapping("/students/{id}")
    public ApiResponse<Object> student(@CurrentUser AuthUser user, @PathVariable Long id) {
        return ApiResponse.ok(adminService.studentDetail(user, id));
    }

    @Operation(summary = "账号状态处置（封禁连带下架，ST-13）")
    @PostMapping("/students/{id}/account-status")
    public ApiResponse<Object> accountStatus(@CurrentUser AuthUser user, @PathVariable Long id,
                                             @Valid @RequestBody SocialDtos.AccountStatusRequest req) {
        return ApiResponse.ok(adminService.setAccountStatus(user, id, req.status(), req.reason(),
                req.deductCredit()), "账号状态已更新");
    }

    @Operation(summary = "信用分人工调整（幅度限 BR-14 事件值）")
    @PostMapping("/students/{id}/credit")
    public ApiResponse<Object> adjustCredit(@CurrentUser AuthUser user, @PathVariable Long id,
                                            @Valid @RequestBody SocialDtos.AdjustCreditRequest req) {
        return ApiResponse.ok(adminService.adjustCredit(user, id, req.delta(), req.reason()), "信用分已调整");
    }

    @Operation(summary = "举报队列")
    @GetMapping("/reports")
    public ApiResponse<Object> reports(@RequestParam(required = false) String status) {
        return ApiResponse.ok(reportService.adminList(status));
    }

    @Operation(summary = "处理举报（成立 / 不成立）")
    @PostMapping("/reports/{id}/handle")
    public ApiResponse<Object> handleReport(@CurrentUser AuthUser user, @PathVariable Long id,
                                            @Valid @RequestBody SocialDtos.HandleReportRequest req) {
        return ApiResponse.ok(reportService.handle(user, id, req), "举报已处理");
    }

    @Operation(summary = "删除他人评价")
    @PostMapping("/reviews/{id}/delete")
    public ApiResponse<Void> deleteReview(@CurrentUser AuthUser user, @PathVariable Long id,
                                          @Valid @RequestBody SocialDtos.DeleteReviewRequest req) {
        reviewService.deleteByAdmin(user, id, req.reason());
        return ApiResponse.ok(null, "评价已删除");
    }

    @Operation(summary = "回复处置异议会话（管理员仅可回复，不得主动发起）")
    @PostMapping("/messages/reply")
    public ApiResponse<Object> replyMessage(@CurrentUser AuthUser user,
                                            @Valid @RequestBody SocialDtos.SendMessageRequest req) {
        return ApiResponse.ok(messageService.adminReply(user, req.productId(), req.toId(), req.content()), "已回复");
    }

    @Operation(summary = "审计日志")
    @GetMapping("/audit")
    public ApiResponse<Object> audit(@RequestParam(defaultValue = "100") int limit,
                                     @RequestParam(required = false) String action) {
        return ApiResponse.ok(adminService.auditLogs(limit, action));
    }

    @Operation(summary = "强制下架清单")
    @GetMapping("/forced-off-products")
    public ApiResponse<Object> forcedOff() {
        return ApiResponse.ok(adminService.forcedOffList());
    }

    @Operation(summary = "元数据（处置手段、举报类型、禁售类目、撤销原因）")
    @GetMapping("/meta")
    public ApiResponse<Object> meta() {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("actions", List.of("警告", "强制下架商品", "限制发布", "封禁账号", "扣信用分"));
        meta.put("reportTypes", List.of("违禁品", "虚假描述", "价格欺诈", "站外导流", "收款不履约", "其他"));
        meta.put("reportTypesByTarget", Map.of(
                "商品", List.of("违禁品", "虚假描述", "价格欺诈", "站外导流", "其他"),
                "学生", List.of("收款不履约", "其他")));
        meta.put("forbiddenCategories", ForbiddenCategories.CODES);
        meta.put("cancelReasons", List.of("买家不想要了", "卖家不卖了", "货物与描述不符", "约不上时间", "其他"));
        meta.put("offShelfReasons", List.of(OffShelfReason.REJECTED, OffShelfReason.SELLER_WITHDRAW,
                OffShelfReason.SELLER_OFF, OffShelfReason.ADMIN_OFF, OffShelfReason.CANCEL_NO_TRADE));
        meta.put("conditions", List.of("全新", "九成新", "七成新", "其他"));
        return ApiResponse.ok(meta);
    }
}
