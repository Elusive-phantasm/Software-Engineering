package com.campus.trade.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.campus.trade.audit.AuditService;
import com.campus.trade.constant.CreditEvent;
import com.campus.trade.entity.CreditRecord;
import com.campus.trade.entity.Student;
import com.campus.trade.mapper.CreditRecordMapper;
import com.campus.trade.mapper.StudentMapper;
import com.campus.trade.config.AppProperties;
import com.campus.trade.util.TimeProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 信用分（BR-13 定义与阈值 / BR-14 变动事件）。
 *
 * 两条硬约束：
 * 1) 每次变动必须写一条信用记录，分数与流水同事务；
 * 2) 用「读当前值 → 计算 → 条件更新」在事务内完成，禁止丢失更新；越界按 0～150 截断。
 */
@Service
@RequiredArgsConstructor
public class CreditService {

    private final StudentMapper studentMapper;
    private final CreditRecordMapper creditRecordMapper;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final AppProperties props;

    public record ChangeResult(int applied, int score, Long recordId, boolean duplicated) {
    }

    /**
     * 应用一次信用变动。调用方必须已处于事务中。
     */
    @Transactional
    public ChangeResult apply(Long studentId, int delta, String eventType, String reason,
                              String sourceKey, Long orderId) {
        if (sourceKey != null) {
            CreditRecord dup = creditRecordMapper.selectOne(Wrappers.<CreditRecord>lambdaQuery()
                    .eq(CreditRecord::getSourceKey, sourceKey).last("LIMIT 1"));
            Student current = studentMapper.selectById(studentId);
            if (dup != null) {
                return new ChangeResult(0, current == null ? 0 : current.getCreditScore(), null, true);
            }
        }
        Student s = studentMapper.selectById(studentId);
        if (s == null) {
            return new ChangeResult(0, 0, null, false);
        }
        int before = s.getCreditScore();
        int after = Math.max(props.getCredit().getMin(), Math.min(props.getCredit().getMax(), before + delta));
        int applied = after - before;

        if (applied != 0) {
            s.setCreditScore(after);
            s.setUpdatedAt(timeProvider.now());
            studentMapper.updateById(s);

            CreditRecord rec = new CreditRecord();
            rec.setStudentId(studentId);
            rec.setDelta(applied);
            rec.setEventType(eventType);
            rec.setReason(reason.length() > 200 ? reason.substring(0, 200) : reason);
            rec.setSourceKey(sourceKey);
            rec.setOrderId(orderId);
            rec.setCreatedAt(timeProvider.now());
            creditRecordMapper.insert(rec);

            notificationService.notifyStudent(studentId, "信用", "信用分变动",
                    "你的信用分" + (applied > 0 ? "+" : "") + applied + "，当前 " + after + " 分。原因：" + reason,
                    orderId != null ? "order" : "credit", orderId != null ? orderId : rec.getId(), null, null);
            return new ChangeResult(applied, after, rec.getId(), false);
        }
        return new ChangeResult(0, after, null, false);
    }

    /** BR-14 ②：违规处置 −10（幂等键保证同一事件只扣一次） */
    @Transactional
    public ChangeResult violation(Long studentId, String reason, String sourceKey) {
        return apply(studentId, props.getCredit().getViolationPenalty(), CreditEvent.VIOLATION, reason, sourceKey, null);
    }

    /** UC-15：分数与阈值提示；他人可见分数、不可见明细（§6.5） */
    public com.campus.trade.vo.Views.CreditVo summary(Long studentId, boolean withRecords, String hint) {
        Student s = studentMapper.selectById(studentId);
        if (s == null) {
            return null;
        }
        int score = s.getCreditScore();
        java.util.List<com.campus.trade.vo.Views.CreditRecordVo> records = null;
        if (withRecords) {
            records = creditRecordMapper.selectList(Wrappers.<CreditRecord>lambdaQuery()
                            .eq(CreditRecord::getStudentId, studentId)
                            .orderByDesc(CreditRecord::getCreatedAt)
                            .last("LIMIT 100"))
                    .stream()
                    .map(r -> new com.campus.trade.vo.Views.CreditRecordVo(r.getId(), r.getDelta(),
                            r.getEventType(), r.getReason(), r.getOrderId(), r.getCreatedAt()))
                    .toList();
        }
        return new com.campus.trade.vo.Views.CreditVo(score, props.getCredit().getMin(), props.getCredit().getMax(),
                props.getCredit().getInitial(), props.getCredit().getPublishThreshold(),
                props.getCredit().getOrderThreshold(),
                score >= props.getCredit().getPublishThreshold(),
                score >= props.getCredit().getOrderThreshold(), records, hint);
    }
}
