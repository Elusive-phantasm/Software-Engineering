<template>
  <div class="page">
    <!-- Hero：左侧标题 + 右侧审核入口卡（对齐原型） -->
    <section class="hero">
      <div class="hero-left">
        <div class="hero-badge">
          <span class="dot"></span>
          本校同学 · 学生证核验后交易
        </div>
        <h1>把闲置交给<br class="mobile-br" />下一位同学</h1>
        <p class="hero-sub">
          从教材、数码到宿舍好物，浏览真实状态，和同校同学约个地方当面交付。
          平台不涉及资金与交付，成交仅表示下单成功。
        </p>
      </div>

      <router-link to="/admin/login" class="admin-card">
        <div class="admin-glow"></div>
        <div class="admin-head">
          <div>
            <div class="admin-icon">
              <el-icon :size="18"><Postcard /></el-icon>
            </div>
            <p class="admin-title">审核工作台</p>
            <p class="admin-desc">商品、学生证与举报统一处理</p>
          </div>
          <span class="admin-badge">进入后台</span>
        </div>
        <div class="admin-more">
          前往管理端
          <el-icon :size="14"><ArrowRight /></el-icon>
        </div>
      </router-link>
    </section>

    <!-- 搜索与筛选卡 -->
    <section class="search-card">
      <div class="search-row">
        <el-input v-model="query.keyword" size="large" placeholder="搜索教材、数码、代步工具…"
                  clearable @keyup.enter="reload">
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" size="large" class="search-btn" @click="reload">搜索</el-button>
      </div>

      <div class="filter-row">
        <div class="pills">
          <span class="filter-label">分类</span>
          <button class="pill" :class="{ active: !query.categoryId }" @click="setCategory('')">全部</button>
          <button v-for="c in categories" :key="c.id" class="pill"
                  :class="{ active: String(query.categoryId) === String(c.id) }"
                  @click="setCategory(String(c.id))">
            {{ c.name }}<span class="count">{{ c.onSaleCount }}</span>
          </button>
        </div>
        <div class="extra">
          <el-select v-model="query.condition" placeholder="成色" clearable size="small" style="width: 100px"
                     @change="reload">
            <el-option v-for="c in conditions" :key="c" :label="c" :value="c" />
          </el-select>
          <el-select v-model="query.sort" size="small" style="width: 116px" @change="reload">
            <el-option label="最新发布" value="latest" />
            <el-option label="价格从低到高" value="priceAsc" />
            <el-option label="价格从高到低" value="priceDesc" />
            <el-option label="浏览最多" value="hot" />
          </el-select>
          <span class="total">
            共 <b>{{ total }}</b> 件在流转
          </span>
        </div>
      </div>
    </section>

    <!-- 商品流 -->
    <section id="product-feed" class="feed">
      <div class="feed-head">
        <div>
          <h2>正在流转</h2>
          <p class="faint">最近发布 · 支持按分类与关键词筛选</p>
        </div>
        <span class="faint">只展示「在售」商品</span>
      </div>

      <div v-loading="loading">
        <div v-if="items.length" class="grid">
          <ProductCard v-for="p in items" :key="p.id" :product="p" />
        </div>
        <div v-else class="empty">
          <div class="empty-icon"><el-icon :size="30"><Box /></el-icon></div>
          <p>没有找到相关商品</p>
          <p class="faint">试试放宽筛选条件，或换一个关键词</p>
        </div>
      </div>

      <div class="pager">
        <el-pagination background layout="prev, pager, next" :total="total" :page-size="query.pageSize"
                       :current-page="query.page" @current-change="onPage" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import ProductCard from '../../components/ProductCard.vue';
import { productApi } from '../../api';

const categories = ref([]);
const items = ref([]);
const total = ref(0);
const loading = ref(false);
const conditions = ['全新', '九成新', '七成新', '其他'];

const query = reactive({
  keyword: '',
  categoryId: '',
  condition: '',
  minPrice: '',
  maxPrice: '',
  sort: 'latest',
  page: 1,
  pageSize: 12
});

async function loadCategories() {
  const res = await productApi.categories();
  categories.value = res.data;
}

function setCategory(id) {
  query.categoryId = id;
  reload();
}

async function reload() {
  query.page = 1;
  await load();
}

async function load() {
  loading.value = true;
  try {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    );
    const res = await productApi.list(params);
    items.value = res.data.items;
    total.value = res.data.total;
  } finally {
    loading.value = false;
  }
}

function onPage(page) {
  query.page = page;
  load();
  document.getElementById('product-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onMounted(async () => {
  await loadCategories();
  await load();
});
</script>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
}
.hero-left {
  max-width: 620px;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  background: #fff;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
}
.hero-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22c55e;
}
.hero h1 {
  margin: 0;
  font-size: 38px;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--ink-heading);
}
.hero-sub {
  margin: 12px 0 0;
  max-width: 560px;
  font-size: 15px;
  line-height: 1.75;
  color: var(--muted);
}
.mobile-br {
  display: none;
}

.admin-card {
  position: relative;
  display: block;
  width: 330px;
  flex-shrink: 0;
  overflow: hidden;
  padding: 20px;
  border-radius: var(--radius-lg);
  background: var(--brand-deep);
  color: #fff;
  box-shadow: var(--shadow-lg);
  transition: transform 0.18s;
}
.admin-card:hover {
  transform: translateY(-2px);
}
.admin-glow {
  position: absolute;
  right: -32px;
  top: -40px;
  width: 128px;
  height: 128px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
}
.admin-head {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.admin-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #d1fae5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.admin-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.admin-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(209, 250, 229, 0.7);
}
.admin-badge {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--amber);
  color: #4b2c0d;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.admin-more {
  position: relative;
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(209, 250, 229, 0.9);
}

.search-card {
  margin-top: 28px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: var(--shadow-sm);
}
.search-row {
  display: flex;
  gap: 10px;
}
.search-row :deep(.el-input__wrapper) {
  border-radius: 12px;
  background: #fafaf7;
  box-shadow: 0 0 0 1px var(--line) inset;
}
.search-btn {
  flex-shrink: 0;
  padding: 0 26px;
  border-radius: 12px;
  font-weight: 600;
}
.filter-row {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line-soft);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.pills {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.filter-label {
  font-size: 12px;
  color: var(--faint);
  margin-right: 2px;
  flex-shrink: 0;
}
.count {
  margin-left: 4px;
  opacity: 0.65;
  font-size: 11px;
}
.extra {
  display: flex;
  align-items: center;
  gap: 8px;
}
.total {
  font-size: 12px;
  color: var(--faint);
}
.total b {
  color: #44403c;
}

.feed {
  margin-top: 32px;
}
.feed-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.feed-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--ink-heading);
}
.feed-head p {
  margin: 4px 0 0;
}
.empty {
  padding: 56px 0;
  text-align: center;
  color: var(--muted);
}
.empty-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--brand-softer);
  color: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}
.empty p {
  margin: 4px 0;
}
.pager {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

@media (max-width: 900px) {
  .hero {
    flex-direction: column;
    align-items: stretch;
  }
  .admin-card {
    width: 100%;
  }
  .hero h1 {
    font-size: 30px;
  }
  .mobile-br {
    display: block;
  }
}
</style>
