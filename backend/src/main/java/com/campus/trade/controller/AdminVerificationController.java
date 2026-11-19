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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 学生证审核（管理端）：UC-03 审核学生证、AT-08 事后核实伪造。
 */
@Tag(name = "11-管理端·核验审核", description = "审核队列、通过、驳回、撤销认证")
@RestController
@RequestMapping("/api/admin/verifications")
@RequiredArgsConstructor
public class AdminVerificationController {

    private final VerificationService verificationService;

    @Operation(summary = "核验申请队列")
    @GetMapping
    public ApiResponse<Object> list(@RequestParam(required = false) String status) {
        return ApiResponse.ok(verificationService.list(status));
    }

    @Operation(summary = "读取学生证图片（仅审核管理员，NFR-08）")
    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@CurrentUser AuthUser user, @PathVariable Long id) {
        byte[] bytes = verificationService.image(user, id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(verificationService.imageContentType(id)))
                .header("Cache-Control", "no-store")
                .body(bytes);
    }

    @Operation(summary = "审核通过")
    @PostMapping("/{id}/approve")
    public ApiResponse<Void> approve(@CurrentUser AuthUser user, @PathVariable Long id) {
        verificationService.approve(user, id);
        return ApiResponse.ok(null, "已通过核验");
    }

    @Operation(summary = "审核驳回")
    @PostMapping("/{id}/reject")
    public ApiResponse<Void> reject(@CurrentUser AuthUser user, @PathVariable Long id,
                                    @Valid @RequestBody VerificationDtos.RejectRequest req) {
        verificationService.reject(user, id, req);
        return ApiResponse.ok(null, "已驳回核验申请");
    }

    @Operation(summary = "撤销认证资格（AT-08，事后核实伪造）")
    @PostMapping("/students/{studentId}/revoke")
    public ApiResponse<Void> revoke(@CurrentUser AuthUser user, @PathVariable Long studentId,
                                    @Valid @RequestBody VerificationDtos.RevokeRequest req) {
        verificationService.revokeCertification(user, studentId, req);
        return ApiResponse.ok(null, "已撤销认证资格并封禁账号（AT-08）");
    }
}
