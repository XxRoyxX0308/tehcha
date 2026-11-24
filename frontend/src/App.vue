<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppFooter from '@/components/AppFooter.vue'
import TabBar from '@/components/TabBar.vue'
import ConsoleShell from '@/components/console/ConsoleShell.vue'
import Maintenance from '@/components/Maintenance.vue'
import { systemState } from '@/api'
import { useSession } from '@/stores/session'

const route = useRoute()
const session = useSession()
const consoleLayout = computed(() => !!route.meta.console)
// BMS-N-005: everyone but admins sees the maintenance notice
const blocked = computed(() => systemState.maintenance && !session.isAdmin && route.path !== '/login')
</script>

<template>
  <Maintenance v-if="blocked" />
  <ConsoleShell v-else-if="consoleLayout"><RouterView /></ConsoleShell>
  <div v-else class="shell">
    <a class="skip" href="#main">跳到主要內容</a>
    <AppHeader />
    <main id="main" class="grow"><RouterView /></main>
    <AppFooter />
    <TabBar />
  </div>
</template>

<style>
.shell { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
/* each page fades in when you navigate to it */
#main > * { animation: page-in 0.3s ease-out; }
/* leave room for the fixed phone tab bar */
@media (max-width: 720px) {
  .shell { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
}
</style>
