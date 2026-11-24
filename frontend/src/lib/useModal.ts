import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue'

// ── Page scroll lock, shared by every modal and drawer (counted, so nested ones are fine) ──
// The scrollbar is hidden while locked; the body is padded by its width so nothing jumps sideways
// and the dimmed backdrop reaches the right edge of the window.
let locks = 0
export function lockScroll() {
  if (locks++ > 0) return
  const root = document.documentElement
  const bar = window.innerWidth - root.clientWidth
  root.style.overflow = 'hidden'
  if (bar > 0) document.body.style.paddingRight = `${bar}px`
}
export function unlockScroll() {
  if (locks === 0 || --locks > 0) return
  document.documentElement.style.overflow = ''
  document.body.style.paddingRight = ''
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const open: symbol[] = [] // stack of open modals: only the top one answers Escape and Tab

/**
 * Modal behaviour: Escape closes, the page behind can't scroll, Tab stays inside,
 * focus moves in on open and back to where it was on close.
 * `initial` picks the element to focus first (default: the dialog box itself).
 * Bind `backdrop` to the overlay so a drag that starts inside the box (selecting text)
 * and ends on the overlay doesn't close it.
 */
export function useModal(box: Ref<HTMLElement | null>, close: () => void, initial?: string) {
  const id = Symbol('modal')
  let before: Element | null = null

  const onKey = (e: KeyboardEvent) => {
    if (open[open.length - 1] !== id) return
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key !== 'Tab' || !box.value) return
    const items = [...box.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)
    if (!items.length) { e.preventDefault(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const inside = box.value.contains(document.activeElement)
    if (e.shiftKey && (!inside || document.activeElement === first || document.activeElement === box.value)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus() }
  }

  onMounted(async () => {
    before = document.activeElement
    open.push(id)
    lockScroll()
    document.addEventListener('keydown', onKey)
    await nextTick()
    const target = (initial && box.value?.querySelector<HTMLElement>(initial)) || box.value
    target?.focus({ preventScroll: true })
  })
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey)
    open.splice(open.indexOf(id), 1)
    unlockScroll()
    if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true })
  })

  let downOnBackdrop = false
  const backdrop = {
    onPointerdown: (e: PointerEvent) => { downOnBackdrop = e.target === e.currentTarget },
    onClick: (e: MouseEvent) => {
      if (downOnBackdrop && e.target === e.currentTarget) close()
      downOnBackdrop = false
    },
  }
  return { backdrop }
}
