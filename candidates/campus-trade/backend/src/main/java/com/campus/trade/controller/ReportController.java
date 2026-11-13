package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.dto.SocialDtos;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.service.ReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 举报（学生侧）：UC-12。
 */
@Tag(name = "07-举报", description = "举报违规商品或学生、我的举报")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    @Operation(summary = "提交举报（对象可为商品或学生）")
    @PostMapping("/reports")
    public ApiResponse<Object> submit(@CurrentUser AuthUser user,
                                      @Valid @RequestBody SocialDtos.CreateReportRequest req) {
        return ApiResponse.ok(reportService.submit(user, req), "举报已提交，管理员将在 24 小时内处理");
    }

    @Operation(summary = "我的举报")
    @GetMapping("/me/reports")
    public ApiResponse<Object> mine(@CurrentUser AuthUser user) {
        return ApiResponse.ok(reportService.mine(user));
    }
}
