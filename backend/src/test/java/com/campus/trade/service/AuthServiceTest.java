package com.campus.trade.service;

import com.campus.trade.audit.AuditService;
import com.campus.trade.common.BizException;
import com.campus.trade.common.ErrorCode;
import com.campus.trade.config.AppProperties;
import com.campus.trade.constant.AccountStatus;
import com.campus.trade.dto.AuthDtos;
import com.campus.trade.entity.Admin;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.AdminMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.security.TokenService;
import com.campus.trade.util.TimeProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock StudentMapper studentMapper;
    @Mock AdminMapper adminMapper;
    @Mock PasswordEncoder passwordEncoder;
    @Mock EmailCodeService emailCodeService;
    @Mock MailService mailService;
    @Mock TokenService tokenService;
    @Mock NotificationService notificationService;
    @Mock AuditService auditService;
    @Mock TimeProvider timeProvider;
    @Mock AppProperties props;
    @Mock LoginFailureService loginFailureService;
    @InjectMocks AuthService service;

    @Test
    void bannedStudentLoginUsesSrsStatusCodeAndMessageAndDoesNotCreateSession() {
        Student student = new Student();
        student.setId(7L);
        student.setEmail("student@example.edu");
        student.setPasswordHash("hash");
        student.setAccountStatus(AccountStatus.BANNED);
        when(studentMapper.selectOne(any())).thenReturn(student);
        when(timeProvider.now()).thenReturn(java.time.LocalDateTime.now());
        when(passwordEncoder.matches("secret", "hash")).thenReturn(true);

        BizException exception = assertThrows(BizException.class, () -> service.loginStudent(
                new AuthDtos.LoginRequest("student@example.edu", "secret"), "127.0.0.1", "test"));
        assertEquals(ErrorCode.ACCOUNT_BANNED, exception.getErrorCode());
        assertEquals(1004, exception.getErrorCode().getCode());
        assertEquals("账号已封禁，不可发布与下单", exception.getMessage());
        verifyNoInteractions(tokenService);
    }

    @Test
    void wrongPasswordDelegatesCounterToIndependentService() {
        Student student = new Student();
        student.setId(8L);
        student.setEmail("student@example.edu");
        student.setPasswordHash("hash");
        when(studentMapper.selectOne(any())).thenReturn(student);
        when(timeProvider.now()).thenReturn(java.time.LocalDateTime.now());
        when(passwordEncoder.matches("wrong", "hash")).thenReturn(false);

        assertThrows(BizException.class, () -> service.loginStudent(
                new AuthDtos.LoginRequest("student@example.edu", "wrong"), "127.0.0.1", "device-b"));
        verify(loginFailureService).countFailure(8L);
    }

    @Test
    void successfulStudentLoginResetsFailureStateEvenIfTheReadWasStale() {
        Student student = new Student();
        student.setId(9L);
        student.setEmail("student@example.edu");
        student.setPasswordHash("hash");
        student.setCertStatus("未提交");
        student.setFailedLoginCount(0); // A failure may have committed on another device after this read.
        when(studentMapper.selectOne(any())).thenReturn(student);
        when(passwordEncoder.matches("correct", "hash")).thenReturn(true);
        when(tokenService.create("student", 9L, "127.0.0.1", "device-a")).thenReturn("token");
        when(timeProvider.now()).thenReturn(java.time.LocalDateTime.now());
        AppProperties.Features features = new AppProperties.Features();
        features.setLoginSuccessNotification(false);
        when(props.getFeatures()).thenReturn(features);

        service.loginStudent(new AuthDtos.LoginRequest("student@example.edu", "correct"), "127.0.0.1", "device-a");

        verify(studentMapper).update(isNull(), any());
        assertEquals(0, student.getFailedLoginCount());
        assertNull(student.getLockedUntil());
    }

    @Test
    void adminPasswordChangeRevokesAllAdminSessions() {
        Admin admin = new Admin();
        admin.setId(12L);
        admin.setPasswordHash("old-hash");
        when(adminMapper.selectById(12L)).thenReturn(admin);
        when(passwordEncoder.matches("old-password", "old-hash")).thenReturn(true);
        when(passwordEncoder.matches("NewPassword2", "old-hash")).thenReturn(false);
        when(passwordEncoder.encode("NewPassword2")).thenReturn("new-hash");

        service.changeAdminPassword(new com.campus.trade.security.AuthUser("admin", 12L, "管理员"),
                new AuthDtos.ChangePasswordRequest("old-password", "NewPassword2"));
        verify(tokenService).revokeAll("admin", 12L);
    }

    @Test
    void resettingPasswordDoesNotChangeBannedAccountStatus() {
        Student student = new Student();
        student.setId(21L);
        student.setEmail("banned@example.edu");
        student.setPasswordHash("old-hash");
        student.setAccountStatus(AccountStatus.BANNED);
        com.campus.trade.entity.EmailCode code = new com.campus.trade.entity.EmailCode();
        when(studentMapper.selectOne(any())).thenReturn(student);
        when(emailCodeService.verify("banned@example.edu", "RESET", "123456")).thenReturn(code);
        when(passwordEncoder.matches("NewPassword2", "old-hash")).thenReturn(false);
        when(passwordEncoder.encode("NewPassword2")).thenReturn("new-hash");

        service.resetPassword(new AuthDtos.ResetPasswordRequest("banned@example.edu", "123456", "NewPassword2"));

        assertEquals(AccountStatus.BANNED, student.getAccountStatus());
        verify(studentMapper).updateById(student);
    }
}
