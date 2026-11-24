<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Art from '@/components/Art.vue'
import { errorText } from '@/api'
import { useSession } from '@/stores/session'
import { useCatalog } from '@/stores/catalog'

// CUI-001: register and sign in with a login id. Staff and admin accounts come from the admin,
// never from this form (UMS-F-007).
const props = defineProps<{ mode: 'login' | 'register' }>()
const session = useSession()
const catalog = useCatalog()
const route = useRoute()
const router = useRouter()

const f = reactive({ loginId: '', name: '', password: '', email: '', address: '' })
const error = ref('')
const info = ref(route.query.verified === '1' ? 'E-mail 已驗證，請登入。' : route.query.verified === '0' ? '驗證連結無效或已過期。' : '')
const busy = ref(false)
const demo = computed(() => props.mode === 'login')

function validate(): string {
  if (!f.loginId.trim()) return '請輸入登入帳號'
  if (!f.password) return '請輸入密碼'
  if (props.mode === 'register') {
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(f.loginId.trim())) return '登入帳號須為 3 至 30 個英數字、底線、點或連字號'
    if (!f.name.trim()) return '請輸入姓名'
    if (f.password.length < 8) return '密碼至少 8 個字元'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return 'E-mail 格式不正確'
    if (!f.address.trim()) return '請輸入地址'
  }
  return ''
}

async function submit() {
  error.value = validate()
  if (error.value) return
  busy.value = true
  try {
    if (props.mode === 'login') {
      await session.login(f.loginId.trim(), f.password)
    } else if ((await session.register({ ...f, loginId: f.loginId.trim() })) === 'verify') {
      info.value = '驗證信已寄出，請點信中的連結啟用帳號後再登入。'
      void router.replace('/login')
      return
    }
    if (!catalog.loaded) await catalog.load()
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : session.home
    void router.replace(next)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = false
  }
}
function fill(id: string, pw: string) { f.loginId = id; f.password = pw }
</script>

<template>
  <div class="page wrap auth">
    <Art kind="sprig" class="art" />
    <form class="stack" style="--gap: 16px" novalidate @submit.prevent="submit">
      <header class="stack" style="--gap: 6px">
        <p class="en">{{ mode === 'login' ? 'Welcome back' : 'Join us' }}</p>
        <h1>{{ mode === 'login' ? '登入' : '加入會員' }}</h1>
      </header>

      <p v-if="info" class="notice notice--blue" role="status">{{ info }}</p>

      <div class="field"><label for="l">登入帳號</label><input id="l" v-model="f.loginId" class="input" autocomplete="username" maxlength="30" /></div>
      <template v-if="mode === 'register'">
        <div class="field"><label for="n">姓名</label><input id="n" v-model="f.name" class="input" autocomplete="name" maxlength="50" /></div>
        <div class="field"><label for="m">E-mail</label><input id="m" v-model="f.email" class="input" type="email" autocomplete="email" maxlength="100" /></div>
        <div class="field"><label for="a">地址</label><input id="a" v-model="f.address" class="input" autocomplete="street-address" maxlength="200" /></div>
      </template>
      <div class="field"><label for="p">密碼</label><input id="p" v-model="f.password" class="input" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" /></div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="btn btn--primary" :disabled="busy">{{ busy ? '處理中…' : mode === 'login' ? '登入' : '建立帳號' }}</button>

      <p class="small muted">
        <template v-if="mode === 'login'">還沒有帳號？<RouterLink :to="{ path: '/register', query: route.query }">加入會員</RouterLink></template>
        <template v-else>已經有帳號？<RouterLink :to="{ path: '/login', query: route.query }">登入</RouterLink></template>
      </p>

      <div v-if="demo" class="demo small">
        <span class="muted">試用帳號：</span>
        <button type="button" class="linkbtn" @click="fill('demo', 'demo1234')">顧客 demo</button>
        <button type="button" class="linkbtn" @click="fill('staff_ntut', 'staff1234')">店員 staff_ntut</button>
        <button type="button" class="linkbtn" @click="fill('admin', 'admin1234')">管理員 admin</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.auth { display: grid; grid-template-columns: 1fr minmax(0, 420px); gap: clamp(24px, 8vw, 96px); align-items: center; max-width: 900px; }
.art { width: min(100%, 300px); justify-self: center; color: var(--qinghua); }
.demo { display: flex; flex-wrap: wrap; gap: 6px 14px; padding-top: 12px; border-top: 1px dashed var(--line); }
.demo .linkbtn { min-height: 32px; }
@media (max-width: 720px) { .auth { grid-template-columns: 1fr; } .art { width: 120px; } }
</style>
