<template>
  <div>
    <div class="flex-between mb">
      <el-radio-group v-model="status" @change="load">
        <el-radio-button v-for="s in statuses" :key="s" :value="s">{{ s }}</el-radio-button>
      </el-radio-group>
      <el-button size="small" @click="load">刷新</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column label="商品" min-width="220">
        <template #default="{ row }">
          <div class="cell">
            <img v-if="row.images?.length" :src="row.images[0]" class="thumb" />
            <div>
              <div class="title">{{ row.title }}</div>
              <div class="muted">¥{{ row.price }} · {{ row.condition }} · {{ row.categoryName }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="seller.nickname" label="卖家" width="100" />
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }"><StatusTag :status="row.status" /></template>
      </el-table-column>
      <el-table-column prop="publishedAt" label="提交时间" width="150">
        <template #default="{ row }">{{ String(row.publishedAt).replace('T', ' ').slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column prop="reviewNote" label="审核说明" min-width="160">
        <template #default="{ row }"><span class="muted">{{ row.reviewNote || '—' }}</span></template>
      </el-table-column>
      <el-table-column label="操作" width="270">
        <template #default="{ row }">
          <el-button size="small" @click="preview(row)">详情</el-button>
          <template v-if="row.status === '待审核'">
            <el-button size="small" type="success" @click="approve(row)">通过</el-button>
            <el-button size="small" type="danger" @click="openReject(row)">驳回</el-button>
          </template>
          <template v-else-if="row.status === '在售'">
            <el-button size="small" type="danger" plain @click="openForceOff(row)">强制下架</el-button>
          </template>
          <template v-else-if="row.status === '已下架' && row.offShelfReason === '管理员违规下架'">
            <el-button size="small" type="warning" @click="openRestore(row)">撤销处置</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !items.length" description="暂无商品" />

    <!-- 详情 -->
    <el-dialog v-model="previewDialog" title="商品详情" width="620px">
      <template v-if="current">
        <h3>{{ current.title }}</h3>
        <div class="muted">¥{{ current.price }} · {{ current.condition }} · 卖家 {{ current.seller?.nickname }}</div>
        <p class="desc">{{ current.description }}</p>
        <div class="imgs">
          <img v-for="(img, i) in current.images || []" :key="i" :src="img" />
        </div>
      </template>
    </el-dialog>

    <!-- 驳回 -->
    <el-dialog v-model="rejectDialog" title="审核不通过" width="520px">
      <el-alert type="info" :closable="false" class="mb"
                title="必须引用 §4.3 禁售品类清单中的类目编号，否则无法提交（BR-04）" />
      <el-form label-position="top">
        <el-form-item label="禁售类目编号">
          <el-select v-model="categoryCode" filterable placeholder="选择类目" style="width: 100%">
            <el-option v-for="(name, code) in forbidden" :key="code" :label="`${code} ${name}`" :value="code" />
          </el-select>
        </el-form-item>
        <el-form-item label="驳回原因">
          <el-input v-model="reason" type="textarea" :rows="3" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialog = false">取消</el-button>
        <el-button type="danger" @click="submitReject">确认驳回</el-button>
      </template>
    </el-dialog>

    <!-- 强制下架 -->
    <el-dialog v-model="forceDialog" title="强制下架（违规处置）" width="520px">
      <el-alert type="warning" :closable="false" class="mb" title="将同时扣减卖家信用分 −10（BR-14 ②）" />
      <el-form label-position="top">
        <el-form-item label="禁售类目编号">
          <el-select v-model="categoryCode" filterable placeholder="选择类目" style="width: 100%">
            <el-option v-for="(name, code) in forbidden" :key="code" :label="`${code} ${name}`" :value="code" />
          </el-select>
        </el-form-item>
        <el-form-item label="处置理由">
          <el-input v-model="reason" type="textarea" :rows="3" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="forceDialog = false">取消</el-button>
        <el-button type="danger" @click="submitForceOff">确认下架</el-button>
      </template>
    </el-dialog>

    <!-- 撤销处置 -->
    <el-dialog v-model="restoreDialog" title="撤销违规处置" width="480px">
      <el-alert type="info" :closable="false" class="mb" title="商品将恢复在售；已扣信用分不回滚（SC-05）" />
      <el-input v-model="reason" type="textarea" :rows="3" maxlength="200" placeholder="复核结论" />
      <template #footer>
        <el-button @click="restoreDialog = false">取消</el-button>
        <el-button type="primary" @click="submitRestore">确认恢复</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import StatusTag from '../../components/StatusTag.vue';
import { adminApi } from '../../api';

const statuses = ['待审核', '在售', '已售出', '已下架'];
const status = ref('待审核');
const items = ref([]);
const loading = ref(false);
const forbidden = ref({});

const previewDialog = ref(false);
const rejectDialog = ref(false);
const forceDialog = ref(false);
const restoreDialog = ref(false);

const current = ref(null);
const reason = ref('');
const categoryCode = ref('');

async function load() {
  loading.value = true;
  try {
    items.value = (await adminApi.products({ status: status.value })).data;
  } finally {
    loading.value = false;
  }
}

function preview(row) {
  current.value = row;
  previewDialog.value = true;
}

async function approve(row) {
  await adminApi.approveProduct(row.id);
  ElMessage.success('已通过，商品上架');
  load();
}

function openReject(row) {
  current.value = row;
  reason.value = '';
  categoryCode.value = '';
  rejectDialog.value = true;
}

async function submitReject() {
  if (!categoryCode.value) {
    ElMessage.warning('请选择禁售类目编号');
    return;
  }
  if (!reason.value.trim()) {
    ElMessage.warning('请填写驳回原因');
    return;
  }
  await adminApi.rejectProduct(current.value.id, { reason: reason.value.trim(), categoryCode: categoryCode.value });
  ElMessage.success('已驳回');
  rejectDialog.value = false;
  load();
}

function openForceOff(row) {
  current.value = row;
  reason.value = '';
  categoryCode.value = '';
  forceDialog.value = true;
}

async function submitForceOff() {
  if (!categoryCode.value) {
    ElMessage.warning('请选择禁售类目编号');
    return;
  }
  await adminApi.forceOff(current.value.id, { reason: reason.value.trim() || '违规处置', categoryCode: categoryCode.value, deduct: true });
  ElMessage.success('已强制下架并扣分');
  forceDialog.value = false;
  load();
}

function openRestore(row) {
  current.value = row;
  reason.value = '';
  restoreDialog.value = true;
}

async function submitRestore() {
  if (!reason.value.trim()) {
    ElMessage.warning('请填写复核结论');
    return;
  }
  await adminApi.restore(current.value.id, { reason: reason.value.trim() });
  ElMessage.success('已恢复在售');
  restoreDialog.value = false;
  load();
}

onMounted(async () => {
  forbidden.value = (await adminApi.forbidden()).data;
  await load();
});
</script>

<style scoped>
.mb { margin-bottom: 12px; }
.cell { display: flex; gap: 10px; align-items: center; }
.thumb { width: 46px; height: 46px; object-fit: cover; border-radius: 6px; }
.title { font-weight: 600; }
.desc { white-space: pre-wrap; line-height: 1.7; color: #3c4a44; }
.imgs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.imgs img { width: 120px; height: 120px; object-fit: cover; border-radius: 6px; }
</style>
