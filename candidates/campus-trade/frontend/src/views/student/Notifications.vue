<template>
  <div class="page">
    <div class="flex-between">
      <h2 class="section-title">消息通知</h2>
      <el-button size="small" @click="readAll">全部标为已读</el-button>
    </div>
    <div v-if="items.length" class="card list">
      <div v-for="n in items" :key="n.id" :class="['row', n.read ? '' : 'unread']" @click="open(n)">
        <el-tag :type="typeOf(n.msgType)" size="small" class="type">{{ n.msgType }}</el-tag>
        <div class="info">
          <div class="title">{{ n.title }}</div>
          <div class="content">{{ n.content }}</div>
        </div>
        <div class="time">{{ format(n.createdAt) }}</div>
      </div>
    </div>
    <el-empty v-else description="还没有消息" />
    <div class="muted mt12">仅展示最近 {{ info.retentionDays || 90 }} 天内的通知</div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { socialApi } from '../../api';
import { useAuthStore } from '../../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const items = ref([]);
const info = ref({});

const typeMap = { 核验: 'warning', 商品审核: 'primary', 成交: 'success', 处置: 'danger', 信用: 'info', 私信: '', 账号: 'info' };
const typeOf = (t) => typeMap[t] || 'info';

function format(value) {
  return value ? String(value).replace('T', ' ').slice(5, 16) : '';
}

async function load() {
  const res = await socialApi.notifications({ page: 1, size: 50 });
  items.value = res.data.items;
  info.value = res.data;
  auth.refreshBadge();
}

async function open(n) {
  if (!n.read) {
    await socialApi.readNotification(n.id);
    n.read = true;
    auth.refreshBadge();
  }
  if (n.relatedKind === 'product' && n.relatedId) router.push(`/product/${n.relatedId}`);
  else if (n.relatedKind === 'order' && n.relatedId) router.push('/me/orders');
  else if (n.relatedKind === 'conversation' && n.productId && n.peerId)
    router.push({ name: 'conversation', params: { productId: n.productId, peerId: n.peerId } });
  else if (n.relatedKind === 'cert') router.push('/verification');
  else if (n.relatedKind === 'report') router.push('/me/reports');
}

async function readAll() {
  await socialApi.readAll();
  await load();
}

onMounted(load);
</script>

<style scoped>
.list { padding: 0; }
.row {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  align-items: flex-start;
}
.row:last-child { border-bottom: none; }
.row.unread { background: #f4faf7; }
.type { flex-shrink: 0; }
.info { flex: 1; }
.title { font-weight: 600; font-size: 14px; }
.content { color: #3c4a44; font-size: 13px; margin-top: 4px; line-height: 1.6; }
.time { color: var(--muted); font-size: 12px; white-space: nowrap; }
</style>
