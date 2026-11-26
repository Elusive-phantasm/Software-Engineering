package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.config.AppProperties;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.util.TimeProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** Commits student login failure counters independently from the authentication response. */
@Service
@RequiredArgsConstructor
public class LoginFailureService {

    private final StudentMapper studentMapper;
    private final AppProperties props;
    private final TimeProvider timeProvider;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void countFailure(Long studentId) {
        Student student = studentMapper.selectByIdForUpdate(studentId);
        if (student == null) {
            return;
        }
        LocalDateTime now = timeProvider.now();
        int current = student.getFailedLoginCount() == null ? 0 : student.getFailedLoginCount();
        LocalDateTime lockedUntil = student.getLockedUntil();
        if (lockedUntil != null && lockedUntil.isAfter(now)) {
            return; // A concurrent request may have passed the initial lock check; never extend the lock.
        }
        if (lockedUntil != null && !lockedUntil.isAfter(now)) {
            current = 0;
            lockedUntil = null;
        }
        int next = current + 1;
        LocalDateTime nextLock = next >= props.getSecurity().getLoginFailLimit()
                ? now.plusMinutes(props.getSecurity().getLockMinutes()) : lockedUntil;
        studentMapper.update(null, Wrappers.<Student>lambdaUpdate()
                .eq(Student::getId, studentId)
                .set(Student::getFailedLoginCount, next)
                .set(Student::getLockedUntil, nextLock)
                .set(Student::getUpdatedAt, now));
    }
}
