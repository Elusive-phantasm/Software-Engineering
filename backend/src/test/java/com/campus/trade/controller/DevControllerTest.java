package com.campus.trade.controller;

import com.campus.trade.common.BizException;
import com.campus.trade.service.DevService;
import com.campus.trade.service.MailService;
import com.campus.trade.service.SchedulerService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class DevControllerTest {

    @Test
    void everyDevRouteIsBlockedWhenFeatureIsDisabled() {
        DevService dev = mock(DevService.class);
        MailService mail = mock(MailService.class);
        SchedulerService scheduler = mock(SchedulerService.class);
        when(dev.isEnabled()).thenReturn(false);
        DevController controller = new DevController(dev, mail, scheduler);

        assertThrows(BizException.class, controller::reset);
        assertThrows(BizException.class, controller::state);
        assertThrows(BizException.class, () -> controller.shift(java.util.Map.of("hours", 1)));
        assertThrows(BizException.class, controller::resetTime);
        assertThrows(BizException.class, () -> controller.mailbox(20));
        assertThrows(BizException.class, controller::runScheduler);
        verify(dev, times(6)).isEnabled();
        verifyNoMoreInteractions(dev);
        verifyNoInteractions(mail, scheduler);
    }
}
