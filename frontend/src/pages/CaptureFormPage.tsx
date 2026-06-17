import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { apiFetch } from '@/lib/api'

type LinkInfo = {
  owner_name: string
  category: string
  category_label: string
}

export function CaptureFormPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [age, setAge] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch(`/api/capture/${token}`, { skipAuthRetry: true })
        if (!res.ok) {
          throw new Error('This link is no longer active.')
        }
        const data = (await res.json()) as LinkInfo
        if (!cancelled) setInfo(data)
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/capture/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        skipAuthRetry: true,
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          city: city.trim() || null,
          age: age ? Number(age) : null,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail || 'Could not submit. Please try again.')
      }
      setDone(true)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        {loading ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : loadError ? (
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-800">Link not available</p>
            <p className="mt-1 text-sm text-slate-500">{loadError}</p>
          </div>
        ) : done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl">
              ✓
            </div>
            <p className="text-lg font-semibold text-slate-800">Thank you!</p>
            <p className="mt-1 text-sm text-slate-500">
              {info?.owner_name} will reach out to you soon.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-slate-500">Connect with</p>
              <p className="text-xl font-semibold text-slate-800">{info?.owner_name}</p>
            </div>

            <Field label="Your name *">
              <input
                required
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </Field>
            <Field label="Phone number *">
              <input
                required
                type="tel"
                inputMode="tel"
                className="form-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="WhatsApp / mobile number"
              />
            </Field>
            <Field label="City">
              <input
                className="form-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Your city"
              />
            </Field>
            <Field label="Age">
              <input
                type="number"
                min={1}
                max={120}
                inputMode="numeric"
                className="form-input"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Age"
              />
            </Field>

            {submitError ? (
              <p className="text-sm text-red-600">{submitError}</p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? 'Sending…' : 'Submit'}
            </button>
            <p className="text-center text-xs text-slate-400">
              Your details are shared only with {info?.owner_name}.
            </p>
          </form>
        )}
      </div>
      <style>{`.form-input{width:100%;border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.625rem 0.75rem;font-size:0.875rem;outline:none}.form-input:focus{border-color:#0f172a}`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}
