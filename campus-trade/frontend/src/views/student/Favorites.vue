<template>
  <div class="page">
    <h2 class="section-title">我的收藏</h2>
    <div v-if="items.length" class="grid">
      <div v-for="f in items" :key="f.productId" class="card fav" @click="open(f)">
        <div class="cover">
          <img v-if="f.cover" :src="f.cover" alt="" />
          <div v-else class="placeholder">无图</div>
          <el-tag v-if="f.invalid" class="badge" type="info" size="small">{{ f.invalidLabel }}</el-tag>
        </div>
        <div class="body">
          <div class="title">{{ f.title }}</div>
          <div class="flex-between mt8">
            <span class="price">¥{{ f.price }}</span>
            <el-button size="small" text type="danger" @click.stop="remove(f)">取消收藏</el-button>
          </div>
          <div class="muted">收藏于 {{ format(f.favoritedAt) }}</div>
        </div>
      </div>
    </div>
    <el-empty v-else description="还没有收藏，去首页看看吧" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { favoriteApi } from '../../api';

const router = useRouter();
const items = ref([]);

function format(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—';
}

async function load() {
  const res = await favoriteApi.mine();
  items.value = res.data;
}

function open(f) {
  if (f.invalid) {
    ElMessage.info('该商品已失效（已售出或已下架）');
    return;
  }
  router.push(`/product/${f.productId}`);
}

async function remove(f) {
  await favoriteApi.remove(f.productId);
  ElMessage.success('已取消收藏');
  load();
}

onMounted(load);
</script>

<style scoped>
.fav { padding: 0; overflow: hidden; cursor: pointer; }
.cover { position: relative; aspect-ratio: 4 / 3; background: var(--brand-light); }
.cover img { width: 100%; height: 100%; object-fit: cover; }
.placeholder { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--muted); }
.badge { position: absolute; top: 8px; left: 8px; }
.body { padding: 10px 12px 12px; }
.title { font-size: 14px; height: 42px; overflow: hidden; }
</style>
