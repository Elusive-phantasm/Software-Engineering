<template>
  <div class="disputes">
    <el-row :gutter="14">
      <el-col :span="7">
        <div class="card list">
          <div class="list-title">处置异议会话（{{ items.length }}）</div>
          <div v-for="c in items" :key="c.productId + '-' + c.peerId"
               :class="['conv', current && current.productId === c.productId && current.peerId === c.peerId ? 'active' : '']"
               @click="open(c)">
            <div class="flex-between">
              <span class="name">{{ c.peerNickname }}</span>
              <el-badge v-if="c.unread" :value="c.unread" />
            </div>
            <div class="muted">{{ c.productTitle }}</div>
            <div class="last">{{ c.lastContent }}</div>
          </div>
          <el-empty v-if="!items.length" description="暂无处置异议会话" :image-size="70" />
        </div>
      </el-col>
      <el-col :span="17">
        <div class="card thread-card">
          <template v-if="detail">
            <div class="flex-between">
              <div>
                <b>{{ detail.peerNickname }}</b>
                <span class="muted"> · {{ detail.productTitle }}</span>
              </div>
              <el-tag size="small" type="warning">{{ detail.offShelfReason }}</el-tag>
            </div>
            <el-divider />
            <div class="thread">
              <div v-for="m in detail.messages" :key="m.id" :class="['bubble-row', m.mine ? 'mine' : '']">
                <div class="bubble">
                  <div class="content">{{ m.content }}</div>
                  <div class="time">{{ String(m.createdAt).replace('T', ' ').slice(5, 16) }}</div>
                </div>
              </div>
            </div>
            <el-divider />
            <div class="composer">
              <el-input v-model="content" type="textarea" :rows="3" maxlength="500" show-word-limit
                        placeholder="仅可就该商品的处置异议回复，不得主动发起私信" />
              <div class="right mt8">
                <el-button type="primary" @click="reply">回复</el-button>
              </div>
            </div>
          </template>
          <el-empty v-else description="左侧选择一个会话" />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminApi, socialApi } from '../../api';

const items = ref([]);
const detail = ref(null);
const current = ref(null);
const content = ref('');

async function load() {
  items.value = (await socialApi.conversations()).data;
}

async function open(c) {
  current.value = c;
  detail.value = (await socialApi.conversation(c.productId, c.peerId)).data;
  if (c.unread) {
    c.unread = 0;
  }
}

async function reply() {
  if (!content.value.trim()) {
    ElMessage.warning('请填写回复内容');
    return;
  }
  await adminApi.replyMessage({
    productId: current.value.productId,
    toId: current.value.peerId,
    content: content.value.trim()
  });
  content.value = '';
  ElMessage.success('已回复');
  await open(current.value);
}

onMounted(load);
</script>

<style scoped>
.list { padding: 0; height: calc(100vh - 160px); overflow-y: auto; }
.list-title { padding: 12px 14px; font-weight: 600; border-bottom: 1px solid var(--border); }
.conv {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.conv:hover { background: #fbfcfb; }
.conv.active { background: var(--brand-light); }
.name { font-weight: 600; }
.last {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.thread-card { min-height: calc(100vh - 160px); display: flex; flex-direction: column; }
.thread { flex: 1; max-height: 46vh; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.bubble-row { display: flex; }
.bubble-row.mine { justify-content: flex-end; }
.bubble { max-width: 70%; background: #f1f5f3; border-radius: 10px; padding: 8px 12px; }
.mine .bubble { background: var(--brand); color: #fff; }
.content { white-space: pre-wrap; line-height: 1.6; }
.time { font-size: 11px; opacity: 0.7; margin-top: 4px; }
.right { display: flex; justify-content: flex-end; }
</style>
