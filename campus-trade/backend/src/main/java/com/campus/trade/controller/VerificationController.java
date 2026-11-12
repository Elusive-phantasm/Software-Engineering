package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.dto.VerificationDtos;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.service.VerificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 学生证核验（学生侧）：UC-02 提交核验申请。
 */
@Tag(name = "02-学生证核验", description = "提交核验、查看核验状态")
@RestController
@RequestMapping("/api/verifications")
@RequiredArgsConstructor
public class VerificationController {

    private final VerificationService verificationService;

    @Operation(summary = "提交 / 重新提交核验申请")
    @PostMapping
    public ApiResponse<Object> submit(@CurrentUser AuthUser user,
                                      @Valid @RequestBody VerificationDtos.SubmitRequest req) {
        return ApiResponse.ok(verificationService.submit(user, req), "核验申请已提交，请等待管理员审核");
    }

    @Operation(summary = "我的核验状态")
    @GetMapping("/mine")
    public ApiResponse<Object> mine(@CurrentUser AuthUser user) {
        return ApiResponse.ok(verificationService.mine(user));
    }
}
