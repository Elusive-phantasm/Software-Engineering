package com.campus.trade.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.campus.trade.entity.EmailCode;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface EmailCodeMapper extends BaseMapper<EmailCode> {

    @Select("SELECT * FROM email_codes WHERE id = #{id} FOR UPDATE")
    EmailCode selectByIdForUpdate(Long id);
}
