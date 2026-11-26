package com.campus.trade.service;

import com.campus.trade.config.AppProperties;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.util.TimeProvider;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.ArgumentMatchers.<Student>isNull;
import static org.mockito.Mockito.*;

class LoginFailureServiceTest {

    @Test
    void failureCounterIsIndependentAndLockedAttemptsDoNotExtendDeadline() throws Exception {
        StudentMapper mapper = mock(StudentMapper.class);
        AppProperties props = mock(AppProperties.class);
        AppProperties.Security security = mock(AppProperties.Security.class);
        TimeProvider time = mock(TimeProvider.class);
        LoginFailureService service = new LoginFailureService(mapper, props, time);
        LocalDateTime now = LocalDateTime.of(2026, 1, 1, 12, 0);
        LocalDateTime lockEnd = now.plusMinutes(8);
        Student locked = new Student();
        locked.setId(3L);
        locked.setFailedLoginCount(5);
        locked.setLockedUntil(lockEnd);
        when(mapper.selectByIdForUpdate(3L)).thenReturn(locked);
        when(time.now()).thenReturn(now);

        service.countFailure(3L);

        verify(mapper, never()).update(isNull(), any());
        assertEquals(lockEnd, locked.getLockedUntil());
        Transactional tx = LoginFailureService.class.getMethod("countFailure", Long.class)
                .getAnnotation(Transactional.class);
        assertEquals(Propagation.REQUIRES_NEW, tx.propagation());
    }

    @Test
    void fifthFailureStoresFifteenMinuteLockInDatabaseUpdate() {
        StudentMapper mapper = mock(StudentMapper.class);
        AppProperties props = mock(AppProperties.class);
        AppProperties.Security security = mock(AppProperties.Security.class);
        TimeProvider time = mock(TimeProvider.class);
        LoginFailureService service = new LoginFailureService(mapper, props, time);
        LocalDateTime now = LocalDateTime.of(2026, 1, 1, 12, 0);
        Student student = new Student();
        student.setId(5L);
        student.setFailedLoginCount(4);
        when(mapper.selectByIdForUpdate(5L)).thenReturn(student);
        when(time.now()).thenReturn(now);
        when(props.getSecurity()).thenReturn(security);
        when(security.getLoginFailLimit()).thenReturn(5);
        when(security.getLockMinutes()).thenReturn(15);

        service.countFailure(5L);

        ArgumentCaptor<LambdaUpdateWrapper> captor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(mapper).update(isNull(), captor.capture());
        assertEquals(5, captor.getValue().getParamNameValuePairs().values().stream()
                .filter(Integer.class::isInstance).map(Integer.class::cast).findFirst().orElseThrow());
        assertTrue(captor.getValue().getParamNameValuePairs().containsValue(now.plusMinutes(15)));
    }
}
