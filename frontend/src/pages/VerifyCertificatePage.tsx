import { type FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, ShieldX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { apiUrl } from '@/lib/api'

type VerifiedCertificate = {
  certificate_no: string
  type: 'training' | 'day2'
  title: string
  programme: string
  name: string
  fbo_id: string | null
  issued_on: string
  score: string | null
}

type Result = { valid: boolean; certificate: VerifiedCertificate | null }

/** Public page opened by the QR code on MYLE certificates. */
export function VerifyCertificatePage() {
  const [params, setParams] = useSearchParams()
  const no = params.get('no') ?? ''
  const code = params.get('c') ?? ''
  const [formNo, setFormNo] = useState(no)
  const [formCode, setFormCode] = useState(code)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!no || !code) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const qs = new URLSearchParams({ no, c: code }).toString()
        const res = await fetch(apiUrl(`/api/public/certificates/verify?${qs}`))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as Result
        if (!cancelled) setResult(body)
      } catch {
        if (!cancelled) setError('Could not check the certificate right now. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [no, code])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setResult(null)
    setParams({ no: formNo.trim(), c: formCode.trim() })
  }

  const cert = result?.certificate

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-lg">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          MYLE Community
        </p>
        <h1 className="mt-2 text-center text-2xl font-bold">Certificate Verification</h1>

        {loading ? <p className="mt-8 text-center text-muted-foreground">Checking…</p> : null}
        {error ? <p className="mt-8 text-center text-destructive">{error}</p> : null}

        {result && !loading ? (
          result.valid && cert ? (
            <div className="mt-8 rounded-2xl border border-success/30 bg-success/[0.08] p-6">
              <div className="flex items-center gap-2 text-success-ink">
                <BadgeCheck className="size-6" aria-hidden />
                <p className="text-lg font-bold">Verified — this certificate is genuine</p>
              </div>
              <dl className="mt-5 space-y-3 text-sm">
                <Row label="Name" value={cert.name} />
                <Row label="Certificate" value={cert.title} />
                <Row label="Programme" value={cert.programme} />
                {cert.score ? <Row label="Score" value={cert.score} /> : null}
                <Row label="Date of issue" value={cert.issued_on} />
                {cert.fbo_id ? <Row label="FBO ID" value={cert.fbo_id} /> : null}
                <Row label="Certificate no." value={cert.certificate_no} mono />
              </dl>
              <p className="mt-5 text-xs text-muted-foreground">
                Issued by MYLE Community. Details are read live from MYLE's records.
              </p>
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/[0.08] p-6">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldX className="size-6" aria-hidden />
                <p className="text-lg font-bold">Not valid</p>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                No genuine MYLE certificate matches this number and code. The certificate may be
                edited or fake — check the number and code printed under the QR code.
              </p>
            </div>
          )
        ) : null}

        <form onSubmit={onSubmit} className="mt-8 space-y-3 rounded-2xl border border-border p-5">
          <p className="text-sm font-semibold">Check a certificate</p>
          <label className="block text-xs text-muted-foreground">
            Certificate no.
            <input
              className="field-input mt-1 w-full font-mono"
              placeholder="MYLE/TRN/2026/00001"
              value={formNo}
              onChange={(e) => setFormNo(e.target.value)}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Verification code
            <input
              className="field-input mt-1 w-full font-mono uppercase"
              placeholder="XXXX-XXXX"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
            />
          </label>
          <Button type="submit" className="w-full" disabled={!formNo.trim() || !formCode.trim()}>
            Verify
          </Button>
        </form>
      </div>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono font-semibold' : 'text-right font-semibold'}>{value}</dd>
    </div>
  )
}
