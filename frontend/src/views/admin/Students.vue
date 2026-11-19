<template>
  <div>
    <div class="flex-between mb">
      <div class="filters">
        <el-input v-model="keyword" placeholder="昵称 / 邮箱 / 学号" clearable style="width: 220px" @keyup.enter="load" />
        <el-select v-model="certStatus" placeholder="认证状态" clearable style="width: 130px" @change="load">
          <el-option v-for="s in ['未提交', '待审核', '已认证', '已驳回']" :key="s" :label="s" :value="s" />
        </el-select>
        <el-select v-model="accountStatus" placeholder="账号状态" clearable style="width: 120px" @change="load">
          <el-option v-for="s in ['正常', '受限', '封禁']" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button size="small" @click="load">查询</el-button>
      </div>
      <el-button size="small" @click="load">刷新</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column prop="id" label="#" width="60" />
      <el-table-column prop="nickname" label="昵称" width="110" />
      <el-table-column prop="email" label="邮箱" width="190" />
      <el-table-column prop="studentNo" label="学号" width="110" />
      <el-table-column prop="certStatus" label="认证" width="90" />
      <el-table-column prop="accountStatus" label="账号" width="80" />
      <el-table-column prop="creditScore" label="信用分" width="90" />
      <el-table-column prop="verifiedDisputeCount" label="争议数" width="80" />
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" @click="detail(row)">详情</el-button>
          <el-button size="small" type="warning" plain @click="openStatus(row)">账号处置</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 详情 -->
    <el-drawer v-model="drawer" title="学生详情（读取联系方式会写入审计）" size="520px">
      <template v-if="current">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="昵称">{{ current.nickname }}</el-descriptions-item>
          <el-descriptions-item label="真实姓名">{{ current.realName }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ current.email }}</el-descriptions-item>
          <el-descriptions-item label="学号">{{ current.studentNo || '—' }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ current.phone || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="宿舍地址">{{ current.dorm || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="认证状态">{{ current.certStatus }}</el-descriptions-item>
          <el-descriptions-item label="账号状态">{{ current.accountStatus }}</el-descriptions-item>
          <el-descriptions-item label="信用分">{{ current.credit?.score }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="mt16">商品（{{ current.products?.length || 0 }}）</h4>
        <div v-for="p in current.products || []" :key="p.id" class="prod">
          <span>#{{ p.id }} {{ p.title }}</span>
          <StatusTag :status="p.status" />
        </div>
        <h4 class="mt16">信用记录</h4>
        <div v-for="r in current.credit?.records || []" :key="r.id" class="rec">
          {{ String(r.createdAt).replace('T', ' ').slice(0, 16) }} · {{ r.reason }}
          <span :class="r.delta > 0 ? 'up' : 'down'">{{ r.delta > 0 ? '+' : '' }}{{ r.delta }}</span>
        </div>
      </template>
    </el-drawer>

    <!-- 账号处置 -->
    <el-dialog v-model="statusDialog" title="账号处置" width="480px">
      <el-form label-position="top">
        <el-form-item label="目标账号">{{ current?.nickname }}</el-form-item>
        <el-form-item label="账号状态">
          <el-radio-group v-model="targetStatus">
            <el-radio-button value="正常">正常</el-radio-button>
            <el-radio-button value="受限">受限</el-radio-button>
            <el-radio-button value="封禁">封禁</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="处理理由">
          <el-input v-model="reason" type="textarea" :rows="3" maxlength="200" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="deduct">同时扣减信用分 −10</el-checkbox>
        </el-form-item>
      </el-form>
      <el-alert v-if="targetStatus === '封禁'" type="warning" :closable="false"
                title="封禁将在同一处置动作中下架其在售与待审核商品（ST-13），且不改变认证状态（BR-19）" />
      <template #footer>
        <el-button @click="statusDialog = false">取消</el-button>
        <el-button type="danger" @click="submitStatus">确认处置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import StatusTag from '../../components/StatusTag.vue';
import { adminApi } from '../../api';

const items = ref([]);
const loading = ref(false);
const keyword = ref('');
const certStatus = ref('');
const accountStatus = ref('');

const drawer = ref(false);
const statusDialog = ref(false);
const current = ref(null);
const targetStatus = ref('正常');
const reason = ref('');
const deduct = ref(false);

async function load() {
  loading.value = true;
  try {
    items.value = (await adminApi.students({
      keyword: keyword.value || undefined,
      certStatus: certStatus.value || undefined,
      accountStatus: accountStatus.value || undefined
    })).data;
  } finally {
    loading.value = false;
  }
}

async function detail(row) {
  current.value = (await adminApi.student(row.id)).data;
  drawer.value = true;
}

function openStatus(row) {
  current.value = row;
  targetStatus.value = '正常';
  reason.value = '';
  deduct.value = false;
  statusDialog.value = true;
}

async function submitStatus() {
  if (!reason.value.trim()) {
    ElMessage.warning('请填写处理理由');
    return;
  }
  const res = await adminApi.accountStatus(current.value.id, {
    status: targetStatus.value,
    reason: reason.value.trim(),
    deductCredit: deduct.value
  });
  ElMessage.success(`已处置，联线下架 ${res.data.offShelf} 件商品`);
  statusDialog.value = false;
  load();
}

onMounted(load);
</script>

<style scoped>
.mb { margin-bottom: 12px; }
.filters { display: flex; gap: 8px; align-items: center; }
.prod { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed var(--border); }
.rec { font-size: 13px; padding: 4px 0; color: #3c4a44; }
.up { color: #2e7d32; }
.down { color: #c0392b; }
.mt16 { margin-top: 16px; }
</style>
