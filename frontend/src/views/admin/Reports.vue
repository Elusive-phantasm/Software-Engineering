<template>
  <div>
    <div class="flex-between mb">
      <el-radio-group v-model="status" @change="load">
        <el-radio-button value="待处理">待处理</el-radio-button>
        <el-radio-button value="已处理">已处理</el-radio-button>
        <el-radio-button value="已驳回">已驳回</el-radio-button>
      </el-radio-group>
      <el-button size="small" @click="load">刷新</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column prop="id" label="#" width="60" />
      <el-table-column prop="targetType" label="对象" width="70" />
      <el-table-column label="对象名称" min-width="160">
        <template #default="{ row }">{{ row.targetProductTitle || row.targetStudentNickname || '—' }}</template>
      </el-table-column>
      <el-table-column prop="type" label="类型" width="100" />
      <el-table-column prop="reason" label="举报说明" min-width="200" show-overflow-tooltip />
      <el-table-column prop="reporterNickname" label="举报人" width="100" />
      <el-table-column prop="handleStatus" label="状态" width="90">
        <template #default="{ row }"><StatusTag :status="row.handleStatus" /></template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button v-if="row.handleStatus === '待处理'" size="small" type="primary" @click="open(row)">处理</el-button>
          <span v-else class="muted">{{ row.result }}</span>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !items.length" description="没有待处理举报" />

    <el-dialog v-model="dialog" title="处理举报" width="560px">
      <template v-if="current">
        <div class="info">
          <div><b>{{ current.targetType }}</b>：{{ current.targetProductTitle || current.targetStudentNickname }}</div>
          <div class="muted">类型：{{ current.type }} · 举报人：{{ current.reporterNickname }}</div>
          <div class="reason">举报说明：{{ current.reason }}</div>
        </div>
        <el-divider />
        <el-form label-position="top">
          <el-form-item label="判定">
            <el-radio-group v-model="upheld">
              <el-radio :value="true">成立</el-radio>
              <el-radio :value="false">不成立</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="upheld" label="处置手段（至少一项）">
            <el-checkbox-group v-model="actions">
              <el-checkbox v-for="a in current.allowedActions" :key="a" :value="a">{{ a }}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-form-item v-if="upheld && current.targetType === '商品'" label="禁售类目编号（强制下架时必填）">
            <el-select v-model="categoryCode" clearable filterable placeholder="选择类目" style="width: 100%">
              <el-option v-for="(name, code) in forbidden" :key="code" :label="`${code} ${name}`" :value="code" />
            </el-select>
          </el-form-item>
          <el-form-item label="处理结论">
            <el-input v-model="result" type="textarea" :rows="3" maxlength="500" />
          </el-form-item>
        </el-form>
        <el-alert v-if="upheld" type="warning" :closable="false"
                  title="举报成立将自动扣减被举报方信用分 −10，同一举报只扣一次" />
      </template>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">提交处理</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import StatusTag from '../../components/StatusTag.vue';
import { adminApi } from '../../api';

const status = ref('待处理');
const items = ref([]);
const loading = ref(false);
const dialog = ref(false);
const current = ref(null);
const upheld = ref(true);
const actions = ref([]);
const categoryCode = ref('');
const result = ref('');
const forbidden = ref({});

async function load() {
  loading.value = true;
  try {
    items.value = (await adminApi.reports(status.value)).data;
  } finally {
    loading.value = false;
  }
}

function open(row) {
  current.value = row;
  upheld.value = true;
  actions.value = [];
  categoryCode.value = '';
  result.value = '';
  dialog.value = true;
}

async function submit() {
  if (!result.value.trim()) {
    ElMessage.warning('请填写处理结论');
    return;
  }
  if (upheld.value && !actions.value.length) {
    ElMessage.warning('请至少选择一项处置手段');
    return;
  }
  await adminApi.handleReport(current.value.id, {
    upheld: upheld.value,
    actions: upheld.value ? actions.value : [],
    result: result.value.trim(),
    categoryCode: categoryCode.value || null
  });
  ElMessage.success('已处理');
  dialog.value = false;
  load();
}

onMounted(async () => {
  forbidden.value = (await adminApi.forbidden()).data;
  await load();
});
</script>

<style scoped>
.mb { margin-bottom: 12px; }
.info { line-height: 1.8; }
.reason { margin-top: 6px; color: #3c4a44; }
</style>
