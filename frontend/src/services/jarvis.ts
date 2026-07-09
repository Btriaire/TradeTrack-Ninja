/**
 * Jarvis — Qwen2.5:3B tournant sur le VPS, appelé directement depuis le navigateur.
 * Passe par un reverse-proxy nginx en HTTPS (mixed-content bloqué sinon, le site
 * étant servi en HTTPS). Ne JAMAIS router ça par le backend Vercel : Jarvis met
 * régulièrement 15-30s à répondre, largement au-delà de la limite de 10s des
 * fonctions serverless Vercel.
 */
const JARVIS_URL = 'https://46.202.131.240.nip.io/jarvis/api/ask'
const JARVIS_TIMEOUT_MS = 45_000

export interface JarvisResult {
  available: boolean
  answer:    string | null
}

export async function askJarvis(question: string, project = 'bourse-tracker'): Promise<JarvisResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), JARVIS_TIMEOUT_MS)
  try {
    const res = await fetch(JARVIS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question, project }),
      signal:  controller.signal,
    })
    if (!res.ok) return { available: false, answer: null }
    const data = await res.json()
    return { available: !!data.success, answer: data.success ? (data.answer ?? null) : null }
  } catch {
    return { available: false, answer: null }
  } finally {
    clearTimeout(timer)
  }
}
