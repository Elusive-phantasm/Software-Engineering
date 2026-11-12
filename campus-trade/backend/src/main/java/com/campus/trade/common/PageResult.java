package com.campus.trade.common;

import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.Getter;

import java.util.List;
import java.util.function.Function;

/**
 * 分页响应体。
 */
@Getter
public class PageResult<T> {

    private final long total;
    private final long page;
    private final long pageSize;
    private final List<T> items;

    public PageResult(long total, long page, long pageSize, List<T> items) {
        this.total = total;
        this.page = page;
        this.pageSize = pageSize;
        this.items = items;
    }

    public static <E, T> PageResult<T> of(IPage<E> p, Function<E, T> mapper) {
        return new PageResult<>(p.getTotal(), p.getCurrent(), p.getSize(), p.getRecords().stream().map(mapper).toList());
    }

    public static <T> PageResult<T> of(List<T> items, long total, long page, long pageSize) {
        return new PageResult<>(total, page, pageSize, items);
    }
}
