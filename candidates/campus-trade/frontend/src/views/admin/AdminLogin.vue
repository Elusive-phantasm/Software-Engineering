<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="brand">管理端登录</div>
      <div class="sub">仅管理员可登录，学生账号无法进入后台</div>
      <el-form label-position="top">
        <el-form-item label="管理员账号">
          <el-input v-model="form.adminNo" size="large" placeholder="ADM-001" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password size="large" @keyup.enter="submit" />
        </el-form-item>
        <el-button type="primary" size="large" class="submit" :loading="loading" @click="submit">登录</el-button>
      </el-form>
      <div class="links"><router-link to="/">← 返回学生端</router-link></div>
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
const form = reactive({ adminNo: 'ADM-001', password: 'Admin@12345' });
const loading = ref(false);

async function submit() {
  loading.value = true;
  try {
    await auth.adminLogin({ ...form });
    ElMessage.success('登录成功');
    router.replace(route.query.redirect || '/admin/dashboard');
  } catch {
    /* 已提示 */
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
  background: linear-gradient(135deg, #17211d, #165c46);
}
.auth-card {
  width: 380px;
  background: #fff;
  border-radius: 14px;
  padding: 32px 30px;
}
.brand { font-size: 22px; font-weight: 700; color: var(--brand); }
.sub { color: var(--muted); font-size: 13px; margin: 4px 0 20px; }
.submit { width: 100%; }
.links { margin-top: 14px; text-align: center; font-size: 13px; }
</style>
