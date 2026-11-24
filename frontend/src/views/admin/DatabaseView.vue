<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { http, errorText, systemState } from '@/api'
import { fmtDateTime } from '@/lib/format'

// AUI-002 / DBS-F-002, DBS-N-002: backups (a daily one is taken automatically and kept 30 days),
// restore from a snapshot or a downloaded file, the integrity check, and the maintenance notice.
interface Backup { id: number; kind: 'auto' | 'manual' | 'pre-restore'; createdAt: string; createdBy: string | null; sizeBytes: number; rowCounts: Record<string, number> }
interface Check { id: string; rule: string; ok: boolean; samples: { key: string; value: unknown }[] }

const backups = ref<Backup[]>([])
const busy = ref('')
const error = ref('')
const toast = ref('')
const integrity = ref<{ checkedAt: string; results: Check[]; counts: Record<string, string | number> } | null>(null)
const maint = reactive({ enabled: false, message: '' })
const KIND = { auto: '每日自動', manual: '手動', 'pre-restore': '還原前自動' } as const

async function load() {
  try {
    const [b, m] = await Promise.all([http.get<Backup[]>('/admin/backups'), http.get<{ enabled: boolean; message: string }>('/admin/maintenance')])
    backups.value = b
    Object.assign(maint, m)
  } catch (e) { error.value = errorText(e) }
}
onMounted(load)

async function run(label: string, fn: () => Promise<unknown>, done?: string) {
  busy.value = label
  error.value = ''
  try { await fn(); if (done) flash(done); await load() } catch (e) { error.value = errorText(e) } finally { busy.value = '' }
}
const backupNow = () => run('backup', () => http.post('/admin/backups'), '已建立備份')
const remove = (b: Backup) => confirm(`刪除 ${fmtDateTime(b.createdAt)} 的備份？`) && run(`del-${b.id}`, () => http.del(`/admin/backups/${b.id}`), '已刪除')

function confirmRestore(what: string) {
  const typed = prompt(`還原會以「${what}」取代目前所有營運資料（帳號、商品、訂單、點數…）。\n系統會先自動備份目前的資料。\n\n確定要還原，請輸入「還原」：`)
  return typed?.trim() === '還原'
}
async function restoreFrom(b: Backup) {
  if (!confirmRestore(fmtDateTime(b.createdAt) + ' 的備份')) return
  await run(`restore-${b.id}`, () => http.post(`/admin/backups/${b.id}/restore`), '還原完成')
  setTimeout(() => location.reload(), 1200)
}
const file = ref<HTMLInputElement | null>(null)
async function restoreFile() {
  const f = file.value?.files?.[0]
  if (!f) { error.value = '請先選擇備份檔'; return }
  if (!confirmRestore(f.name)) return
  await run('upload', () => http.post('/admin/restore', f), '還原完成')
  setTimeout(() => location.reload(), 1200)
}

const check = () => run('check', async () => { integrity.value = await http.get('/admin/integrity') })
const saveMaint = () => run('maint', async () => {
  const r = await http.put<{ enabled: boolean; message: string }>('/admin/maintenance', { enabled: maint.enabled, message: maint.message })
  systemState.maintenance = r.enabled
  systemState.message = r.message
}, maint.enabled ? '維護模式已開啟，顧客與店員會看到維護頁' : '維護模式已關閉')

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)
function flash(m: string) { toast.value = m; setTimeout(() => (toast.value = ''), 2800) }
</script>

