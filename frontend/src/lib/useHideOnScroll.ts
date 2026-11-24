import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * A header that slides away while you scroll down and comes back as soon as you scroll up.
 * It always shows near the top of the page. Jumps longer than a screen (a new route, a restored
 * position) don't count as scrolling, and the bounce past either end on phones is ignored.
 */
export function useHideOnScroll({ top = 120, tolerance = 8 } = {}) {
  const hidden = ref(false)
  let last = 0
  let frame = 0

  const read = () => {
    frame = 0
    const max = document.documentElement.scrollHeight - window.innerHeight
    const y = Math.min(Math.max(0, window.scrollY), Math.max(0, max))
    const dy = y - last
    if (y <= top) hidden.value = false
    else if (Math.abs(dy) > window.innerHeight) { /* a jump, not a scroll */ }
    else if (dy > tolerance) hidden.value = true
    else if (dy < -tolerance) hidden.value = false
    else return // small movement: keep measuring from the same point
    last = y
  }
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(read) }

  onMounted(() => {
    last = window.scrollY
    window.addEventListener('scroll', onScroll, { passive: true })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    cancelAnimationFrame(frame)
  })

  return { hidden, show: () => { hidden.value = false } }
}
