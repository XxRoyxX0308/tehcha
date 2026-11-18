<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { useSession } from '@/stores/session'

const session = useSession()
const router = useRouter()
function logout() {
  session.logout()
  void router.push('/')
}
const form = ref({ name: session.user!.name, email: session.user!.email, address: session.user!.address })
const pw = ref({ old: '', next: '' })
const msg = ref('')
const err = ref('')

const flash = (m: string) => { msg.value = m; err.value = ''; setTimeout(() => (msg.value = ''), 2200) }

async function saveProfile() {
  if (!form.value.name.trim() || !/^\S+@\S+\.\S+$/.test(form.value.email)) { err.value = '請填寫姓名與正確的 Email'; return }
  await session.updateProfile({ ...form.value })
  flash('個人資料已更新')
}

async function savePassword() {
  if (pw.value.next.length < 8) { err.value = '新密碼至少 8 碼'; return }
  try {
    await api.changePassword(session.user!.userId, pw.value.old, pw.value.next)
    pw.value = { old: '', next: '' }
    flash('密碼已更新')
  } catch (e) {
    err.value = e instanceof ApiError ? e.message : '更新失敗'
  }
}
</script>

<template>
  <div class="page wrap stack" style="--gap: 32px; max-width: 640px">
    <header class="stack" style="--gap: 6px">
      <p class="en">Account · {{ session.user?.loginId }}</p>
      <h1>會員資料</h1>
    </header>

    <form class="stack" style="--gap: 16px" @submit.prevent="saveProfile">
      <div class="field"><label for="n">姓名</label><input id="n" v-model="form.name" class="input" maxlength="50" /></div>
      <div class="field"><label for="e">Email</label><input id="e" v-model="form.email" class="input" type="email" /></div>
      <div class="field"><label for="a">預設地址</label><input id="a" v-model="form.address" class="input" maxlength="200" /></div>
      <button class="btn btn--primary" style="justify-self:start">儲存</button>
    </form>

    <hr class="rule" />

    <form class="stack" style="--gap: 16px" @submit.prevent="savePassword">
      <h2>變更密碼</h2>
      <div class="field"><label for="o">舊密碼</label><input id="o" v-model="pw.old" class="input" type="password" autocomplete="current-password" /></div>
      <div class="field"><label for="x">新密碼（至少 8 碼）</label><input id="x" v-model="pw.next" class="input" type="password" autocomplete="new-password" /></div>
      <button class="btn" style="justify-self:start">更新密碼</button>
    </form>

    <hr class="rule" />
    <button class="btn btn--danger" style="justify-self:start" @click="logout">登出</button>

    <p v-if="err" class="error" role="alert">{{ err }}</p>
    <div v-if="msg" class="toast" role="status">{{ msg }}</div>
  </div>
</template>
