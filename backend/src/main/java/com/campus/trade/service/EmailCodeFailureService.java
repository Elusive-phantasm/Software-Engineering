package com.campus.trade.service;

import com.campus.trade.entity.EmailCode;
import com.campus.trade.mapper.EmailCodeMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class EmailCodeFailureService {

    private final EmailCodeMapper codeMapper;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(Long codeId, int maxFails) {
        EmailCode code = codeMapper.selectByIdForUpdate(codeId);
        if (code == null || code.getUsed() == null || code.getUsed() != 0) {
            return;
        }
        int fails = (code.getFailCount() == null ? 0 : code.getFailCount()) + 1;
        code.setFailCount(fails);
        if (fails >= maxFails) {
            code.setUsed(1);
        }
        codeMapper.updateById(code);
    }
}
