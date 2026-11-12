<template>
  <router-link :to="`/product/${product.id}`" class="product-card">
    <div class="cover">
      <img v-if="product.images && product.images.length" :src="product.images[0]" :alt="product.title" />
      <div v-else class="placeholder">暂无图片</div>
      <span class="status" :class="statusClass">{{ product.status }}</span>
    </div>
    <div class="body">
      <div class="meta-line">
        <span class="chip chip-stone">{{ product.categoryName || '闲置' }}</span>
        <span class="faint">{{ product.condition }}</span>
      </div>
      <h3 class="title">{{ product.title }}</h3>
      <div class="price-row">
        <span class="price"><small>¥</small>{{ displayPrice }}</span>
        <span class="seller">
          <span class="seller-avatar">{{ (product.seller?.nickname || '同').slice(0, 1) }}</span>
          <span class="faint">{{ product.seller?.nickname || '同学' }}</span>
        </span>
      </div>
      <div class="foot">
        <span>{{ formatDate(product.publishedAt) }}</span>
        <span>·</span>
        <span>浏览 {{ product.viewCount || 0 }}</span>
      </div>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ product: { type: Object, required: true } });

const statusClass = computed(() => {
  const map = { 在售: 'ok', 待审核: 'warn', 已售出: 'done', 已下架: 'off' };
  return map[props.product.status] || 'off';
});

// 原型里整数价格不带小数（¥680），这里保持一致
const displayPrice = computed(() => {
  const text = String(props.product.price ?? '');
  return text.endsWith('.00') ? text.slice(0, -3) : text;
});

function formatDate(value) {
  if (!value) return '';
  const text = String(value).replace('T', ' ');
  return text.slice(5, 16);
}
</script>

<style scoped>
.product-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: #fff;
  color: inherit;
  transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s;
}
.product-card:hover {
  transform: translateY(-2px);
  border-color: #a7c4b7;
  box-shadow: var(--shadow-lg);
}
.cover {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: linear-gradient(135deg, #e5ede6, #f1eee2 55%, #d9e4dd);
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s;
}
.product-card:hover .cover img {
  transform: scale(1.03);
}
.placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9aa79f;
  font-size: 13px;
}
.status {
  position: absolute;
  left: 12px;
  top: 12px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  backdrop-filter: blur(4px);
}
.status.ok {
  border: 1px solid #b9dccb;
  background: rgba(236, 253, 245, 0.95);
  color: #15803d;
}
.status.warn {
  border: 1px solid #f0d9b5;
  background: rgba(253, 246, 234, 0.95);
  color: #a16207;
}
.status.done {
  border: 1px solid #d9e2ec;
  background: rgba(240, 245, 250, 0.95);
  color: #4b6a86;
}
.status.off {
  border: 1px solid #e7e5e4;
  background: rgba(250, 250, 247, 0.95);
  color: #78716c;
}
.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 14px 16px 16px;
}
.meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.title {
  margin: 8px 0 0;
  min-height: 44px;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
  color: #1c1917;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.price-row {
  margin-top: 12px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}
.seller {
  display: flex;
  align-items: center;
  gap: 6px;
}
.seller-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--brand-softer);
  color: var(--brand);
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line-soft);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--faint);
}
</style>
