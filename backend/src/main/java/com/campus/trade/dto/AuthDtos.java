package com.campus.trade.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 账号相关请求体。
 */
public final class AuthDtos {

    public record SendCodeRequest(@NotBlank(message = "请填写邮箱") @Email(message = "邮箱格式不正确") String email) {
    }

    public record RegisterRequest(
            @NotBlank(message = "请填写邮箱") @Email(message = "邮箱格式不正确") String email,
            @NotBlank(message = "请填写验证码") String code,
            @NotBlank(message = "请填写昵称") @Size(max = 20, message = "昵称不得超过 20 个字符") String nickname,
            @NotBlank(message = "请填写真实姓名") @Size(max = 50, message = "真实姓名过长") String realName,
            @NotBlank(message = "请设置登录密码") @Size(min = 8, max = 64, message = "密码长度需为 8～64 位")
            @jakarta.validation.constraints.Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "密码需同时包含字母与数字")
            String password,
            String phone,
            boolean agree
    ) {
    }

    public record LoginRequest(
            @NotBlank(message = "请填写邮箱") @Email(message = "邮箱格式不正确") String email,
            @NotBlank(message = "请填写密码") String password
    ) {
    }

    public record AdminLoginRequest(
            @NotBlank(message = "请填写管理员账号") String adminNo,
            @NotBlank(message = "请填写密码") String password
    ) {
    }

    public record ResetPasswordRequest(
            @NotBlank(message = "请填写邮箱") @Email(message = "邮箱格式不正确") String email,
            @NotBlank(message = "请填写验证码") String code,
            @NotBlank(message = "请设置新密码") @Size(min = 8, max = 64, message = "密码长度需为 8～64 位")
            @jakarta.validation.constraints.Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "密码需同时包含字母与数字")
            String newPassword
    ) {
    }

    public record UpdateProfileRequest(
            @Size(max = 20, message = "昵称不得超过 20 个字符") String nickname,
            String phone, String dorm, String realName) {
    }

    public record ChangePasswordRequest(
            @NotBlank(message = "请填写原密码") String oldPassword,
            @NotBlank(message = "请填写新密码") @Size(min = 8, max = 64, message = "密码长度需为 8～64 位")
            @jakarta.validation.constraints.Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "密码需同时包含字母与数字")
            String newPassword
    ) {
    }
}
