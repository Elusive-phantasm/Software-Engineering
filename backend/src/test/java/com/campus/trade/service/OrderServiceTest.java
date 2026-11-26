package com.campus.trade.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.ProductStatus;
import com.campus.trade.entity.Product;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.*;
import com.campus.trade.security.AuthUser;
import com.campus.trade.util.TimeProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock TradeOrderMapper orderMapper;
    @Mock ProductMapper productMapper;
    @Mock ReviewMapper reviewMapper;
    @Mock StudentMapper studentMapper;
    @Mock FavoriteMapper favoriteMapper;
    @Mock PermissionService permissionService;
    @Mock NotificationService notificationService;
    @Mock CreditService creditService;
    @Mock AuditService auditService;
    @Mock TimeProvider timeProvider;
    @Spy @InjectMocks OrderService service;

    private final AppProperties props = new AppProperties();
    private final AuthUser buyerUser = new AuthUser("student", 2L, "student");

    @BeforeEach
    void setUp() {
        service = spy(new OrderService(orderMapper, productMapper, reviewMapper, studentMapper,
                favoriteMapper, permissionService, notificationService, creditService,
                auditService, timeProvider, props));

    }

    @Test
    void rejectsBuyingOwnProduct() {
        Student buyer = student(2L, 100);
        Product product = product(8L, 2L, ProductStatus.ON_SALE);
        when(permissionService.requireOrderRights(buyerUser)).thenReturn(buyer);
        when(productMapper.selectById(8L)).thenReturn(product);

        BizException ex = assertThrows(BizException.class, () -> service.create(buyerUser, 8L));
        assertEquals("不能购买自己发布的商品", ex.getMessage());
        verify(productMapper, never()).update(any(), any());
    }

    @Test
    void rejectsUnavailableProduct() {
        Student buyer = student(2L, 100);
        when(permissionService.requireOrderRights(buyerUser)).thenReturn(buyer);
        when(productMapper.selectById(8L)).thenReturn(product(8L, 3L, ProductStatus.OFF_SHELF));

        BizException ex = assertThrows(BizException.class, () -> service.create(buyerUser, 8L));
        assertEquals("该商品不可购买", ex.getMessage());
        verify(orderMapper, never()).insert(any(com.campus.trade.entity.TradeOrder.class));
    }

    @Test
    void returnsExistingOrderForRepeatedSoldRequest() {
        Student buyer = student(2L, 100);
        Product product = product(8L, 3L, ProductStatus.SOLD);
        when(permissionService.requireOrderRights(buyerUser)).thenReturn(buyer);
        when(productMapper.selectById(8L)).thenReturn(product);
        var existing = new com.campus.trade.entity.TradeOrder(); existing.setId(22L);        when(orderMapper.selectOne(any(Wrapper.class))).thenReturn(existing);
        doReturn(null).when(service).detail(any(), eq(22L));

        assertNull(service.create(buyerUser, 8L));
        verify(productMapper, never()).update(any(), any());
        verify(orderMapper, never()).insert(any(com.campus.trade.entity.TradeOrder.class));
    }

    private Student student(Long id, int score) { Student s = new Student(); s.setId(id); s.setCreditScore(score); return s; }
    private Product product(Long id, Long sellerId, String status) {
        Product p = new Product(); p.setId(id); p.setSellerId(sellerId); p.setStatus(status); p.setPriceCents(1250); p.setTitle("教材"); return p;
    }
}





