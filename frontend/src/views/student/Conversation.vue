<template>
  <div class="page" v-loading="loading">
    <div class="head card" v-if="detail">
      <div class="flex-between">
        <div>
          <span class="peer">{{ detail.peerNickname }}</span>
          <span class="muted">· 商品：{{ detail.productTitle }}</span>
        </div>
        <el-button text @click="$router.push('/messages')">返回列表</el-button>
      </div>
      <div class="muted mt8">
        商品状态：{{ detail.productStatus }}
        <span v-if="detail.offShelfReason">（{{ detail.offShelfReason }}）</span>
        <span v-if="detail.peerBanned" class="danger"> · 对方账号已封禁，无法继续发送</span>
      </div>
      <el-alert v-if="detail.offShelfReason && detail.iAmSeller" type="warning" :closable="false" class="mt8"
                title="该商品因违规被管理员下架，你可向管理员提出异议">
        <el-button size="small" type="warning" class="mt8" @click="appealDialog = true">向管理员提异议</el-button>
      </el-alert>
    </div>

    <div class="thread card mt12">
      <div v-for="m in detail?.messages || []" :key="m.id" :class="['bubble-row', m.mine ? 'mine' : '']">
        <div class="bubble">
          <div class="content">{{ m.content }}</div>
          <div class="time">{{ format(m.createdAt) }}</div>
        </div>
      </div>
      <el-empty v-if="detail && !detail.messages.length" description="还没有消息" />
    </div>

    <div class="composer card mt12">
      <el-input v-model="content" type="textarea" :rows="3" maxlength="500" show-word-limit
                placeholder="只能就这件商品沟通；平台不记录交付事实"
                @keydown.ctrl.enter="send" />
      <div class="flex-between mt8">
        <span class="muted">Ctrl + Enter 发送 · 纯文本单聊，不支持附件与撤回</span>
        <el-button type="primary" :disabled="sending" @click="send">发送</el-button>
      </div>
    </div>

    <el-dialog v-model="appealDialog" title="向管理员提出处置异议" width="480px">
      <el-alert type="info" :closable="false" class="mb"
                title="异议会以站内私信发给管理员，管理员复核后可恢复在售" />
      <el-input v-model="appealContent" type="textarea" :rows="4" maxlength="500" show-word-limit
                placeholder="说明为什么认为处置有误" />
      <template #footer>
        <el-button @click="appealDialog = false">取消</el-button>
        <el-button type="primary" @click="submitAppeal">提交异议</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { socialApi } from '../../api';
import { useAuthStore } from '../../stores/auth';

const route = useRoute();
const auth = useAuthStore();
const detail = ref(null);
const content = ref('');
const loading = ref(false);
const sending = ref(false);
const appealDialog = ref(false);
const appealContent = ref('');

function format(value) {
  return value ? String(value).replace('T', ' ').slice(5, 16) : '';
}

async function load() {
  loading.value = true;
  try {
    const res = await socialApi.conversation(route.params.productId, route.params.peerId);
    detail.value = res.data;
    await nextTick();
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    auth.refreshBadge();
  } catch {
    detail.value = null;
  } finally {
    loading.value = false;
  }
}

async function send() {
  if (!content.value.trim()) {
    ElMessage.warning('消息内容不能为空');
    return;
  }
  sending.value = true;
  try {
    await socialApi.send({
      productId: Number(route.params.productId),
      toId: Number(route.params.peerId),
      content: content.value.trim()
    });
    content.value = '';
    await load();
  } catch {
    /* 已提示 */
  } finally {
    sending.value = false;
  }
}

onMounted(load);

async function submitAppeal() {
  if (!appealContent.value.trim()) {
    ElMessage.warning('请填写异议内容');
    return;
  }
  await socialApi.appeal({ productId: Number(route.params.productId), content: appealContent.value.trim() });
  ElMessage.success('异议已发送给管理员');
  appealDialog.value = false;
  appealContent.value = '';
  await load();
}
</script>

<style scoped>
.peer { font-weight: 700; font-size: 16px; }
.thread {
  min-height: 320px;
  max-height: 62vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bubble-row { display: flex; }
.bubble-row.mine { justify-content: flex-end; }
.bubble {
  max-width: 68%;
  background: #f1f5f3;
  border-radius: 10px;
  padding: 8px 12px;
}
.mine .bubble { background: var(--brand); color: #fff; }
.content { white-space: pre-wrap; line-height: 1.6; }
.time { font-size: 11px; opacity: 0.7; margin-top: 4px; }
.danger { color: #c0392b; }
</style>
