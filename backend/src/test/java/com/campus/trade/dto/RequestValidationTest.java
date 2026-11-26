package com.campus.trade.dto;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void oversizedEditableAndReviewReasonsAreRejected() {
        String oversized = "字".repeat(1000);
        assertFalse(validator.validate(new AuthDtos.UpdateProfileRequest(oversized, null, null, null)).isEmpty());
        assertFalse(validator.validate(new ProductDtos.RejectRequest(oversized, null)).isEmpty());
        assertFalse(validator.validate(new VerificationDtos.RejectRequest(oversized, false)).isEmpty());
        assertFalse(validator.validate(new SocialDtos.CreateReportRequest("商品", 1L, "其他", oversized)).isEmpty());
        assertFalse(validator.validate(new SocialDtos.HandleReportRequest(false, null, oversized, null)).isEmpty());
    }

    @Test
    void orderRequestAcceptsOnlyProductIdAndHasNoClientControlledPriceOrStatus() {
        var fields = TradeDtos.CreateOrderRequest.class.getRecordComponents();
        assertEquals(1, fields.length);
        assertEquals("productId", fields[0].getName());
    }
}
