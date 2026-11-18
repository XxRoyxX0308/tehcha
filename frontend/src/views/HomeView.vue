<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Art from '@/components/Art.vue'
import { useCatalog } from '@/stores/catalog'

const catalog = useCatalog()
</script>

<template>
  <div class="page wrap">
    <section class="hero center">
      <p class="en">Hand-shaken tea · 手搖茶飲</p>
      <h1>得茶，且得閒</h1>
      <p class="hero__sub">山間茶葉、手工熬煮，依你的口味調整甜度與冰塊。線上點餐，到店即取。</p>
      <div class="row hero__cta">
        <RouterLink to="/menu" class="btn btn--primary">開始點餐</RouterLink>
        <RouterLink to="/orders" class="btn">我的訂單</RouterLink>
      </div>
    </section>

    <section class="trio">
      <article>
        <Art kind="pot" class="art" />
        <RouterLink to="/menu" class="btn btn--small">瀏覽菜單</RouterLink>
        <p class="small">原葉茶、鮮奶茶、果茶與本草，依分類慢慢挑。</p>
      </article>
      <article>
        <Art kind="bowl" class="art" />
        <RouterLink to="/menu" class="btn btn--small">選擇門市</RouterLink>
        <p class="small">目前門市：{{ catalog.store?.name }}。{{ catalog.store?.address }}</p>
      </article>
      <article>
        <Art kind="cups" class="art" />
        <RouterLink to="/points" class="btn btn--small">茶點數</RouterLink>
        <p class="small">每消費 NT$10 累積 1 點，1 點可折抵 NT$1。</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.hero { max-width: 640px; margin: 0 auto; display: grid; gap: 14px; justify-items: center; padding-bottom: clamp(32px, 6vw, 64px); }
.hero__sub { color: var(--tea); max-width: 46ch; }
.hero__cta { margin-top: 8px; flex-wrap: wrap; justify-content: center; }
.trio { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(20px, 5vw, 64px); align-items: end; }
.trio article { display: grid; justify-items: center; gap: 14px; text-align: center; }
.trio .small { max-width: 28ch; color: var(--ink); }
.art { width: min(100%, 220px); height: auto; color: var(--qinghua); }
/* Phones: keep the three side by side as small icons-with-buttons, hide the blurbs */
@media (max-width: 720px) {
  .hero { padding-bottom: 36px; }
  .trio { gap: 8px; }
  .trio article { gap: 10px; }
  .trio .small { display: none; }
  .art { width: 100%; max-width: 104px; }
  .trio .btn--small { padding: 0 10px; font-size: 13px; min-height: 32px; }
}
</style>
