<template>
  <div class="page">
    <h2 class="section-title">我的举报</h2>
    <div v-if="items.length" class="list">
      <div v-for="r in items" :key="r.id" class="card">
        <div class="flex-between">
          <div>
            <el-tag size="small" type="info">{{ r.targetType }}</el-tag>
            <span class="title">{{ r.targetProductTitle || r.targetStudentNickname || '—' }}</span>
            <el-tag size="small" class="ml8">{{ r.type }}</el-tag>
          </div>
          <StatusTag :status="r.handleStatus" />
        </div>
        <div class="muted mt8">举报说明：{{ r.reason }}</div>
        <div v-if="r.result" class="result mt8">处理结果：{{ r.result }}</div>
        <div class="muted mt8">提交时间 {{ String(r.createdAt).replace('T', ' ').slice(0, 16) }}</div>
      </div>
    </div>
    <el-empty v-else description="还没有提交过举报" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import StatusTag from '../../components/StatusTag.vue';
import { socialApi } from '../../api';

const items = ref([]);

onMounted(async () => {
  const res = await socialApi.myReports();
  items.value = res.data;
});
</script>

<style scoped>
.list { display: flex; flex-direction: column; gap: 12px; }
.title { font-weight: 600; margin-left: 8px; }
.ml8 { margin-left: 8px; }
.result { color: #2e7d32; font-size: 13px; }
</style>
