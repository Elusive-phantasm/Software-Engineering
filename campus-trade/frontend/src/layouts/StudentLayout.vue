<template>
  <div class="shell">
    <header class="topbar">
      <div class="inner">
        <router-link to="/" class="brand" aria-label="拾光二手首页">
          <span class="logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 7h12l-1 13H7L6 7Z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
          </span>
          <span class="brand-text">
            <span class="brand-name">拾光二手</span>
            <span class="brand-en">CAMPUS REUSE</span>
          </span>
        </router-link>

        <nav class="nav">
          <router-link to="/" class="nav-pill" exact-active-class="active">首页</router-link>
          <router-link to="/?focus=feed" class="nav-pill">浏览商品</router-link>
          <router-link to="/publish" class="nav-pill" active-class="active">发布闲置</router-link>
          <router-link to="/me/orders" class="nav-pill" active-class="active">我的订单</router-link>
        </nav>

        <div class="right">
          <template v-if="auth.isLogin">
            <span v-if="auth.student" class="cert-pill" :class="certClass">
              <span class="dot"></span>{{ certText }}
            </span>
            <el-badge :value="auth.badge.messageUnread" :hidden="!auth.badge.messageUnread" :offset="[-2, 2]">
              <router-link to="/messages" class="round-btn" aria-label="私信">
                <el-icon><ChatDotRound /></el-icon>
              </router-link>
            </el-badge>
            <el-badge :value="auth.badge.notificationUnread" :hidden="!auth.badge.notificationUnread" :offset="[-2, 2]">
              <router-link to="/notifications" class="round-btn" aria-label="消息通知">
                <el-icon><Bell /></el-icon>
              </router-link>
            </el-badge>
            <el-dropdown @command="onCommand" trigger="click">
              <span class="user">
                <span class="avatar">{{ (auth.student?.nickname || '我').slice(0, 1) }}</span>
                <span class="nickname">{{ auth.student?.nickname || '我' }}</span>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">个人主页</el-dropdown-item>
                  <el-dropdown-item command="credit">信用分</el-dropdown-item>
                  <el-dropdown-item command="favorites">我的收藏</el-dropdown-item>
                  <el-dropdown-item command="reports">我的举报</el-dropdown-item>
                  <el-dropdown-item command="verification" v-if="!auth.certified">学生证核验</el-dropdown-item>
                  <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
          <template v-else>
            <router-link to="/admin/login" class="nav-pill">审核工作台</router-link>
            <el-button type="primary" round @click="$router.push('/login')">登录 / 注册</el-button>
          </template>
        </div>
      </div>
    </header>

    <main>
      <router-view />
    </main>

    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-brand">拾光二手 · 校园二手交易平台</div>
        <p class="footer-note">
          平台不涉及资金与交付：成交仅表示下单成功，交付方式请在站内私信中与对方约定。
          本系统为教学演示，未接入学校统一身份认证，也未接入真实支付。
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

const certText = computed(() => {
  const map = { 已认证: '已实名核验', 待审核: '核验中', 已驳回: '核验未通过', 未提交: '未实名核验' };
  return map[auth.student?.certStatus] || '未实名核验';
});
const certClass = computed(() => (auth.student?.certStatus === '已认证' ? 'ok' : 'warn'));

onMounted(() => {
  if (auth.isLogin) {
    auth.refreshBadge();
  }
});

function onCommand(cmd) {
  if (cmd === 'logout') {
    auth.logout().then(() => router.push('/'));
    return;
  }
  if (cmd === 'profile') {
    router.push(`/u/${auth.me.id}`);
    return;
  }
  const map = { credit: '/me/credit', favorites: '/me/favorites', reports: '/me/reports', verification: '/verification' };
  router.push(map[cmd] || '/');
}
</script>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid rgba(231, 229, 228, 0.8);
  background: var(--surface-header);
  backdrop-filter: blur(10px);
}
.inner {
  max-width: 1180px;
  margin: 0 auto;
  height: 64px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.logo {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.brand-text {
  line-height: 1.15;
}
.brand-name {
  display: block;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink-heading);
}
.brand-en {
  display: block;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--faint);
}
.nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.nav-pill {
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  font-size: 14px;
  color: #57534e;
  transition: all 0.16s;
}
.nav-pill:hover {
  background: var(--line-soft);
  color: var(--ink);
}
.nav-pill.active {
  background: var(--brand-tint);
  color: var(--brand);
  font-weight: 600;
}
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cert-pill {
  display: none;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
}
.cert-pill.ok {
  border: 1px solid #b9dccb;
  background: var(--brand-tint);
  color: #15803d;
}
.cert-pill.warn {
  border: 1px solid #f0d9b5;
  background: #fdf6ea;
  color: #a16207;
}
.cert-pill .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.round-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.16s;
}
.round-btn:hover {
  border-color: #d6d3d1;
  color: var(--ink);
}
.user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nickname {
  font-size: 14px;
  font-weight: 500;
  color: #44403c;
}
.footer {
  border-top: 1px solid var(--line);
  background: #fbfbf8;
  margin-top: 40px;
}
.footer-inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 20px 36px;
}
.footer-brand {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-heading);
}
.footer-note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--faint);
  max-width: 720px;
}
@media (min-width: 640px) {
  .cert-pill { display: inline-flex; }
}
@media (max-width: 900px) {
  .nav { display: none; }
  .nickname { display: none; }
}
</style>
