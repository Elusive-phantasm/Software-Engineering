<template>
  <div>
    <div class="flex-between mb">
      <el-radio-group v-model="status" @change="load">
        <el-radio-button value="待审核">待审核</el-radio-button>
        <el-radio-button value="已通过">已通过</el-radio-button>
        <el-radio-button value="已驳回">已驳回</el-radio-button>
      </el-radio-group>
      <el-button size="small" @click="load">刷新</el-button>
    </div>

    <el-table :data="items" v-loading="loading" stripe>
      <el-table-column prop="id" label="#" width="60" />
      <el-table-column prop="nickname" label="昵称" width="110" />
      <el-table-column prop="realName" label="真实姓名" width="110" />
      <el-table-column prop="email" label="邮箱" width="190" />
      <el-table-column prop="declaredNo" label="申报学号" width="120" />
      <el-table-column prop="resubmitCount" label="重提次数" width="90" />
      <el-table-column prop="submittedAt" label="提交时间" width="150">
        <template #default="{ row }">{{ String(row.submittedAt).replace('T', ' ').slice(0, 16) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="230">
        <template #default="{ row }">
          <el-button size="small" @click="viewImage(row)">看证件</el-button>
          <template v-if="row.reviewStatus === '待审核'">
            <el-button size="small" type="success" @click="approve(row)">通过</el-button>
            <el-button size="small" type="danger" @click="openReject(row)">驳回</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !items.length" description="没有待审核的申请" />

    <el-dialog v-model="imageDialog" title="学生证照片（仅审核管理员可见）" width="620px">
      <el-image v-if="imageSrc" :src="imageSrc" fit="contain" style="width: 100%" />
      <div class="muted mt8">核对：证件姓名 ↔ 账号真实姓名、证件学号 ↔ 申报学号</div>
    </el-dialog>

    <el-dialog v-model="rejectDialog" title="驳回核验申请" width="460px">
      <el-form label-position="top">
        <el-form-item label="驳回原因（必填）">
          <el-input v-model="rejectReason" type="textarea" :rows="3" maxlength="200" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="forgery">疑似伪造 / 冒用（将封禁账号并连带下架）</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialog = false">取消</el-button>
        <el-button type="danger" @click="submitReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi } from '../../api';
import { TOKEN_KEY } from '../../api/http';

const items = ref([]);
const status = ref('待审核');
const loading = ref(false);
const imageDialog = ref(false);
const imageSrc = ref('');
const rejectDialog = ref(false);
const rejectReason = ref('');
const forgery = ref(false);
const current = ref(null);

async function load() {
  loading.value = true;
  try {
    items.value = (await adminApi.verifications(status.value)).data;
  } finally {
    loading.value = false;
  }
}

async function viewImage(row) {
  current.value = row;
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(adminApi.certImageUrl(row.id), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    ElMessage.error('读取证件图片失败');
    return;
  }
  const blob = await res.blob();
  imageSrc.value = URL.createObjectURL(blob);
  imageDialog.value = true;
}

async function approve(row) {
  await adminApi.approveCert(row.id);
  ElMessage.success('已通过核验');
  load();
}

function openReject(row) {
  current.value = row;
  rejectReason.value = '';
  forgery.value = false;
  rejectDialog.value = true;
}

async function submitReject() {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写驳回原因');
    return;
  }
  await adminApi.rejectCert(current.value.id, { reason: rejectReason.value.trim(), forgery: forgery.value });
  ElMessage.success('已驳回');
  rejectDialog.value = false;
  load();
}

onMounted(load);
</script>

<style scoped>
.mb { margin-bottom: 12px; }
</style>
