import { onBeforeUnmount, ref } from 'vue'

/** Reactive media query, e.g. useMedia('(max-width: 600px)'). */
export function useMedia(query: string) {
  const mql = window.matchMedia(query)
  const matches = ref(mql.matches)
  const onChange = (e: MediaQueryListEvent) => { matches.value = e.matches }
  mql.addEventListener('change', onChange)
  onBeforeUnmount(() => mql.removeEventListener('change', onChange))
  return matches
}
