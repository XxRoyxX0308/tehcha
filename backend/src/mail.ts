import nodemailer, { type Transporter } from 'nodemailer'
import { env } from './env.ts'

// EXT-001: verification and order-confirmation mail over SMTP. Both are optional in the SRS
// (UMS-F-003, OCS-F-008): with no MAIL_HOST the system skips mail and accounts start active.

let transport: Transporter | null = null

export const mailEnabled = () => env.mail.enabled

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!env.mail.enabled) return false
  transport ??= nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465,
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
  })
  try {
    await transport.sendMail({ from: env.mail.from, to, subject, text })
    return true
  } catch (e) {
    console.error('mail failed:', (e as Error).message)
    return false
  }
}
