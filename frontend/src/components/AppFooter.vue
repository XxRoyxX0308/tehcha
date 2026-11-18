<script setup lang="ts">
import Seal from './Seal.vue'
</script>

<template>
  <footer class="foot">
    <div class="wave" aria-hidden="true"></div>
    <div class="wrap foot__in">
      <p class="foot__l">得一杯好茶，得片刻清閒。</p>
      <div class="foot__c"><Seal :size="46" /><span class="en">Tehcha</span></div>
      <p class="foot__r small muted">手搖飲管理系統 BMS · 前端原型</p>
    </div>
  </footer>
</template>

<style scoped>
.foot { margin-top: auto; }
.foot__in { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding-block: 28px; }
.foot__l { font-family: var(--serif); color: var(--qinghua); font-size: 18px; }
.foot__c { display: grid; justify-items: center; gap: 4px; }
.foot__r { text-align: right; }
@media (max-width: 640px) {
  .foot__in { grid-template-columns: 1fr; text-align: center; }
  .foot__r { text-align: center; }
}
</style>
