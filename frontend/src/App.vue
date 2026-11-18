<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppFooter from '@/components/AppFooter.vue'
import TabBar from '@/components/TabBar.vue'
</script>

<template>
  <div class="shell">
    <AppHeader />
    <main class="grow"><RouterView /></main>
    <AppFooter />
    <TabBar />
  </div>
</template>

<style>
.shell { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
/* leave room for the fixed phone tab bar */
@media (max-width: 720px) {
  .shell { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
}
</style>
