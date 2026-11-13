package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.constant.ForbiddenCategories;
import com.campus.trade.dto.ProductDtos;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 商品审核（管理端）：UC-06 审核商品、ST-07 强制下架、ST-09 撤销处置。
 */
@Tag(name = "12-管理端·商品审核", description = "审核队列、通过、驳回、强制下架、撤销处置")
@RestController
@RequestMapping("/api/admin/products")
@RequiredArgsConstructor
public class AdminProductController {

    private final ProductService productService;

    @Operation(summary = "商品审核队列 / 全量检索")
    @GetMapping
    public ApiResponse<Object> list(@RequestParam(required = false) String status,
                                    @RequestParam(required = false) String keyword) {
        boolean blankStatus = status == null || status.isBlank();
        boolean blankKeyword = keyword == null || keyword.isBlank();
        if (blankStatus && blankKeyword) {
            return ApiResponse.ok(productService.pendingProducts());
        }
        return ApiResponse.ok("待审核".equals(status) && blankKeyword
                ? productService.pendingProducts()
                : productService.adminList(status, keyword));
    }

    @Operation(summary = "审核通过（待审核 → 在售）")
    @PostMapping("/{id}/approve")
    public ApiResponse<Void> approve(@CurrentUser AuthUser user, @PathVariable Long id) {
        productService.approve(user, id);
        return ApiResponse.ok(null, "审核通过，商品已上架");
    }

    @Operation(summary = "审核拒绝（必须引用 §4.3 类目编号）")
    @PostMapping("/{id}/reject")
    public ApiResponse<Void> reject(@CurrentUser AuthUser user, @PathVariable Long id,
                                    @Valid @RequestBody ProductDtos.RejectRequest req) {
        productService.reject(user, id, req);
        return ApiResponse.ok(null, "已驳回，商品转为已下架（审核不通过）");
    }

    @Operation(summary = "强制下架（违规处置，扣 −10）")
    @PostMapping("/{id}/force-off")
    public ApiResponse<Void> forceOff(@CurrentUser AuthUser user, @PathVariable Long id,
                                      @Valid @RequestBody ProductDtos.ForceOffRequest req) {
        productService.forceOff(user, id, req);
        return ApiResponse.ok(null, "已强制下架并扣信用分");
    }

    @Operation(summary = "撤销违规处置（已下架 → 在售，扣分不回滚）")
    @PostMapping("/{id}/restore")
    public ApiResponse<Void> restore(@CurrentUser AuthUser user, @PathVariable Long id,
                                     @Valid @RequestBody ProductDtos.RestoreRequest req) {
        productService.restore(user, id, req.reason());
        return ApiResponse.ok(null, "已撤销违规处置，商品恢复在售");
    }

    @Operation(summary = "§4.3 禁售类目清单（18 类闭集）")
    @GetMapping("/forbidden-categories")
    public ApiResponse<Map<String, String>> forbiddenCategories() {
        return ApiResponse.ok(new LinkedHashMap<>(ForbiddenCategories.CODES));
    }
}
