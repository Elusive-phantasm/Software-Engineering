<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="brand">找回密码</div>
      <div class="sub">通过注册邮箱验证码重置登录密码</div>
      <el-form label-position="top">
        <el-form-item label="邮箱">
          <el-input v-model="email" placeholder="you@campus.edu" />
        </el-form-item>
        <el-button :disabled="countdown > 0" @click="sendCode">
          {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
        </el-button>
        <el-form-item label="验证码" class="mt16">
          <el-input v-model="code" placeholder="6 位验证码" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="newPassword" type="password" show-password />
        </el-form-item>
        <el-button type="primary" class="submit" :loading="loading" @click="reset">重置密码</el-button>
      </el-form>
      <div class="links"><router-link to="/login">返回登录</router-link></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { authApi } from '../../api';

const router = useRouter();
const email = ref('');
const code = ref('');
const newPassword = ref('');
const loading = ref(false);
const countdown = ref(0);

async function sendCode() {
  if (!email.value) {
    ElMessage.warning('请先填写邮箱');
    return;
  }
  try {
    await authApi.forgotSendCode(email.value);
    ElMessage.success('若该邮箱已注册，验证码已发送');
    countdown.value = 60;
    const timer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0) clearInterval(timer);
    }, 1000);
  } catch {
    /* 已提示 */
  }
}

async function reset() {
  loading.value = true;
  try {
    await authApi.resetPassword({ email: email.value, code: code.value, newPassword: newPassword.value });
    ElMessage.success('密码已重置，请重新登录');
    router.push('/login');
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
  background: linear-gradient(135deg, #e8f1ec, #f7f7f3);
}
.auth-card {
  width: 400px;
  background: #fff;
  border-radius: 14px;
  padding: 28px 30px;
  box-shadow: 0 12px 40px rgba(22, 92, 70, 0.12);
}
.brand {
  font-size: 22px;
  font-weight: 700;
  color: var(--brand);
}
.sub {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 18px;
}
.submit {
  width: 100%;
}
.links {
  margin-top: 14px;
  text-align: center;
  font-size: 13px;
}
</style>
