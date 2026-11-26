<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="brand">拾光二手</div>
      <div class="sub">校园二手交易平台 · 登录</div>
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="you@campus.edu" size="large" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password size="large" @keyup.enter="submit" />
        </el-form-item>
        <el-button type="primary" size="large" class="submit" :loading="loading" @click="submit">登录</el-button>
      </el-form>
      <div class="links">
        <router-link to="/register">注册新账号</router-link>
        <router-link to="/forgot">忘记密码</router-link>
      </div>
      <div class="admin-link">
        <router-link to="/admin/login">管理员入口 →</router-link>
      </div>
      <el-alert v-if="notice" :title="notice" type="warning" :closable="false" class="mt16" />
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
// 演示账号可选注入：仅当构建/启动时显式提供 VITE_DEMO_STUDENT_EMAIL / VITE_DEMO_STUDENT_PASSWORD 才预填。
// 仓库与生产构建默认不预填任何口令（见 frontend/.env.example）。
const form = reactive({
  email: import.meta.env.VITE_DEMO_STUDENT_EMAIL || '',
  password: import.meta.env.VITE_DEMO_STUDENT_PASSWORD || ''
});
const loading = ref(false);
const notice = ref('');

async function submit() {
  if (!form.email || !form.password) {
    ElMessage.warning('请填写邮箱与密码');
    return;
  }
  loading.value = true;
  try {
    const res = await auth.login({ ...form });
    notice.value = res.data.restrictedNotice || '';
    ElMessage.success('登录成功');
    router.replace(route.query.redirect || '/');
  } catch (e) {
    /* 错误已由拦截器提示 */
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8f1ec, #f7f7f3);
}
.auth-card {
  width: 380px;
  background: #fff;
  border-radius: 14px;
  padding: 32px 30px;
  box-shadow: 0 12px 40px rgba(22, 92, 70, 0.12);
}
.brand {
  font-size: 24px;
  font-weight: 700;
  color: var(--brand);
}
.sub {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 20px;
}
.submit {
  width: 100%;
}
.links {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  font-size: 13px;
}
.admin-link {
  margin-top: 18px;
  text-align: center;
  font-size: 12px;
}
</style>
