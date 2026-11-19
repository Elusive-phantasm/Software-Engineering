<template>
  <div class="page">
    <div class="flex-between">
      <h2 class="section-title">我的商品</h2>
      <el-button type="primary" @click="$router.push('/publish')">发布新商品</el-button>
    </div>

    <el-tabs v-model="active" class="mt12">
      <el-tab-pane v-for="tab in tabs" :key="tab.status" :label="`${tab.label}（${items(tab.status).length}）`" :name="tab.status">
        <div v-if="items(tab.status).length" class="list">
          <div v-for="p in items(tab.status)" :key="p.id" class="row card">
            <img v-if="p.images && p.images.length" :src="p.images[0]" class="thumb" @click="open(p)" />
            <div v-else class="thumb placeholder" @click="open(p)">无图</div>
            <div class="info" @click="open(p)">
              <div class="title">{{ p.title }}</div>
              <div class="muted">
                ¥{{ p.price }} · {{ p.condition }} · 浏览 {{ p.viewCount }}
                <span v-if="p.offShelfReason"> · 下架原因：{{ p.offShelfReason }}</span>
              </div>
              <div v-if="p.reviewNote" class="note">审核说明：{{ p.reviewNote }}</div>
            </div>
            <div class="ops">
              <StatusTag :status="p.status" />
              <el-button v-if="p.canEdit" size="small" @click="$router.push(`/product/${p.id}/edit`)">编辑</el-button>
              <el-button v-if="p.canWithdraw" size="small" @click="withdraw(p)">撤回</el-button>
              <el-button v-if="p.canTakeDown" size="small" @click="takeDown(p)">下架</el-button>
              <el-button v-if="p.canResubmit" size="small" type="primary" plain @click="resubmit(p)">重新提交</el-button>
              <el-button v-if="p.canDelete" size="small" type="danger" plain @click="remove(p)">删除</el-button>
            </div>
          </div>
        </div>
        <el-empty v-else :description="`暂无「${tab.label}」商品`" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import StatusTag from '../../components/StatusTag.vue';
import { productApi } from '../../api';

const router = useRouter();
const groups = ref({});
const active = ref('在售');
const tabs = [
  { status: '待审核', label: '待审核' },
  { status: '在售', label: '在售' },
  { status: '已售出', label: '已售出' },
  { status: '已下架', label: '已下架' }
];

const items = (status) => groups.value[status] || [];

async function load() {
  const res = await productApi.mine();
  groups.value = res.data.groups || {};
}

function open(p) {
  router.push(`/product/${p.id}`);
}

async function withdraw(p) {
  await productApi.withdraw(p.id);
  ElMessage.success('已撤回');
  load();
}

async function takeDown(p) {
  await productApi.takeDown(p.id);
  ElMessage.success('已下架');
  load();
}

async function resubmit(p) {
  await productApi.resubmit(p.id, {});
  ElMessage.success('已重新提交审核');
  load();
}

async function remove(p) {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确定删除该商品？', '删除商品', { type: 'warning' });
  } catch {
    return;
  }
  await productApi.remove(p.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  gap: 14px;
  align-items: center;
}
.thumb {
  width: 84px;
  height: 84px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--brand-light);
  cursor: pointer;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 12px;
}
.info {
  flex: 1;
  cursor: pointer;
}
.title {
  font-weight: 600;
  margin-bottom: 4px;
}
.note {
  font-size: 12px;
  color: #b26a00;
  margin-top: 4px;
}
.ops {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 320px;
}
</style>
