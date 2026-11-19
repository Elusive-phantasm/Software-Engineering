<template>
  <div class="page">
    <h2 class="section-title">学生证核验</h2>
    <div class="card">
      <el-steps :active="step" align-center class="steps">
        <el-step title="未提交" description="注册后需提交学生证" />
        <el-step title="待审核" description="管理员 24 小时内审核" />
        <el-step :title="status === '已驳回' ? '已驳回' : '已认证'" :description="status === '已驳回' ? '可修改后重提' : '可发布与交易'" />
      </el-steps>

      <el-result v-if="status === '已认证'" icon="success" title="已通过核验"
                 :sub-title="`学号 ${state.studentNo || ''} 已绑定`" />

      <template v-else-if="status === '待审核'">
        <el-alert type="warning" :closable="false" class="mb"
                  title="核验审核中，请等待。审核期间可浏览与收藏，暂不可发布与交易。" />
        <div v-if="state.latest" class="muted">
          提交时间：{{ String(state.latest.submittedAt).replace('T', ' ').slice(0, 16) }} · 申报学号 {{ state.latest.declaredNo }}
        </div>
      </template>

      <template v-else>
        <el-alert v-if="status === '已驳回' && state.latest" type="error" :closable="false" class="mb"
                  :title="`上次未通过：${state.latest.rejectReason || ''}`" />
        <el-form label-width="100px" class="form">
          <el-form-item label="申报学号" required>
            <el-input v-model="declaredNo" placeholder="6～20 位数字" style="width: 240px" />
          </el-form-item>
          <el-form-item label="学生证照片" required>
            <el-upload v-model:file-list="fileList" list-type="picture-card" :auto-upload="false"
                       accept="image/*" :limit="1" :on-change="onChange" :on-remove="onRemove">
              <el-icon><Plus /></el-icon>
            </el-upload>
            <div class="muted">需包含姓名、学号、本人照片；仅审核管理员可见（NFR-08）</div>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="submitting" @click="submit">提交核验</el-button>
            <span class="muted ml8">已重提 {{ state.resubmitCount }}/{{ state.resubmitLimit }} 次</span>
          </el-form-item>
        </el-form>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { verificationApi } from '../../api';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const state = ref({ resubmitCount: 0, resubmitLimit: 3, latest: null });
const status = ref('未提交');
const declaredNo = ref('');
const fileList = ref([]);
const image = ref('');
const submitting = ref(false);

const step = computed(() => {
  if (status.value === '未提交') return 0;
  if (status.value === '待审核') return 1;
  return 2;
});

async function load() {
  const res = await verificationApi.mine();
  state.value = res.data;
  status.value = res.data.certStatus;
  await auth.fetchMe();
}

async function compress(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function onChange(file) {
  try {
    image.value = await compress(file.raw);
    file.url = image.value;
  } catch {
    ElMessage.error('图片读取失败');
  }
}

function onRemove() {
  image.value = '';
}

async function submit() {
  if (!declaredNo.value.trim()) {
    ElMessage.warning('请填写申报学号');
    return;
  }
  if (!image.value) {
    ElMessage.warning('请上传学生证照片');
    return;
  }
  submitting.value = true;
  try {
    await verificationApi.submit({ declaredNo: declaredNo.value.trim(), cardImage: image.value });
    ElMessage.success('核验申请已提交，请等待管理员审核');
    fileList.value = [];
    image.value = '';
    await load();
  } catch {
    /* 已提示 */
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.steps { margin: 8px 0 24px; }
.form { max-width: 620px; }
.mb { margin-bottom: 12px; }
.ml8 { margin-left: 8px; }
</style>
