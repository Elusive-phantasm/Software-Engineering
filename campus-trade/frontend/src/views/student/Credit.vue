<template>
  <div class="page">
    <h2 class="section-title">我的信用分</h2>
    <div v-if="credit" class="card score-card">
      <div class="score">{{ credit.score }}</div>
      <div class="score-meta">
        <div>满分 {{ credit.max }} · 初始 {{ credit.initial }}</div>
        <div class="muted">低于 {{ credit.publishThreshold }} 分不可发布新商品；低于 {{ credit.orderThreshold }} 分不可下单</div>
        <div class="mt8">
          <el-tag :type="credit.canPublish ? 'success' : 'danger'">
            {{ credit.canPublish ? '可发布' : '不可发布（信用分不足）' }}
          </el-tag>
          <el-tag :type="credit.canOrder ? 'success' : 'danger'" class="ml8">
            {{ credit.canOrder ? '可下单' : '不可下单（信用分不足）' }}
          </el-tag>
        </div>
      </div>
    </div>

    <h3 class="mt24">变动明细</h3>
    <el-table :data="credit?.records || []" stripe>
      <el-table-column prop="createdAt" label="时间" width="180">
        <template #default="{ row }">{{ String(row.createdAt).replace('T', ' ').slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column prop="eventType" label="事件" width="130" />
      <el-table-column prop="reason" label="原因" />
      <el-table-column prop="delta" label="变动" width="100">
        <template #default="{ row }">
          <span :class="row.delta > 0 ? 'up' : 'down'">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="orderId" label="关联订单" width="110">
        <template #default="{ row }">{{ row.orderId ? '#' + row.orderId : '—' }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-if="credit && !credit.records.length" description="还没有信用变动记录" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { creditApi } from '../../api';

const credit = ref(null);

onMounted(async () => {
  const res = await creditApi.mine();
  credit.value = res.data;
});
</script>

<style scoped>
.score-card {
  display: flex;
  align-items: center;
  gap: 26px;
}
.score {
  font-size: 56px;
  font-weight: 800;
  color: var(--brand);
  line-height: 1;
}
.score-meta {
  font-size: 13px;
  color: #3c4a44;
}
.ml8 { margin-left: 8px; }
.up { color: #2e7d32; font-weight: 600; }
.down { color: #c0392b; font-weight: 600; }
</style>
