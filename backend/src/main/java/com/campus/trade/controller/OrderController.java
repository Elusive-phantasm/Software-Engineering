package com.campus.trade.controller;

import com.campus.trade.common.ApiResponse;
import com.campus.trade.dto.TradeDtos;
import com.campus.trade.security.AuthUser;
import com.campus.trade.security.CurrentUser;
import com.campus.trade.service.OrderService;
import com.campus.trade.service.ReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 交易：UC-10 下单成交、UC-14 评价、UC-16 我的订单、UC-31 撤销成交与免责判定。
 */
@Tag(name = "04-交易", description = "下单成交、我的订单、撤销成交、免责判定、评价")
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;
    private final ReviewService reviewService;

    @Operation(summary = "下单成交（创建成交记录 + 商品转已售出，同一事务）")
    @PostMapping("/orders")
    public ApiResponse<Object> create(@CurrentUser AuthUser user,
                                      @Valid @RequestBody TradeDtos.CreateOrderRequest req) {
        return ApiResponse.ok(orderService.create(user, req.productId()), "下单成功，交易已成交");
    }

    @Operation(summary = "我的订单（role=buyer/seller，缺省全部）")
    @GetMapping("/me/orders")
    public ApiResponse<Object> myOrders(@CurrentUser AuthUser user,
                                        @RequestParam(required = false, defaultValue = "all") String role) {
        return ApiResponse.ok(orderService.myOrders(user, role));
    }

    @Operation(summary = "订单详情")
    @GetMapping("/orders/{id}")
    public ApiResponse<Object> detail(@CurrentUser AuthUser user, @PathVariable Long id) {
        return ApiResponse.ok(orderService.detail(user, id));
    }

    @Operation(summary = "撤销成交（单方即时生效，不需对方同意）")
    @PostMapping("/orders/{id}/cancel")
    public ApiResponse<Object> cancel(@CurrentUser AuthUser user, @PathVariable Long id,
                                      @Valid @RequestBody TradeDtos.CancelRequest req) {
        return ApiResponse.ok(orderService.cancel(user, id, req.reason()), "撤销已生效，等待对方在 7 天内判定");
    }

    @Operation(summary = "免责判定（对方判定：已免责 / 计违约）")
    @PostMapping("/orders/{id}/cancel-judgement")
    public ApiResponse<Object> judge(@CurrentUser AuthUser user, @PathVariable Long id,
                                     @Valid @RequestBody TradeDtos.JudgeRequest req) {
        return ApiResponse.ok(orderService.judge(user, id, req.judgement()), "判定已提交");
    }

    @Operation(summary = "提交评价（仅文字，成交后 7 天内）")
    @PostMapping("/orders/{id}/reviews")
    public ApiResponse<Object> review(@CurrentUser AuthUser user, @PathVariable Long id,
                                      @Valid @RequestBody TradeDtos.ReviewRequest req) {
        return ApiResponse.ok(reviewService.submit(user, id, req.content()), "评价已提交");
    }

    @Operation(summary = "我发出的评价")
    @GetMapping("/me/reviews/written")
    public ApiResponse<Object> written(@CurrentUser AuthUser user) {
        return ApiResponse.ok(reviewService.writtenBy(user));
    }

    @Operation(summary = "我收到的评价")
    @GetMapping("/me/reviews/received")
    public ApiResponse<Object> received(@CurrentUser AuthUser user) {
        return ApiResponse.ok(reviewService.receivedBy(user));
    }
}
