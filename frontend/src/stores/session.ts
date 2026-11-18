import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'
import type { User } from '@/types'

const KEY = 'bms-session'

export const useSession = defineStore('session', () => {
  const user = ref<User | null>(null)
  const points = ref(0)

  try {
    const raw = localStorage.getItem(KEY)
    if (raw) user.value = JSON.parse(raw) as User
  } catch { /* ignore */ }

  const isLoggedIn = computed(() => !!user.value)

  function persist() {
    try {
      if (user.value) localStorage.setItem(KEY, JSON.stringify(user.value))
      else localStorage.removeItem(KEY)
    } catch { /* ignore */ }
  }

  async function refreshPoints() {
    points.value = user.value ? (await api.getMember(user.value.userId)).pointsBalance : 0
  }

  async function login(loginId: string, password: string) {
    user.value = await api.login(loginId, password)
    persist()
    await refreshPoints()
  }

  async function register(input: { loginId: string; name: string; password: string; email: string; address: string }) {
    user.value = await api.register(input)
    persist()
    await refreshPoints()
  }

  function logout() {
    user.value = null
    points.value = 0
    persist()
  }

  async function updateProfile(patch: { name: string; email: string; address: string }) {
    if (!user.value) return
    user.value = await api.updateProfile(user.value.userId, patch)
    persist()
  }

  return { user, points, isLoggedIn, login, register, logout, refreshPoints, updateProfile }
})
