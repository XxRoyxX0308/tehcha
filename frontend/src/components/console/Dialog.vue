<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

// A modal for console forms: Escape and the ✕ close it, focus starts inside and returns after.
defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const box = ref<HTMLElement | null>(null)
let before: Element | null = null

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(async () => {
  before = document.activeElement
  window.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
  await nextTick()
  box.value?.querySelector<HTMLElement>('input, select, textarea, button:not(.dlg__x)')?.focus()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
  if (before instanceof HTMLElement) before.focus()
})
</script>

<template>
  <div class="dlg" @click.self="emit('close')">
    <section ref="box" class="dlg__box" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title">
      <header class="dlg__head">
        <h2>{{ title }}</h2>
        <button class="dlg__x" aria-label="關閉" @click="emit('close')">✕</button>
      </header>
      <div class="dlg__body"><slot /></div>
    </section>
  </div>
</template>

<style scoped>
.dlg { position: fixed; inset: 0; z-index: 60; background: rgba(43, 33, 24, 0.45); display: grid; place-items: center; padding: 16px; overflow-y: auto; }
.dlg__box { width: min(560px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; }
.dlg__box.wide { width: min(820px, 100%); }
.dlg__head { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; background: var(--paper); border-bottom: 1px solid var(--line); }
.dlg__head h2 { font-size: 20px; }
.dlg__x { width: 40px; height: 40px; border: 0; background: none; color: var(--tea); font-size: 18px; cursor: pointer; border-radius: 4px; }
.dlg__x:hover { background: var(--paper-deep); }
.dlg__body { padding: 20px; }
@media (max-width: 600px) {
  .dlg { padding: 0; place-items: end stretch; }
  .dlg__box { width: 100%; max-height: 94dvh; border-radius: 14px 14px 0 0; }
}
</style>
