<template>
  <div class="page">
    <h2 class="section-title">我的订单</h2>
    <el-alert type="info" :closable="false" class="mb"
              title="订单只有「有效/已撤销」状态。撤销必须由一方发起、另一方审批同意后生效。成交仅表示下单成功，不代表已付款或已交货。" />

    <el-tabs v-model="role" @tab-change="load">
      <el-tab-pane label="全部" name="all" />
      <el-tab-pane label="我买到的" name="buyer" />
      <el-tab-pane label="我卖出的" name="seller" />
    </el-tabs>

    <div v-if="orders.length" class="list">
      <div v-for="o in orders" :key="o.id" class="order card">
        <div class="head">
          <div>
            <span class="role-tag">{{ o.myRole === 'buyer' ? '买家' : '卖家' }}</span>
            <span class="title">{{ o.productTitle }}</span>
          </div>
          <div class="head-right">
            <StatusTag :status="o.status" />
            <StatusTag v-if="o.cancelJudgement" :status="o.cancelJudgement" />
          </div>
        </div>
        <div class="meta">
          <span>成交金额 ¥{{ o.amount }}</span>
          <span>成交时间 {{ format(o.createdAt) }}</span>
          <span>对方 {{ o.peerNickname || '—' }}</span>
          <span>商品状态 {{ o.productStatus || '—' }}</span>
        </div>
        <div v-if="o.status === '已撤销'" class="cancel-info">
          由{{ o.cancelInitiatorId === auth.me?.id ? '我' : '对方' }}撤销 · 原因：{{ o.cancelReason }}
          <span v-if="o.cancelJudgement === '待判定' && o.judgeRemaining"> · 剩余 {{ o.judgeRemaining }}</span>
        </div>
        <div class="ops">
          <el-button v-if="o.canReview" size="small" type="primary" @click="openReview(o)">评价</el-button>
          <el-button v-if="o.canCancel" size="small" type="danger" plain @click="openCancel(o)">撤销成交</el-button>
              <el-button v-if="o.canJudge" size="small" type="warning" @click="openJudge(o)">撤销审批</el-button>
          <el-button size="small" text @click="openProduct(o)">查看商品</el-button>
          <el-button size="small" text type="danger" @click="openReportUser(o)">举报该用户</el-button>
        </div>
      </div>
    </div>
    <el-empty v-else description="还没有成交记录，去逛逛首页吧" />

    <!-- 评价 -->
    <el-dialog v-model="reviewDialog" title="评价这笔交易" width="480px">
      <el-alert type="info" :closable="false" class="mb"
                title="仅文字评价，不设星级；成交后 7 天内可评，双方均提交后展示。" />
      <el-input v-model="reviewContent" type="textarea" :rows="4" maxlength="500" show-word-limit />
      <template #footer>
        <el-button @click="reviewDialog = false">取消</el-button>
        <el-button type="primary" @click="submitReview">提交评价</el-button>
      </template>
    </el-dialog>

    <!-- 撤销 -->
    <el-dialog v-model="cancelDialog" title="撤销成交" width="460px">
      <el-alert type="warning" :closable="false" class="mb"
                title="撤销单方即时生效，不需要对方同意；对方有 7 天时间判定「已免责」或「计违约」，超时默认计违约（−2）。" />
      <el-radio-group v-model="cancelReason" class="reasons">
        <el-radio v-for="r in reasons" :key="r" :value="r">{{ r }}</el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="cancelDialog = false">取消</el-button>
        <el-button type="danger" @click="submitCancel">确认撤销</el-button>
      </template>
    </el-dialog>

    <!-- 判定 -->
    <el-dialog v-model="judgeDialog" title="撤销免责判定" width="460px">
      <p>对方撤销了这笔成交。你可以选择同意免责，或判定其违约。</p>
        <el-alert type="warning" :closable="false" class="mb" title="撤销必须由双方同意，审批通过后才生效。" />
      <template #footer>
        <el-button @click="judgeDialog = false">取消</el-button>
        <el-button @click="submitJudge('已免责')">同意免责</el-button>
        <el-button type="danger" @click="submitJudge('计违约')">判定违约</el-button>
      </template>
    </el-dialog>

    <!-- 举报用户 -->
    <el-dialog v-model="reportDialog" title="举报该用户" width="480px">
      <el-alert type="info" :closable="false" class="mb"
                title="对学生的举报只受理与该用户的成交或沟通中发生的行为" />
      <el-form label-position="top">
        <el-form-item label="举报类型">
          <el-radio-group v-model="reportType">
            <el-radio value="收款不履约">收款不履约</el-radio>
            <el-radio value="其他">其他</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="举报说明">
          <el-input v-model="reportReason" type="textarea" :rows="3" maxlength="200" show-word-limit
                    placeholder="说明发生了什么，便于管理员结合私信与成交记录核实" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reportDialog = false">取消</el-button>
        <el-button type="danger" @click="submitReport">提交举报</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import StatusTag from '../../components/StatusTag.vue';
