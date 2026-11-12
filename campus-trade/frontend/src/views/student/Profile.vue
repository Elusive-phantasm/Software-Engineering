<template>
  <div class="page" v-loading="loading">
    <div v-if="profile" class="card head">
      <el-avatar :size="64">{{ profile.student?.nickname?.slice(0, 1) }}</el-avatar>
      <div class="info">
        <div class="name">
          {{ profile.student?.nickname }}
          <el-tag size="small" :type="profile.student?.certified ? 'success' : 'info'">{{ profile.certLabel }}</el-tag>
          <el-tag v-if="profile.banned" size="small" type="danger">该账号已被封禁</el-tag>
        </div>
        <div class="muted mt8">
          信用分 {{ profile.student?.creditScore }} · 收到评价 {{ profile.student?.reviewCount }} ·
          被核实争议 {{ profile.student?.verifiedDisputeCount }} · 在售 {{ profile.inSaleCount }}
        </div>
        <div v-if="profile.selfExtra" class="muted mt8">
          邮箱 {{ profile.selfExtra.email }} · 手机 {{ profile.selfExtra.phone || '未填写' }} ·
          宿舍 {{ profile.selfExtra.dorm || '未填写' }}
        </div>
      </div>
      <div v-if="profile.self" class="ops">
        <el-button size="small" @click="$router.push('/me/products')">我的商品</el-button>
        <el-button size="small" @click="$router.push('/me/orders')">我的订单</el-button>
      </div>
    </div>

    <h3 class="mt24">在售商品（{{ profile?.inSaleCount || 0 }}）</h3>
    <div v-if="profile?.inSaleProducts?.length" class="grid">
      <ProductCard v-for="p in profile.inSaleProducts" :key="p.id" :product="p" />
    </div>
    <el-empty v-else description="暂无在售商品" />

    <h3 class="mt24">收到的评价（双方均提交后展示）</h3>
    <div v-if="profile?.reviews?.length" class="reviews">
      <div v-for="r in profile.reviews" :key="r.id" class="card review">
        <div class="flex-between">
          <span class="who">{{ r.reviewerNickname }}</span>
          <span class="muted">{{ String(r.createdAt).replace('T', ' ').slice(0, 16) }}</span>
        </div>
        <div class="content">{{ r.content }}</div>
      </div>
    </div>
    <el-empty v-else description="暂无公开评价" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import ProductCard from '../../components/ProductCard.vue';
import { socialApi } from '../../api';

const route = useRoute();
const profile = ref(null);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    const res = await socialApi.profile(route.params.id);
    profile.value = res.data;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; align-items: center; gap: 18px; }
.info { flex: 1; }
.name { font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.ops { display: flex; gap: 8px; }
.reviews { display: flex; flex-direction: column; gap: 10px; }
.review .who { font-weight: 600; }
.review .content { margin-top: 6px; line-height: 1.7; color: #3c4a44; white-space: pre-wrap; }
</style>
