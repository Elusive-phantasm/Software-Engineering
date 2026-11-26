package com.campus.trade.config;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.common.ErrorCode;
import com.campus.trade.security.TokenAuthenticationFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

import java.nio.charset.StandardCharsets;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final TokenAuthenticationFilter tokenFilter;
    private final ObjectMapper objectMapper;
    private final CorsConfigurationSource corsConfigurationSource;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // 公开：注册登录、找回密码、接口文档、静态资源
                .requestMatchers("/api/auth/**", "/v3/api-docs/**", "/swagger-ui/**",
                                 "/swagger-ui.html", "/uploads/**", "/error").permitAll()
                // 开发/演示工具不再匿名开放：开关（app.features.enable-dev-tools，默认关闭）之外
                // 再加管理员角色，避免开关被误开时把整库重置能力暴露给游客。
                .requestMatchers("/api/dev/**").hasRole("ADMIN")
                // 公开：商品浏览与分类（游客可看，SRS §5.2）
                .requestMatchers(HttpMethod.GET, "/api/categories", "/api/products", "/api/products/*",
                                 "/api/products/*/reviews", "/api/students/*/profile").permitAll()
                // 管理端整体要求管理员角色
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/**").authenticated()
                .anyRequest().permitAll())
            .exceptionHandling(e -> e
                .authenticationEntryPoint((req, res, ex) -> write(res, ErrorCode.UNAUTHORIZED))
                .accessDeniedHandler((req, res, ex) -> write(res, ErrorCode.FORBIDDEN)))
            .addFilterBefore(tokenFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private void write(jakarta.servlet.http.HttpServletResponse res, ErrorCode code) throws java.io.IOException {
        res.setStatus(code.getStatus().value());
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.getWriter().write(objectMapper.writeValueAsString(ApiResponse.fail(code.getCode(), code.getMessage())));
    }
}