import { favoriteApi, orderApi, socialApi } from '../../api';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const orders = ref([]);
const role = ref('all');
const reasons = ['买家不想要了', '卖家不卖了', '货物与描述不符', '约不上时间', '其他'];

const reviewDialog = ref(false);
const reviewContent = ref('');
const current = ref(null);

const cancelDialog = ref(false);
const cancelReason = ref(reasons[0]);

const judgeDialog = ref(false);

const reportDialog = ref(false);
const reportType = ref('收款不履约');
const reportReason = ref('');

function format(value) {
  return value ? String(value).replace('T', ' ').slice(0, 16) : '—';
}

async function load() {
  const res = await orderApi.mine(role.value);
  orders.value = res.data;
}

function openReview(o) {
  current.value = o;
  reviewContent.value = '';
  reviewDialog.value = true;
}

async function submitReview() {
  if (!reviewContent.value.trim()) {
    ElMessage.warning('请填写评价内容');
    return;
  }
  await orderApi.review(current.value.id, reviewContent.value.trim());
  ElMessage.success('评价已提交');
  reviewDialog.value = false;
  load();
}

function openCancel(o) {
  current.value = o;
  cancelReason.value = reasons[0];
  cancelDialog.value = true;
}

async function submitCancel() {
  await orderApi.cancel(current.value.id, cancelReason.value);
  ElMessage.success('撤销已生效');
  cancelDialog.value = false;
  load();
}

function openJudge(o) {
  current.value = o;
  judgeDialog.value = true;
}

async function submitJudge(judgement) {
  await orderApi.judge(current.value.id, judgement);
  ElMessage.success('判定已提交');
  judgeDialog.value = false;
  load();
}

function openProduct(o) {
  router.push(`/product/${o.productId}`);
}

function openReportUser(o) {
  current.value = o;
  reportType.value = '收款不履约';
  reportReason.value = '';
  reportDialog.value = true;
}

async function submitReport() {
  if (!reportReason.value.trim()) {
    ElMessage.warning('请填写举报说明');
    return;
  }
  await socialApi.report({
    targetType: '学生',
    targetId: current.value.peerId,
    type: reportType.value,
    reason: reportReason.value.trim()
  });
  ElMessage.success('举报已提交，管理员将在 24 小时内处理');
  reportDialog.value = false;
}

onMounted(load);
</script>

<style scoped>
.mb { margin-bottom: 12px; }
.list { display: flex; flex-direction: column; gap: 12px; }
.order { padding: 14px 16px; }
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.head-right { display: flex; gap: 6px; }
.role-tag {
  background: var(--brand-light);
  color: var(--brand);
  font-size: 12px;
  border-radius: 4px;
  padding: 2px 6px;
  margin-right: 8px;
}
.title { font-weight: 600; }
.meta {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 13px;
  margin-top: 8px;
}
.cancel-info {
  margin-top: 8px;
  font-size: 13px;
  color: #b26a00;
}
.ops {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.reasons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
