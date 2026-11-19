<template>
  <el-container class="admin-shell">
    <el-aside width="208px" class="aside">
      <div class="brand">拾光二手 · 管理端</div>
      <el-menu :default-active="active" router>
        <el-menu-item index="/admin/dashboard"><el-icon><DataLine /></el-icon>看板</el-menu-item>
        <el-menu-item index="/admin/certs"><el-icon><Postcard /></el-icon>学生证审核</el-menu-item>
        <el-menu-item index="/admin/products"><el-icon><Goods /></el-icon>商品审核</el-menu-item>
        <el-menu-item index="/admin/reports"><el-icon><Warning /></el-icon>举报处置</el-menu-item>
        <el-menu-item index="/admin/disputes"><el-icon><ChatDotRound /></el-icon>处置异议</el-menu-item>
        <el-menu-item index="/admin/students"><el-icon><User /></el-icon>学生与账号</el-menu-item>
        <el-menu-item index="/admin/audit"><el-icon><Document /></el-icon>审计日志</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span class="title">{{ title }}</span>
        <span class="right">
          <span class="who">{{ auth.me?.displayName || '管理员' }}</span>
          <el-button text type="danger" @click="logout">退出</el-button>
        </span>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const active = computed(() => route.path);
const title = computed(() => {
  const map = {
    '/admin/dashboard': '数据看板',
    '/admin/certs': '学生证审核',
    '/admin/products': '商品审核',
    '/admin/reports': '举报处置',
    '/admin/disputes': '处置异议会话',
    '/admin/students': '学生与账号',
    '/admin/audit': '审计日志'
  };
  return map[route.path] || '管理端';
});

async function logout() {
  await auth.logout();
  router.push('/admin/login');
}
</script>

<style scoped>
.admin-shell {
  min-height: 100vh;
}
.aside {
  background: #fff;
  border-right: 1px solid var(--border);
}
.brand {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 18px;
  font-weight: 700;
  color: var(--brand);
  border-bottom: 1px solid var(--border);
}
.header {
  background: #fff;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  font-weight: 600;
}
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.who {
  color: var(--muted);
  font-size: 13px;
}
.main {
  background: var(--bg);
}
</style>
