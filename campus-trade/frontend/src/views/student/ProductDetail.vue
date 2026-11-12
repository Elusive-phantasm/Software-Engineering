<template>
  <div class="page" v-loading="loading">
    <el-breadcrumb separator="/" class="mb">
      <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
      <el-breadcrumb-item>{{ product?.title || '商品详情' }}</el-breadcrumb-item>
    </el-breadcrumb>

    <div v-if="product" class="detail card">
      <div class="gallery">
        <div class="frame">
          <el-image v-if="images.length" :src="images[0]" fit="cover" class="main-img" :preview-src-list="images" />
          <div v-else class="main-img placeholder">暂无图片</div>
          <span class="status-pill" :class="statusClass">
            <span class="dot"></span>{{ product.status }}
          </span>
        </div>
        <div class="thumbs">
          <img v-for="(img, i) in images" :key="i" :src="img" :class="{ active: i === current }"
               @click="current = i" />
        </div>
      </div>

      <div class="info">
        <div class="title-row">
          <h2>{{ product.title }}</h2>
        </div>
        <div class="price mt8"><small>¥</small>{{ displayPrice }}</div>
        <div class="tags mt8">
          <span class="chip chip-soft">{{ product.categoryName }}</span>
          <span class="chip chip-stone">{{ product.condition }}</span>
          <span class="faint">浏览 {{ product.viewCount }} · 收藏 {{ product.favoriteCount }}</span>
        </div>
        <p class="desc">{{ product.description }}</p>

        <div class="info-grid">
          <div class="info-item">
            <span class="info-icon"><el-icon><Box /></el-icon></span>
            <div>
              <div class="info-label">成色</div>
              <div class="info-value">{{ product.condition }}</div>
            </div>
          </div>
          <div class="info-item">
            <span class="info-icon"><el-icon><Collection /></el-icon></span>
            <div>
              <div class="info-label">分类</div>
              <div class="info-value">{{ product.categoryName }}</div>
            </div>
          </div>
          <div class="info-item">
            <span class="info-icon"><el-icon><Clock /></el-icon></span>
            <div>
              <div class="info-label">发布时间</div>
              <div class="info-value">{{ formatTime(product.publishedAt) }}</div>
            </div>
          </div>
          <div class="info-item">
            <span class="info-icon"><el-icon><View /></el-icon></span>
            <div>
              <div class="info-label">浏览</div>
              <div class="info-value">{{ product.viewCount }} 次</div>
            </div>
          </div>
        </div>
        <div v-if="product.offShelfReason" class="mt8">
          <el-alert type="warning" :closable="false"
                    :title="`已下架：${product.offShelfReason}${product.reviewNote ? ' · ' + product.reviewNote : ''}`" />
        </div>

        <div class="seller card mt16" @click="openProfile">
          <el-avatar :size="38">{{ product.seller?.nickname?.slice(0, 1) || '卖' }}</el-avatar>
          <div class="seller-info">
            <div>
              {{ product.seller?.nickname }}
              <el-tag size="small" :type="product.seller?.certified ? 'success' : 'info'">
                {{ product.seller?.certified ? '已认证' : '未认证' }}
              </el-tag>
            </div>
            <div class="muted">
              信用分 {{ product.seller?.creditScore }} · 评价 {{ product.seller?.reviewCount }}
              <span v-if="product.seller?.verifiedDisputeCount"> · 被核实争议 {{ product.seller.verifiedDisputeCount }}</span>
            </div>
          </div>
          <el-icon><ArrowRight /></el-icon>
        </div>

        <div class="actions mt16">
          <template v-if="!product.owner">
            <el-button type="danger" size="large" :disabled="product.status !== '在售'" @click="buy">
              {{ product.status === '在售' ? '立即购买' : '该商品不可购买' }}
            </el-button>
            <el-button size="large" @click="contact">联系卖家</el-button>
            <el-button size="large" :type="product.favorited ? 'warning' : 'default'" @click="toggleFavorite">
              {{ product.favorited ? '已收藏' : '收藏' }}
            </el-button>
            <el-button size="large" text type="danger" @click="report">举报</el-button>
          </template>
          <template v-else>
            <el-button v-if="product.canEdit" type="primary" @click="$router.push(`/product/${product.id}/edit`)">编辑</el-button>
            <el-button v-if="product.canWithdraw" @click="withdraw">撤回</el-button>
            <el-button v-if="product.canTakeDown" @click="takeDown">下架</el-button>
            <el-button v-if="product.canDelete" type="danger" plain @click="remove">删除</el-button>
            <el-button v-if="product.canResubmit" type="primary" plain @click="resubmit">重新提交审核</el-button>
            <el-tag v-if="product.status === '待审核'" type="warning">等待管理员审核（24 小时内）</el-tag>
          </template>
        </div>
      </div>
    </div>

    <el-empty v-else-if="!loading" description="该商品已不存在" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import StatusTag from '../../components/StatusTag.vue';
import { favoriteApi, orderApi, productApi, socialApi } from '../../api';
import { useAuthStore } from '../../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const product = ref(null);
const loading = ref(false);
const current = ref(0);

