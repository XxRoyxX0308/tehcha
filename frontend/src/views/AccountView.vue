<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { http, errorText } from '@/api'
import { fmtDateTime, ROLE_LABEL } from '@/lib/format'
import { useSession } from '@/stores/session'

// CUI-001 / UMS-F-004: profile and password.
const session = useSession()
const router = useRouter()
const form = ref({ name: session.user!.name, email: session.user!.email, address: session.user!.address ?? '' })
const pw = ref({ old: '', next: '' })
const msg = ref('')
const err = ref('')

const flash = (m: string) => { msg.value = m; err.value = ''; setTimeout(() => (msg.value = ''), 2200) }

async function saveProfile() {
  err.value = ''
  try { await session.updateProfile({ ...form.value }); flash('個人資料已更新') } catch (e) { err.value = errorText(e) }
}

async function savePassword() {
  err.value = ''
  if (pw.value.next.length < 8) { err.value = '新密碼至少 8 個字元'; return }
  try {
    await http.post('/me/password', { oldPassword: pw.value.old, newPassword: pw.value.next })
    pw.value = { old: '', next: '' }
    flash('密碼已更新')
  } catch (e) { err.value = errorText(e, '更新失敗') }
}

async function logout() {
  await session.logout()
  void router.push('/')
}
</script>

<template>
  <div class="page wrap stack" style="--gap: 32px; max-width: 640px">
    <header class="stack" style="--gap: 6px">
      <p class="en">Account · {{ session.user?.loginId }} · {{ session.user?.roles.map((r) => ROLE_LABEL[r]).join('、') }}</p>
      <h1>會員資料</h1>
    </header>

    <section v-if="session.user?.warnings.length" class="notice notice--red stack" style="--gap: 6px" role="status">
      <strong>管理員通知</strong>
      <p v-for="w in session.user.warnings" :key="w.createdAt" class="small">{{ fmtDateTime(w.createdAt) }}：{{ w.reason }}</p>
    </section>

    <RouterLink v-if="session.isStaff" to="/staff" class="btn" style="justify-self: start">進入後台</RouterLink>

    <form class="stack" style="--gap: 16px" @submit.prevent="saveProfile">
      <div class="field"><label for="n">姓名</label><input id="n" v-model="form.name" class="input" maxlength="50" autocomplete="name" /></div>
      <div class="field"><label for="e">E-mail</label><input id="e" v-model="form.email" class="input" type="email" maxlength="100" autocomplete="email" /></div>
      <div class="field"><label for="a">預設地址</label><input id="a" v-model="form.address" class="input" maxlength="200" autocomplete="street-address" /></div>
      <button class="btn btn--primary" style="justify-self:start">儲存</button>
    </form>

    <hr class="rule" />

    <form class="stack" style="--gap: 16px" @submit.prevent="savePassword">
      <h2>變更密碼</h2>
      <div class="field"><label for="o">目前的密碼</label><input id="o" v-model="pw.old" class="input" type="password" autocomplete="current-password" /></div>
      <div class="field"><label for="x">新密碼（至少 8 個字元）</label><input id="x" v-model="pw.next" class="input" type="password" autocomplete="new-password" /></div>
      <button class="btn" style="justify-self:start">更新密碼</button>
    </form>

    <hr class="rule" />
    <button class="btn btn--danger" style="justify-self:start" @click="logout">登出</button>

    <p v-if="err" class="error" role="alert">{{ err }}</p>
    <div v-if="msg" class="toast" role="status">{{ msg }}</div>
  </div>
</template>