<template>
  <div class="stack" style="--gap: 24px">
    <header>
      <p class="en">Database</p>
      <h1>資料庫維護</h1>
    </header>
    <p v-if="error" class="notice notice--red" role="alert">{{ error }}</p>

    <section class="panel stack" style="--gap: 14px">
      <div class="sec-head">
        <div>
          <h2>備份</h2>
          <p class="small muted">每天凌晨自動備份一次，保留 30 天。備份檔為壓縮的 JSON，可下載保存或用來還原。</p>
        </div>
        <button class="btn btn--primary" :disabled="!!busy" @click="backupNow">{{ busy === 'backup' ? '備份中…' : '立即備份' }}</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>時間</th><th>類型</th><th>建立者</th><th class="num">訂單</th><th class="num">帳號</th><th class="num">大小</th><th></th></tr></thead>
          <tbody>
            <tr v-for="b in backups" :key="b.id">
              <td>{{ fmtDateTime(b.createdAt) }}</td>
              <td><span class="tag" :class="{ 'tag--blue': b.kind === 'manual', 'tag--olive': b.kind === 'pre-restore' }">{{ KIND[b.kind] }}</span></td>
              <td>{{ b.createdBy ?? '—' }}</td>
              <td class="num">{{ b.rowCounts.orders?.toLocaleString() }}</td>
              <td class="num">{{ b.rowCounts.users }}</td>
              <td class="num">{{ size(b.sizeBytes) }}</td>
              <td class="acts">
                <a class="linkbtn" :href="http.href(`/admin/backups/${b.id}/download`)" download>下載</a>
                <button class="linkbtn" :disabled="!!busy" @click="restoreFrom(b)">{{ busy === `restore-${b.id}` ? '還原中…' : '還原' }}</button>
                <button class="linkbtn linkbtn--red" :disabled="!!busy" @click="remove(b)">刪除</button>
              </td>
            </tr>
            <tr v-if="!backups.length"><td colspan="7" class="muted">還沒有備份，按「立即備份」建立第一份。</td></tr>
          </tbody>
        </table>
      </div>
      <div class="row upload">
        <label for="bf" class="small">從檔案還原</label>
        <input id="bf" ref="file" type="file" accept=".gz,.json,application/gzip,application/json" class="small" />
        <button class="btn btn--small btn--danger" :disabled="!!busy" @click="restoreFile">{{ busy === 'upload' ? '還原中…' : '上傳並還原' }}</button>
      </div>
    </section>

    <section class="panel stack" style="--gap: 14px">
      <div class="sec-head">
        <div>
          <h2>資料完整性檢查</h2>
          <p class="small muted">依規格書的商業規則與完整性限制逐條檢查目前的資料。</p>
        </div>
        <button class="btn" :disabled="!!busy" @click="check">{{ busy === 'check' ? '檢查中…' : '執行檢查' }}</button>
      </div>
      <template v-if="integrity">
        <p class="small muted">
          {{ fmtDateTime(integrity.checkedAt) }} · {{ integrity.results.filter((r) => r.ok).length }} / {{ integrity.results.length }} 項通過 ·
          帳號 {{ integrity.counts.users }}、訂單 {{ integrity.counts.orders }}、商品 {{ integrity.counts.products }}、點數紀錄 {{ integrity.counts.pointLogs }} · 資料庫 {{ integrity.counts.dbSize }}
        </p>
        <ul class="checks">
          <li v-for="r in integrity.results" :key="r.id" :class="{ bad: !r.ok }">
            <span class="mark" :aria-label="r.ok ? '通過' : '未通過'">{{ r.ok ? '✓' : '✕' }}</span>
            <code>{{ r.id }}</code>
            <span>{{ r.rule }}</span>
            <span v-if="!r.ok" class="small">違反：{{ r.samples.map((s) => s.key).join('、') }}</span>
          </li>
        </ul>
      </template>
    </section>

    <section class="panel stack" style="--gap: 14px">
      <h2>維護模式</h2>
      <p class="small muted">開啟後，除了管理員以外的人都會看到維護頁，無法點餐或操作後台。</p>
      <label class="check"><input v-model="maint.enabled" type="checkbox" /> 開啟維護模式</label>
      <div class="field"><label for="mm">顯示給使用者的訊息</label><input id="mm" v-model="maint.message" class="input" maxlength="200" placeholder="例如：系統更新中，預計 30 分鐘後恢復" /></div>
      <button class="btn" :class="{ 'btn--danger': maint.enabled }" style="justify-self: start" :disabled="!!busy" @click="saveMaint">儲存設定</button>
    </section>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.sec-head { display: flex; justify-content: space-between; align-items: start; gap: 16px; flex-wrap: wrap; }
.sec-head h2, .panel > h2 { font-size: 20px; }
.acts { white-space: nowrap; text-align: right; }
.acts > * + * { margin-left: 14px; }
.upload { flex-wrap: wrap; padding-top: 6px; }
.checks { list-style: none; margin: 0; padding: 0; }
.checks li { display: grid; grid-template-columns: 24px 96px 1fr; gap: 4px 10px; padding: 9px 0; border-bottom: 1px solid var(--line); align-items: baseline; font-size: 14px; }
.checks li > .small { grid-column: 3; color: var(--seal); }
.mark { color: var(--qinghua); font-weight: 700; }
.bad .mark { color: var(--seal); }
code { font-size: 12px; color: var(--tea); }
</style>
