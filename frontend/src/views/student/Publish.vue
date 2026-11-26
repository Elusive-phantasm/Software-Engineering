<template>
  <div class="page">
    <div class="card">
      <h2 class="section-title">{{ isEdit ? '编辑商品' : '发布闲置' }}</h2>
      <el-alert v-if="isEdit" type="warning" :closable="false" class="mb"
                title="在售商品编辑后会回到「待审核」，重新审核通过前不会对外展示" />

      <el-form :model="form" label-width="90px" class="form">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="50" show-word-limit placeholder="如：高等数学（第七版）上下册" />
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="form.categoryId" placeholder="请选择分类" style="width: 220px">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="价格" required>
          <el-input v-model="form.price" placeholder="单位：元，最多两位小数" style="width: 200px">
            <template #prepend>¥</template>
          </el-input>
          <span class="muted ml8">须大于 0 且不超过 50000 元</span>
        </el-form-item>
        <el-form-item label="成色" required>
          <el-radio-group v-model="form.condition">
            <el-radio-button v-for="c in conditions" :key="c" :value="c">{{ c }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述" required>
          <el-input v-model="form.description" type="textarea" :rows="5" maxlength="1000" show-word-limit
                    placeholder="说明新旧程度、使用情况、取货方式等（不得留联系方式或广告，平台会拦截）" />
        </el-form-item>
        <el-form-item label="图片" required>
          <el-upload v-model:file-list="fileList" list-type="picture-card" :auto-upload="false"
                     accept="image/*" :limit="9" :on-change="onFileChange" :on-remove="onFileRemove">
            <el-icon><Plus /></el-icon>
          </el-upload>
          <div class="muted">1～9 张，每张不超过 5MB。上传后自动压缩。</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="submit">
            {{ isEdit ? '保存并提交审核' : '提交审核' }}
          </el-button>
          <el-button @click="$router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { productApi } from '../../api';

const route = useRoute();
const router = useRouter();
const categories = ref([]);
const conditions = ['全新', '九成新', '七成新', '其他'];
const fileList = ref([]);
const submitting = ref(false);
const isEdit = computed(() => route.name === 'edit');

const form = reactive({ title: '', categoryId: null, price: '', condition: '九成新', description: '', images: [] });

onMounted(async () => {
  const res = await productApi.categories();
  categories.value = res.data;
  if (isEdit.value) {
    const detail = await productApi.detail(route.params.id);
    Object.assign(form, {
      title: detail.data.title,
      categoryId: detail.data.categoryId,
      price: detail.data.price,
      condition: detail.data.condition,
      description: detail.data.description,
      images: detail.data.images || []
    });
    fileList.value = (detail.data.images || []).map((url, i) => ({ name: `图片${i + 1}`, url, raw: url }));
  }
});

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
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function onFileChange(uploadFile) {
  try {
    const compressed = await compress(uploadFile.raw);
    form.images.push(compressed);
    uploadFile.url = compressed;
  } catch {
    ElMessage.error('图片读取失败，请换一张');
  }
}

function onFileRemove(uploadFile) {
  const index = form.images.indexOf(uploadFile.url);
  if (index >= 0) {
    form.images.splice(index, 1);
  }
}

async function submit() {
  if (!form.title.trim() || !form.categoryId || !form.price || !form.description.trim()) {
    ElMessage.warning('请填写标题、分类、价格与描述');
    return;
  }
  if (form.images.length < 1) {
    ElMessage.warning('请至少上传 1 张图片');
    return;
  }
  submitting.value = true;
  try {
    const payload = { ...form, price: String(form.price) };
    if (isEdit.value) {
      await productApi.update(route.params.id, payload);
      ElMessage.success('修改已提交，需重新审核');
    } else {
      await productApi.create(payload);
      ElMessage.success('已提交审核，等待管理员审核');
    }
    router.push('/me/products');
  } catch {
    /* 已提示 */
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.form {
  max-width: 760px;
}
.mb {
  margin-bottom: 14px;
}
.ml8 {
  margin-left: 8px;
}
</style>
