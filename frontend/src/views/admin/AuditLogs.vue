<template>
  <div>
    <div class="flex-between mb">
      <el-input v-model="action" placeholder="按动作筛选（如 order.create）" clearable style="width: 280px" @keyup.enter="load" />
      <el-button size="small" @click="load">刷新</el-button>
    </div>
    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="{ row }">{{ String(row.createdAt).replace('T', ' ').slice(0, 19) }}</template>
      </el-table-column>
      <el-table-column prop="role" label="角色" width="100" />
      <el-table-column prop="actorType" label="主体" width="90" />
      <el-table-column prop="actorId" label="主体 ID" width="90" />
      <el-table-column prop="action" label="动作" width="200" />
      <el-table-column prop="result" label="结果" width="90" />
      <el-table-column prop="reasonCode" label="原因码" width="150" />
      <el-table-column prop="detail" label="详情" min-width="220" show-overflow-tooltip />
    </el-table>
    <el-empty v-if="!loading && !items.length" description="暂无审计记录" />
    <div class="muted mt12">审计不含密码、完整手机号、宿舍地址与学生证图片内容</div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { adminApi } from '../../api';

const items = ref([]);
const action = ref('');
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    items.value = (await adminApi.audit({ limit: 200, action: action.value || undefined })).data;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mb { margin-bottom: 12px; }
</style>
