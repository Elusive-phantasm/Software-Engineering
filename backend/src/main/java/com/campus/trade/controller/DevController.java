package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.common.BizException;
import com.campus.trade.service.DevService;
import com.campus.trade.service.MailService;
import com.campus.trade.service.SchedulerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 开发与演示工具。默认关闭（app.features.enable-dev-tools=false），开启后仍要求管理员身份。
 */
@Tag(name = "99-开发工具", description = "演示数据重置、时间偏移、开发邮箱（默认关闭；显式开启后仍需管理员身份）")
@RestController
@RequestMapping("/api/dev")
@RequiredArgsConstructor
public class DevController {

    private final DevService devService;
    private final MailService mailService;
    private final SchedulerService schedulerService;

    private void assertEnabled() {
        if (!devService.isEnabled()) {
            throw BizException.permission("开发工具已关闭");
        }
        // 纵深防御：即使 SecurityConfig 的路由规则被改动，这里仍要求管理员身份。
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        boolean isAdmin = auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        if (!isAdmin) {
            throw BizException.permission("开发工具仅对管理员开放");
        }
    }

    @Operation(summary = "重置演示数据")
    @PostMapping("/reset")
    public ApiResponse<Object> reset() {
        assertEnabled();
        return ApiResponse.ok(devService.reset(), "演示数据已重置");
    }

    @Operation(summary = "当前状态（时间偏移与各表条数）")
    @GetMapping("/state")
    public ApiResponse<Object> state() {
        // 曾经未受开关保护：它会暴露各表条数与时间偏移，生产环境必须一并收口。
        assertEnabled();
        return ApiResponse.ok(devService.state());
    }

    @Operation(summary = "服务端时间偏移（小时，可为负）")
    @PostMapping("/time-shift")
    public ApiResponse<Object> shift(@RequestBody Map<String, Object> body) {
        assertEnabled();
        double hours = body.get("hours") == null ? 0 : Double.parseDouble(String.valueOf(body.get("hours")));
        return ApiResponse.ok(devService.shiftTime(hours), "时间已偏移");
    }

    @Operation(summary = "时间归零")
    @PostMapping("/time-reset")
    public ApiResponse<Object> resetTime() {
        assertEnabled();
        return ApiResponse.ok(devService.resetTime(), "时间偏移已归零");
    }

    @Operation(summary = "开发邮箱（最近邮件）")
    @GetMapping("/mailbox")
    public ApiResponse<Object> mailbox(@RequestParam(defaultValue = "20") int limit) {
        assertEnabled();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", mailService.recent(Math.min(limit, 100)));
        return ApiResponse.ok(result);
    }

    @Operation(summary = "立即执行一轮定时判定")
    @PostMapping("/scheduler/run")
    public ApiResponse<Object> runScheduler() {
        assertEnabled();
        return ApiResponse.ok(schedulerService.runAll(), "定时判定已执行");
    }
}
