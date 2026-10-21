import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Mail, ShieldCheck } from 'lucide-react'

import { type ConsentTerms, depositPublic } from '@/hooks/use-deposits-query'
import { formatIst } from '@/lib/deposits'

type Info = Awaited<ReturnType<typeof depositPublic.consentInfo>>

/**
 * The lead's own page (no login): confirm their mobile, read the deposit terms, agree.
 * Consent can be withdrawn later from the same link.
 */
export function DepositConsentPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [info, setInfo] = useState<Info | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [terms, setTerms] = useState<ConsentTerms | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const [email, setEmail] = useState('')
  const [editEmail, setEditEmail] = useState(false)

  useEffect(() => {
    depositPublic
      .consentInfo(token)
      .then(setInfo)
      .catch((e: Error) => setLoadError(e.message))
  }, [token])

  async function run(fn: () => Promise<ConsentTerms>): Promise<boolean> {
    setError(null)
    setBusy(true)
    try {
      setTerms(await fn())
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-muted p-4 sm:items-center">
      <div className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-5 text-card-foreground shadow-lg sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
          <p className="text-sm font-semibold text-foreground">{info?.business_name ?? 'Myle Community'}</p>
        </div>

        {loadError ? (
          <div>
            <p className="text-lg font-semibold text-foreground">Link not available</p>
            <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
          </div>
        ) : !info ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !terms ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => depositPublic.verify(token, phone))
            }}
          >
            <div>
              <h1 className="text-lg font-semibold text-foreground">Welcome to {info.business_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your ₹{info.amount_rupees} enrollment deposit is 100% refundable. Please read the terms on the next step
                before you agree. It takes less than a minute.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Enter your mobile number to continue (ends with {info.masked_phone.slice(-4)})
              </span>
              <input
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="field-input"
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || phone.replace(/\D/g, '').length < 10}
              className="btn-primary w-full rounded-full py-3 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm leading-relaxed text-foreground">
              {terms.terms_text}
            </div>

            {terms.state === 'given' ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 rounded-xl bg-success/10 p-3 text-sm text-success-ink">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Thank you, {terms.typed_name}! You agreed on {formatIst(terms.given_at)}. Your deposit is 100%
                    refundable, and you will get a receipt once you pay. You can close this page.
                  </span>
                </p>
                {terms.email && !editEmail ? (
                  <p className="flex items-start gap-2 rounded-xl bg-primary/10 p-3 text-sm text-foreground">
                    <Mail className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      {terms.welcome_email_sent_at
                        ? `Your welcome email is on its way to ${terms.email}. Check your inbox (and spam folder).`
                        : `We saved your email ${terms.email}. Your welcome email will follow.`}{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(terms.email ?? '')
                          setEditEmail(true)
                        }}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        Change
                      </button>
                    </span>
                  </p>
                ) : (
                  <form
                    className="space-y-2 rounded-xl border border-border p-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void run(() => depositPublic.saveEmail(token, phone, email.trim())).then((ok) => ok && setEditEmail(false))
                    }}
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Mail className="size-4 text-primary" aria-hidden />
                      Get your welcome email
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Add your email and we&apos;ll send you a welcome note with everything about your next steps.
                    </p>
                    <input
                      required
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="field-input"
                    />
                    <button
                      type="submit"
                      disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}
                      className="btn-primary w-full rounded-full py-2.5 text-sm font-semibold disabled:opacity-50"
                    >
                      {busy ? 'Sending…' : 'Send my welcome email'}
                    </button>
                  </form>
                )}
                {confirmWithdraw ? (
                  <div className="space-y-2 rounded-xl bg-destructive/10 p-3 text-sm">
                    <p className="text-foreground">
                      Withdraw your consent? Your deposit will be refunded and your enrollment will not continue.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => depositPublic.withdraw(token, phone))}
                        className="rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
                      >
                        {busy ? 'Saving…' : 'Yes, withdraw'}
                      </button>
                      <button type="button" onClick={() => setConfirmWithdraw(false)} className="px-3 py-2 text-sm text-muted-foreground">
                        Keep my consent
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmWithdraw(true)} className="text-sm text-muted-foreground underline">
                    Withdraw consent
                  </button>
                )}
              </div>
            ) : terms.state === 'withdrawn' ? (
              <p className="rounded-xl bg-muted p-3 text-sm text-foreground">
                You withdrew your consent. Your deposit will be refunded. Contact the person who sent you this link for
                any help.
              </p>
            ) : terms.state === 'pending' ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(() =>
                    depositPublic.accept(token, { phone, typed_name: name, agreed, terms_sha256: terms.terms_sha256 }),
                  )
                }}
              >
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1 size-4 shrink-0"
                  />
                  <span>I have read the terms above and I agree to them of my own free will.</span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Type your full name to sign</span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Full name"
                    className="field-input"
                  />
                </label>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <button
                  type="submit"
                  disabled={busy || !agreed || name.trim().length < 2}
                  className="btn-primary w-full rounded-full py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'I Agree'}
                </button>
                <p className="text-xs text-muted-foreground">
                  For your protection, this consent is saved with the date, time and device details, so your deposit and
                  refund are always on record.
                </p>
              </form>
            ) : (
              <p className="rounded-xl bg-muted p-3 text-sm text-foreground">
                This link is no longer active. Ask the person who sent it for a new link.
              </p>
            )}
            {terms.state !== 'pending' && error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
        {info ? (
          <p className="border-t border-border pt-3 text-center text-xs text-muted-foreground">
            Questions? Write to{' '}
            <a href={`mailto:${info.support_email}`} className="text-primary underline-offset-2 hover:underline">
              {info.support_email}
            </a>
          </p>
        ) : null}
      </div>
    </div>
  )
}
