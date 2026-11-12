package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.config.AppProperties;
import com.campus.trade.dto.AuthDtos;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.security.TokenAuthenticationFilter;
import com.campus.trade.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;

/**
 * 账号与登录接口：UC-01 / UC-04 / UC-34、个人资料维护。
 */
@Tag(name = "01-认证与账号", description = "注册、登录、找回密码、个人资料")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final AppProperties props;

    @Operation(summary = "发送注册验证码")
    @PostMapping("/send-code")
    public ApiResponse<Void> sendCode(@Valid @RequestBody AuthDtos.SendCodeRequest req) {
        authService.sendRegisterCode(req.email());
        return ApiResponse.ok(null, "验证码已发送，请查收邮箱");
    }

    @Operation(summary = "注册")
    @PostMapping("/register")
    public ApiResponse<Object> register(@Valid @RequestBody AuthDtos.RegisterRequest req) {
        return ApiResponse.ok(authService.register(req), "注册成功，请提交学生证核验");
    }

    @Operation(summary = "学生登录")
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Object>> login(@Valid @RequestBody AuthDtos.LoginRequest req,
                                                    HttpServletRequest request) {
        var result = authService.loginStudent(req, clientIp(request), request.getHeader("User-Agent"));
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie(result.token()).toString())
                .body(ApiResponse.ok(result, "登录成功"));
    }

    @Operation(summary = "退出登录")
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(HttpServletRequest request) {
        authService.logout(extractToken(request));
        ResponseCookie cookie = ResponseCookie.from(TokenAuthenticationFilter.COOKIE_NAME, "")
                .path("/").maxAge(Duration.ZERO).httpOnly(true).sameSite("Lax").build();
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(ApiResponse.ok(null, "已退出登录"));
    }

    @Operation(summary = "当前登录态")
    @GetMapping("/me")
    public ApiResponse<Object> me(@CurrentUser AuthUser user) {
        Object me = authService.me(user);
        return ApiResponse.ok(me == null ? java.util.Map.of("kind", "guest") : java.util.Map.of(
                "kind", user.isAdmin() ? "admin" : "student", "profile", me));
    }

    @Operation(summary = "管理员登录")
    @PostMapping("/admin/login")
    public ResponseEntity<ApiResponse<Object>> adminLogin(@Valid @RequestBody AuthDtos.AdminLoginRequest req,
                                                         HttpServletRequest request) {
        var result = authService.loginAdmin(req, clientIp(request), request.getHeader("User-Agent"));
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie(result.token()).toString())
                .body(ApiResponse.ok(result, "登录成功"));
    }

    @Operation(summary = "管理员修改密码")
    @PostMapping("/admin/change-password")
    public ApiResponse<Void> changeAdminPassword(@CurrentUser AuthUser user,
                                                 @Valid @RequestBody AuthDtos.ChangePasswordRequest req) {
        authService.changeAdminPassword(user, req);
        return ApiResponse.ok(null, "密码已修改");
    }

    @Operation(summary = "找回密码：发送验证码（防账号枚举，提示恒定）")
    @PostMapping("/forgot/send-code")
    public ApiResponse<Void> forgotSendCode(@Valid @RequestBody AuthDtos.SendCodeRequest req) {
        authService.forgotSendCode(req.email());
        return ApiResponse.ok(null, "若该邮箱已注册，验证码已发送，请查收");
    }

    @Operation(summary = "找回密码：重置")
    @PostMapping("/forgot/reset")
    public ApiResponse<Void> resetPassword(@Valid @RequestBody AuthDtos.ResetPasswordRequest req) {
        authService.resetPassword(req);
        return ApiResponse.ok(null, "密码已重置，请用新密码登录");
    }

    @Operation(summary = "修改个人资料")
    @PatchMapping("/me/profile")
    public ApiResponse<Object> updateProfile(@CurrentUser AuthUser user,
                                             @RequestBody AuthDtos.UpdateProfileRequest req) {
        return ApiResponse.ok(authService.updateProfile(user, req), "资料已更新");
    }

    private ResponseCookie cookie(String token) {
        return ResponseCookie.from(TokenAuthenticationFilter.COOKIE_NAME, token)
                .path("/")
                .httpOnly(true)
                .sameSite("Lax")
                .maxAge(Duration.ofHours(props.getSecurity().getSessionTtlHours()))
                .build();
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7).trim();
        }
        if (request.getCookies() != null) {
            for (var c : request.getCookies()) {
                if (TokenAuthenticationFilter.COOKIE_NAME.equals(c.getName())) {
                    return c.getValue();
                }
            }
        }
        return null;
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded != null ? forwarded.split(",")[0].trim() : request.getRemoteAddr();
    }
}
