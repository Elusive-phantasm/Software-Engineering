<template>
  <div class="page">
    <h2 class="section-title">我的私信</h2>
    <div v-if="items.length" class="card list">
      <div v-for="c in items" :key="c.productId + '-' + c.peerId" class="row" @click="open(c)">
        <el-avatar :size="38">{{ c.peerNickname?.slice(0, 1) }}</el-avatar>
        <div class="info">
          <div class="top">
            <span class="name">{{ c.peerNickname }}</span>
            <span class="muted">{{ format(c.lastAt) }}</span>
          </div>
          <div class="product">商品：{{ c.productTitle }}</div>
          <div class="last">
            {{ c.lastFromMe ? '我：' : '' }}{{ c.lastContent }}
          </div>
        </div>
        <el-badge v-if="c.unread" :value="c.unread" />
        <el-tag v-if="c.peerBanned" type="danger" size="small">对方账号不可用</el-tag>
      </div>
    </div>
    <el-empty v-else description="还没有会话，去商品详情页点「联系卖家」开始沟通" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { socialApi } from '../../api';

const router = useRouter();
const items = ref([]);

function format(value) {
  return value ? String(value).replace('T', ' ').slice(5, 16) : '';
}

async function load() {
  const res = await socialApi.conversations();
  items.value = res.data;
}

function open(c) {
  router.push({ name: 'conversation', params: { productId: c.productId, peerId: c.peerId } });
}

onMounted(load);
</script>

<style scoped>
.list { padding: 0; }
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.row:last-child { border-bottom: none; }
.row:hover { background: #fbfcfb; }
.info { flex: 1; min-width: 0; }
.top { display: flex; justify-content: space-between; }
.name { font-weight: 600; }
.product { font-size: 12px; color: var(--muted); margin: 2px 0; }
.last {
  font-size: 13px;
  color: #3c4a44;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
