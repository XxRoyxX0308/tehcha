import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { http } from '@/api'
import type { User } from '@/types'

// The signed-in user comes from the server cookie session (GET /api/auth/me).
export const useSession = defineStore('session', () => {
  const user = ref<User | null>(null)

  const isLoggedIn = computed(() => !!user.value)
  const has = (role: string) => !!user.value?.roles.includes(role as never)
  const isCustomer = computed(() => has('customer') && !!user.value?.memberId)
  const isStaff = computed(() => has('staff') || has('admin'))
  const isAdmin = computed(() => has('admin'))
  const points = computed(() => user.value?.pointsBalance ?? 0)
  /** Where this account lands after signing in. */
  const home = computed(() => (isCustomer.value ? '/menu' : isStaff.value ? '/staff' : '/'))

  async function refresh() {
    try {
      user.value = (await http.get<{ user: User | null }>('/auth/me')).user
    } catch {
      user.value = null
    }
  }

  async function login(loginId: string, password: string) {
    user.value = (await http.post<{ user: User }>('/auth/login', { loginId, password })).user
  }

  /** Returns 'verify' when the account waits for the e-mail link (UMS-F-003). */
  async function register(input: { loginId: string; name: string; password: string; email: string; address: string }) {
    const r = await http.post<{ user: User | null; needsVerification?: boolean }>('/auth/register', input)
    if (r.needsVerification) return 'verify' as const
    user.value = r.user
    return 'ok' as const
  }

  async function logout() {
    try { await http.post('/auth/logout') } finally { user.value = null }
  }

  async function updateProfile(patch: { name: string; email: string; address: string }) {
    await http.patch('/me', patch)
    await refresh()
  }

  return { user, isLoggedIn, isCustomer, isStaff, isAdmin, points, home, refresh, refreshPoints: refresh, login, register, logout, updateProfile }
})