const images = computed(() => product.value?.images || []);
const statusClass = computed(() => {
  const map = { 在售: 'ok', 待审核: 'warn', 已售出: 'done', 已下架: 'off' };
  return map[product.value?.status] || 'off';
});
const displayPrice = computed(() => {
  const text = String(product.value?.price ?? '');
  return text.endsWith('.00') ? text.slice(0, -3) : text;
});

async function load() {
  loading.value = true;
  try {
    const res = await productApi.detail(route.params.id);
    product.value = res.data;
  } catch {
    product.value = null;
  } finally {
    loading.value = false;
  }
}

function requireLogin() {
  if (!auth.isLogin) {
    ElMessage.warning('请先登录');
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return false;
  }
  return true;
}

async function buy() {
  if (!requireLogin()) return;
  try {
    await ElMessageBox.confirm(
      `下单即成交：将以 ¥${product.value.price} 成交，商品立即转为「已售出」。平台不涉及付款与交付，请在站内私信中与卖家约定取货。`,
      '确认下单',
      { confirmButtonText: '确认下单', cancelButtonText: '再想想' }
    );
  } catch {
    return;
  }
  try {
    const res = await orderApi.create(product.value.id);
    ElMessage.success('下单成功，交易已成交');
    router.push({ name: 'orders', query: { id: res.data.id } });
  } catch {
    load();
  }
}

async function toggleFavorite() {
  if (!requireLogin()) return;
  try {
    if (product.value.favorited) {
      await favoriteApi.remove(product.value.id);
      ElMessage.success('已取消收藏');
    } else {
      await favoriteApi.add(product.value.id);
      ElMessage.success('已收藏');
    }
    load();
  } catch {
    /* 已提示 */
  }
}

async function contact() {
  if (!requireLogin()) return;
  router.push({ name: 'conversation', params: { productId: product.value.id, peerId: product.value.sellerId } });
}

async function report() {
  if (!requireLogin()) return;
  const types = ['违禁品', '虚假描述', '价格欺诈', '站外导流', '其他'];
  try {
    const { value } = await ElMessageBox.prompt('请填写举报说明', '举报商品', {
      inputType: 'textarea',
      confirmButtonText: '提交举报',
      cancelButtonText: '取消',
      inputPlaceholder: '说明违规情况，便于管理员核实'
    });
    await socialApi.report({ targetType: '商品', targetId: product.value.id, type: types[1], reason: value });
    ElMessage.success('举报已提交');
  } catch {
    /* 取消或已提示 */
  }
}

async function withdraw() {
  await productApi.withdraw(product.value.id);
  ElMessage.success('已撤回');
  load();
}

async function takeDown() {
  await productApi.takeDown(product.value.id);
  ElMessage.success('已下架');
  load();
}

async function remove() {
  try {
    await ElMessageBox.confirm('删除后不可恢复，历史成交与收藏记录会保留。确定删除？', '删除商品', { type: 'warning' });
  } catch {
    return;
  }
  await productApi.remove(product.value.id);
  ElMessage.success('已删除');
  router.push('/me/products');
}

async function resubmit() {
  await productApi.resubmit(product.value.id, {});
  ElMessage.success('已重新提交审核');
  load();
}

function openProfile() {
  if (!product.value?.sellerId) return;
  router.push(`/u/${product.value.sellerId}`);
}

function formatTime(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—';
}

onMounted(load);
</script>

<style scoped>
.mb { margin-bottom: 12px; }
.detail {
  display: grid;
  grid-template-columns: 440px 1fr;
  gap: 28px;
  padding: 8px;
  border-radius: 24px;
  box-shadow: var(--shadow-md);
}
.frame {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  background: linear-gradient(135deg, #e5ede6, #f2efe3 55%, #d9e4dd);
}
.main-img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  display: block;
}
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9aa79f;
}
.status-pill {
  position: absolute;
  left: 16px;
  top: 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(4px);
}
.status-pill .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.status-pill.ok { border: 1px solid #b9dccb; background: rgba(236, 253, 245, 0.95); color: #15803d; }
.status-pill.warn { border: 1px solid #f0d9b5; background: rgba(253, 246, 234, 0.95); color: #a16207; }
.status-pill.done { border: 1px solid #d9e2ec; background: rgba(240, 245, 250, 0.95); color: #4b6a86; }
.status-pill.off { border: 1px solid var(--line); background: rgba(250, 250, 247, 0.95); color: var(--muted); }
.thumbs {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.thumbs img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
}
.thumbs img.active {
  border-color: var(--brand);
}
.info h2 {
  margin: 0;
  font-size: 22px;
  color: var(--ink-heading);
  letter-spacing: -0.01em;
}
.tags {
  display: flex;
  align-items: center;
  gap: 8px;
}
.desc {
  margin-top: 14px;
  line-height: 1.8;
  color: #3c4a44;
  white-space: pre-wrap;
}
.info-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: #fdfdfb;
}
.info-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.info-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--line-soft);
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
}
.info-label {
  font-size: 11px;
  color: var(--faint);
}
.info-value {
  font-size: 13px;
  font-weight: 500;
  color: #44403c;
  margin-top: 2px;
}
.seller {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.seller-info {
  flex: 1;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
@media (max-width: 900px) {
  .detail { grid-template-columns: 1fr; }
}
</style>
