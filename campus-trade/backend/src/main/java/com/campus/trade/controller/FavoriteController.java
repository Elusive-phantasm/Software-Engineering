package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.service.FavoriteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 收藏：UC-09。
 */
@Tag(name = "05-收藏", description = "收藏、取消收藏、我的收藏（已失效标记）")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class FavoriteController {

    private final FavoriteService favoriteService;

    @Operation(summary = "我的收藏")
    @GetMapping("/me/favorites")
    public ApiResponse<Object> mine(@CurrentUser AuthUser user) {
        return ApiResponse.ok(favoriteService.mine(user));
    }

    @Operation(summary = "收藏商品")
    @PostMapping("/favorites")
    public ApiResponse<Void> add(@CurrentUser AuthUser user, @RequestBody Map<String, Long> body) {
        favoriteService.add(user, body.get("productId"));
        return ApiResponse.ok(null, "已收藏");
    }

    @Operation(summary = "取消收藏")
    @DeleteMapping("/favorites/{productId}")
    public ApiResponse<Void> remove(@CurrentUser AuthUser user, @PathVariable Long productId) {
        favoriteService.remove(user, productId);
        return ApiResponse.ok(null, "已取消收藏");
    }
}
