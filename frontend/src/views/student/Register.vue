<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="brand">注册</div>
      <div class="sub">使用校园邮箱注册，注册后需提交学生证核验才能发布与下单</div>
      <el-form :model="form" label-position="top">
        <el-form-item label="邮箱">
          <el-input v-model="form.email" placeholder="you@campus.edu" />
        </el-form-item>
        <el-form-item label="验证码">
          <div class="code-row">
            <el-input v-model="form.code" placeholder="6 位验证码" />
            <el-button :disabled="countdown > 0" @click="sendCode">
              {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" maxlength="20" />
        </el-form-item>
        <el-form-item label="真实姓名（核验时与证件比对）">
          <el-input v-model="form.realName" maxlength="50" />
        </el-form-item>
        <el-form-item label="手机号（可选，不公开）">
          <el-input v-model="form.phone" maxlength="11" />
        </el-form-item>
        <el-form-item label="密码（至少 8 位，含字母与数字）">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-checkbox v-model="form.agree">我已阅读并同意《用户协议》与《隐私政策》</el-checkbox>
        <el-button type="primary" class="submit mt16" :loading="loading" @click="submit">注册</el-button>
      </el-form>
      <div class="links">
        <router-link to="/login">已有账号，去登录</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { authApi } from '../../api';

const router = useRouter();
const form = reactive({ email: '', code: '', nickname: '', realName: '', phone: '', password: '', agree: false });
const loading = ref(false);
const countdown = ref(0);

async function sendCode() {
  if (!form.email) {
    ElMessage.warning('请先填写邮箱');
    return;
  }
  try {
    await authApi.sendCode(form.email);
    ElMessage.success('验证码已发送，请查收邮箱');
    countdown.value = 60;
    const timer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0) clearInterval(timer);
    }, 1000);
  } catch {
    /* 已提示 */
  }
}

async function submit() {
  if (!form.agree) {
    ElMessage.warning('请先同意用户协议与隐私政策');
    return;
  }
  loading.value = true;
  try {
    await authApi.register(form);
    ElMessage.success('注册成功，请登录');
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
  padding: 24px 0;
  background: linear-gradient(135deg, #e8f1ec, #f7f7f3);
}
.auth-card {
  width: 420px;
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
.code-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.submit {
  width: 100%;
}
.links {
  margin-top: 14px;
  font-size: 13px;
  text-align: center;
}
</style>
