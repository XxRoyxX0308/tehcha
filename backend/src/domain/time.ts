// The shop runs on Taipei time while servers (Vercel, Neon) run on UTC.
export const BUSINESS_TZ = 'Asia/Taipei'

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** yyyy-mm-dd of the given instant in Taipei. */
export const businessDate = (d: Date = new Date()) => ymd.format(d)

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s // rejects 2026-02-30
}
