<template>
  <el-tag :type="type" size="small" effect="light">{{ status }}</el-tag>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ status: { type: String, default: '' } });
const map = {
  在售: 'success',
  待审核: 'warning',
  已售出: 'info',
  已下架: 'info',
  有效: 'success',
  已撤销: 'info',
  待判定: 'warning',
  已免责: 'success',
  计违约: 'danger',
  待处理: 'warning',
  已处理: 'success',
  已驳回: 'info'
};
const type = computed(() => map[props.status] || 'info');
</script>
