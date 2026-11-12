<template>
  <div v-loading="loading">
    <el-row :gutter="14">
      <el-col :span="6" v-for="kpi in kpis" :key="kpi.label">
        <div class="card kpi">
          <div class="label">{{ kpi.label }}</div>
          <div class="value">{{ kpi.value }}</div>
          <div class="hint">{{ kpi.hint }}</div>
        </div>
      </el-col>
    </el-row>

    <div class="card mt16">
      <h3 class="section-title">待处理事项</h3>
      <div class="todos">
        <div class="todo" @click="$router.push('/admin/certs')">
          <el-icon><Postcard /></el-icon>
          学生证待审核 <b>{{ data.students?.pendingCert ?? 0 }}</b>
        </div>
        <div class="todo" @click="$router.push('/admin/products')">
          <el-icon><Goods /></el-icon>
          商品待审核 <b>{{ data.products?.['待审核'] ?? 0 }}</b>
        </div>
        <div class="todo" @click="$router.push('/admin/reports')">
          <el-icon><Warning /></el-icon>
          举报待处理 <b>{{ pendingReports }}</b>
        </div>
        <div class="todo" @click="$router.push('/admin/students')">
          <el-icon><CircleClose /></el-icon>
          封禁账号 <b>{{ data.students?.banned ?? 0 }}</b>
        </div>
      </div>
    </div>

    <div class="card mt16">
      <h3 class="section-title">开发工具（演示用）</h3>
      <div class="dev">
        <el-button size="small" @click="shift(1)">时间 +1 小时</el-button>
        <el-button size="small" @click="shift(24)">时间 +1 天</el-button>
        <el-button size="small" @click="shift(168)">时间 +7 天</el-button>
        <el-button size="small" @click="shift(-168)">时间 −7 天</el-button>
        <el-button size="small" type="warning" @click="runScheduler">执行定时判定</el-button>
        <el-button size="small" @click="resetTime">时间归零</el-button>
        <el-button size="small" type="danger" plain @click="resetData">重置演示数据</el-button>
        <span class="muted">当前偏移 {{ dev.offsetHours }} 小时</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminApi, devApi } from '../../api';

const data = ref({});
const dev = reactive({ offsetHours: 0 });
const loading = ref(false);

const pendingReports = computed(() => 0);

const kpis = computed(() => [
  { label: '学生总数', value: data.value.students?.total ?? 0, hint: `已认证 ${data.value.students?.certified ?? 0}` },
  { label: '在售商品', value: data.value.products?.['在售'] ?? 0, hint: `待审核 ${data.value.products?.['待审核'] ?? 0}` },
  { label: '有效成交', value: data.value.orders?.valid ?? 0, hint: `已撤销 ${data.value.orders?.cancelled ?? 0}` },
  { label: '封禁账号', value: data.value.students?.banned ?? 0, hint: `受限 ${data.value.students?.restricted ?? 0}` }
]);

async function load() {
  loading.value = true;
  try {
    data.value = (await adminApi.dashboard()).data;
    const state = (await devApi.state()).data;
    dev.offsetHours = state.offsetHours;
  } finally {
    loading.value = false;
  }
}

async function shift(hours) {
  const res = await devApi.shift(hours);
  dev.offsetHours = res.data.offsetHours;
  ElMessage.success(`时间已偏移 ${hours} 小时，当前 ${res.data.now}`);
}

async function resetTime() {
  await devApi.resetTime();
  dev.offsetHours = 0;
  ElMessage.success('时间已归零');
}

async function runScheduler() {
  const res = await devApi.runScheduler();
  ElMessage.success(`定时判定已执行：${JSON.stringify(res.data.counts || {})}`);
}

async function resetData() {
  try {
    await ElMessageBox.confirm('将清空并重新灌入演示数据，确定继续？', '重置演示数据', { type: 'warning' });
  } catch {
    return;
  }
  await devApi.reset();
  ElMessage.success('演示数据已重置');
  load();
}

onMounted(load);
</script>

<style scoped>
.kpi { padding: 16px; }
.label { color: var(--muted); font-size: 13px; }
.value { font-size: 30px; font-weight: 800; color: var(--brand); margin: 6px 0 2px; }
.hint { color: var(--muted); font-size: 12px; }
.todos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.todo {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}
.todo:hover { border-color: var(--brand); color: var(--brand); }
.dev { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
