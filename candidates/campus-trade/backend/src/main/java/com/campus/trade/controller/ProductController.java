package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.dto.ProductDtos;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 商品：UC-05 发布、UC-07 搜索、UC-08 分类浏览、UC-11 下架/删除、UC-17 我的商品、UC-32 编辑。
 */
@Tag(name = "03-商品", description = "发布、搜索、分类、详情、编辑、下架、删除、重新提交")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    @Operation(summary = "分类列表（单层，附在售数量）")
    @GetMapping("/categories")
    public ApiResponse<Object> categories() {
        return ApiResponse.ok(productService.categories());
    }

    @Operation(summary = "商品列表 / 搜索（只返回在售）")
    @GetMapping("/products")
    public ApiResponse<Object> list(@CurrentUser AuthUser user, @RequestParam Map<String, String> query) {
        return ApiResponse.ok(productService.list(user, query));
    }

    @Operation(summary = "商品详情（待审核/已下架仅本人与管理员可见）")
    @GetMapping("/products/{id}")
    public ApiResponse<Object> detail(@CurrentUser AuthUser user, @PathVariable Long id) {
        return ApiResponse.ok(productService.detail(user, id, true));
    }

    @Operation(summary = "发布商品（进入待审核）")
    @PostMapping("/products")
    public ApiResponse<Object> create(@CurrentUser AuthUser user, @Valid @RequestBody ProductDtos.SaveRequest req) {
        return ApiResponse.ok(productService.create(user, req), "已提交审核，等待管理员审核");
    }

    @Operation(summary = "编辑商品（在售编辑即回到待审核）")
    @PatchMapping("/products/{id}")
    public ApiResponse<Object> update(@CurrentUser AuthUser user, @PathVariable Long id,
                                      @Valid @RequestBody ProductDtos.SaveRequest req) {
        return ApiResponse.ok(productService.update(user, id, req), "修改已提交，需重新审核");
    }

    @Operation(summary = "撤回（待审核 → 已下架·卖家撤回）")
    @PostMapping("/products/{id}/withdraw")
    public ApiResponse<Object> withdraw(@CurrentUser AuthUser user, @PathVariable Long id) {
        return ApiResponse.ok(productService.withdraw(user, id), "已撤回，商品转为已下架（卖家撤回）");
    }

    @Operation(summary = "下架（在售 → 已下架·卖家主动下架）")
    @PostMapping("/products/{id}/take-down")
    public ApiResponse<Object> takeDown(@CurrentUser AuthUser user, @PathVariable Long id) {
        return ApiResponse.ok(productService.takeDown(user, id), "商品已下架");
    }

    @Operation(summary = "永久删除（仅已下架）")
    @DeleteMapping("/products/{id}")
    public ApiResponse<Void> delete(@CurrentUser AuthUser user, @PathVariable Long id) {
        productService.delete(user, id);
        return ApiResponse.ok(null, "商品已永久删除");
    }

    @Operation(summary = "重新提交（已下架 → 待审核，沿用原编号）")
    @PostMapping("/products/{id}/resubmit")
    public ApiResponse<Object> resubmit(@CurrentUser AuthUser user, @PathVariable Long id,
                                        @RequestBody(required = false) ProductDtos.SaveRequest req) {
        return ApiResponse.ok(productService.resubmit(user, id, req), "已重新提交审核");
    }

    @Operation(summary = "我的商品（按四状态分组）")
    @GetMapping("/me/products")
    public ApiResponse<Object> myProducts(@CurrentUser AuthUser user) {
        return ApiResponse.ok(productService.myProducts(user));
    }
}
