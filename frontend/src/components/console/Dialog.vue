<script setup lang="ts">
import { ref } from 'vue'
import { useModal } from '@/lib/useModal'

// A modal for console forms: Escape and the ✕ close it, focus starts inside and returns after.
// Rendered at the end of <body>, so no page layout (margins, transforms) can shift the backdrop.
defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const box = ref<HTMLElement | null>(null)
const { backdrop } = useModal(box, () => emit('close'), 'input, select, textarea, button:not(.dlg__x)')
</script>

<template>
  <Teleport to="body">
    <div class="dlg" v-bind="backdrop">
      <section ref="box" class="dlg__box" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
        <header class="dlg__head">
          <h2>{{ title }}</h2>
          <button class="dlg__x" aria-label="關閉" @click="emit('close')"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg></button>
        </header>
        <div class="dlg__body"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dlg { position: fixed; inset: 0; z-index: 60; background: rgba(43, 33, 24, 0.45); display: grid; place-items: center; padding: 16px; animation: fade-in 0.2s ease-out; }
.dlg__box {
  width: min(560px, 100%); max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); overflow-y: auto; overscroll-behavior: contain;
  background: var(--paper); border: 1px solid var(--line); border-radius: 6px;
  animation: rise-in 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.dlg__box:focus { outline: none; }
.dlg__box.wide { width: min(820px, 100%); }
.dlg__head { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; background: var(--paper); border-bottom: 1px solid var(--line); }
.dlg__head h2 { font-size: 20px; }
.dlg__x { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border: 0; background: none; color: var(--tea); cursor: pointer; border-radius: 50%; transition: background 0.15s, color 0.15s; }
.dlg__x:hover { background: var(--paper-deep); color: var(--qinghua); }
.dlg__x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
.dlg__body { padding: 20px; }
@media (max-width: 600px) {
  .dlg { padding: 0; place-items: end stretch; }
  .dlg__box, .dlg__box.wide { width: 100%; max-height: 94dvh; border-radius: 14px 14px 0 0; border-bottom: 0; animation-name: sheet-up; }
  .dlg__body { padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
}
</style>
