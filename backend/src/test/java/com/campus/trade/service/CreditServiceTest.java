package com.campus.trade.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.campus.trade.audit.AuditService;
import com.campus.trade.config.AppProperties;
import com.campus.trade.entity.CreditRecord;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.CreditRecordMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.util.TimeProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CreditServiceTest {
 @Mock StudentMapper studentMapper; @Mock CreditRecordMapper creditRecordMapper; @Mock NotificationService notificationService; @Mock AuditService auditService; @Mock TimeProvider timeProvider;
 private final AppProperties props=new AppProperties();
 @Test void appliesChangeAndWritesRecord(){ Student s=student(100); when(studentMapper.selectById(7L)).thenReturn(s); when(creditRecordMapper.insert(any(CreditRecord.class))).thenAnswer(i->{i.<CreditRecord>getArgument(0).setId(11L);return 1;}); when(timeProvider.now()).thenReturn(java.time.LocalDateTime.of(2026,1,1,12,0)); var r=new CreditService(studentMapper,creditRecordMapper,notificationService,auditService,timeProvider,props).apply(7L,2,"REVIEW","评价奖励","review:9",9L); assertEquals(2,r.applied()); assertEquals(102,r.score()); assertEquals(11L,r.recordId()); assertEquals(102,s.getCreditScore()); ArgumentCaptor<CreditRecord> c=ArgumentCaptor.forClass(CreditRecord.class); verify(creditRecordMapper).insert(c.capture()); assertEquals("review:9",c.getValue().getSourceKey()); }
 @Test void clampsAtMaximumAndMinimum(){ Student h=student(149); when(studentMapper.selectById(1L)).thenReturn(h); when(creditRecordMapper.insert(any(CreditRecord.class))).thenReturn(1); var svc=new CreditService(studentMapper,creditRecordMapper,notificationService,auditService,timeProvider,props); assertEquals(1,svc.apply(1L,2,"R","x",null,null).applied()); assertEquals(150,h.getCreditScore()); Student l=student(1); when(studentMapper.selectById(2L)).thenReturn(l); assertEquals(-1,svc.violation(2L,"x","v:2").applied()); assertEquals(0,l.getCreditScore()); }
 @Test void duplicateIsIdempotent(){ Student s=student(100); when(studentMapper.selectById(3L)).thenReturn(s); when(creditRecordMapper.selectOne(any(Wrapper.class))).thenReturn(new CreditRecord()); var r=new CreditService(studentMapper,creditRecordMapper,notificationService,auditService,timeProvider,props).apply(3L,-10,"V","重复","same",null); assertTrue(r.duplicated()); assertEquals(100,r.score()); verify(creditRecordMapper,never()).insert(any(CreditRecord.class)); }
 @Test void missingStudentIsNoop(){ when(studentMapper.selectById(99L)).thenReturn(null); var r=new CreditService(studentMapper,creditRecordMapper,notificationService,auditService,timeProvider,props).apply(99L,-10,"V","x",null,null); assertEquals(0,r.applied()); assertEquals(0,r.score()); }
 @Test void zeroEffectiveChangeDoesNotWrite(){ Student s=student(0); when(studentMapper.selectById(4L)).thenReturn(s); var r=new CreditService(studentMapper,creditRecordMapper,notificationService,auditService,timeProvider,props).apply(4L,-10,"V","x",null,null); assertEquals(0,r.applied()); verify(creditRecordMapper,never()).insert(any(CreditRecord.class)); }
 private Student student(int n){Student s=new Student();s.setId(7L);s.setCreditScore(n);return s;}
}
