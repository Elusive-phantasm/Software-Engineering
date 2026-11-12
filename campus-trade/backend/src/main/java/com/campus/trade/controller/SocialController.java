package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.dto.SocialDtos;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.service.MessageService;
import com.campus.trade.service.NotificationService;
import com.campus.trade.service.ProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 私信与通知：UC-29 联系卖家、UC-30 我的私信、UC-18 消息通知、UC-33 个人主页。
 */
@Tag(name = "08-私信与通知", description = "会话、消息、通知、红点、个人主页")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class SocialController {

    private final MessageService messageService;
    private final NotificationService notificationService;
    private final ProfileService profileService;

    @Operation(summary = "我的会话列表（按最后消息时间倒序）")
    @GetMapping("/messages/conversations")
    public ApiResponse<Object> conversations(@CurrentUser AuthUser user) {
        return ApiResponse.ok(messageService.conversations(user));
    }

    @Operation(summary = "会话详情（打开即置本人未读为已读）")
    @GetMapping("/messages/conversations/{productId}/{peerId}")
    public ApiResponse<Object> conversation(@CurrentUser AuthUser user, @PathVariable Long productId,
                                            @PathVariable Long peerId) {
        return ApiResponse.ok(messageService.conversation(user, productId, peerId));
    }

    @Operation(summary = "发送私信（仅已认证学生可发起）")
    @PostMapping("/messages")
    public ApiResponse<Object> send(@CurrentUser AuthUser user, @Valid @RequestBody SocialDtos.SendMessageRequest req) {
        return ApiResponse.ok(messageService.send(user, req.productId(), req.toId(), req.content()), "已发送");
    }

    @Operation(summary = "就管理员违规下架提出异议（自动路由到管理员）")
    @PostMapping("/messages/appeal")
    public ApiResponse<Object> appeal(@CurrentUser AuthUser user,
                                      @Valid @RequestBody SocialDtos.SendMessageRequest req) {
        return ApiResponse.ok(messageService.appeal(user, req.productId(), req.content()), "异议已发送给管理员");
    }

    @Operation(summary = "未读私信数")
    @GetMapping("/messages/unread-count")
    public ApiResponse<Object> unread(@CurrentUser AuthUser user) {
        return ApiResponse.ok(Map.of("unread", messageService.unreadCount(user)));
    }

    @Operation(summary = "消息通知列表")
    @GetMapping("/notifications")
    public ApiResponse<Object> notifications(@CurrentUser AuthUser user,
                                             @RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "30") int size) {
        return ApiResponse.ok(notificationService.list(user, page, size));
    }

    @Operation(summary = "单条通知置已读")
    @PostMapping("/notifications/{id}/read")
    public ApiResponse<Void> read(@CurrentUser AuthUser user, @PathVariable Long id) {
        notificationService.markRead(user, id);
        return ApiResponse.ok();
    }

    @Operation(summary = "通知全部已读")
    @PostMapping("/notifications/read-all")
    public ApiResponse<Void> readAll(@CurrentUser AuthUser user) {
        notificationService.markAllRead(user);
        return ApiResponse.ok();
    }

    @Operation(summary = "红点（通知与私信分别统计）")
    @GetMapping("/badge")
    public ApiResponse<Object> badge(@CurrentUser AuthUser user) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (user == null) {
            result.put("notificationUnread", 0);
            result.put("messageUnread", 0);
            return ApiResponse.ok(result);
        }
        result.put("notificationUnread", notificationService.unreadCount(user.subjectType(), user.subjectId()));
        result.put("messageUnread", messageService.unreadCount(user));
        return ApiResponse.ok(result);
    }

    @Operation(summary = "个人主页（UC-33，游客不可查看）")
    @GetMapping("/students/{id}/profile")
    public ApiResponse<Object> profile(@CurrentUser AuthUser user, @PathVariable Long id) {
        return ApiResponse.ok(profileService.view(user, id));
    }
}
