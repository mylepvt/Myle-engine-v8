import { type FormEvent, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  IdCard,
  Info,
  Loader2,
  Lock,
  Mail,
  Phone,
  Send,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react'

import { AuthCard } from '@/components/auth/AuthCard'
import { IconInput } from '@/components/auth/IconInput'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { authRegister } from '@/lib/auth-api'
import {
  playUiButton,
  playUiCelebration,
  playUiTap,
} from '@/lib/ui-sound'

function RequiredMark() {
  return (
    <span className="font-semibold text-primary" aria-hidden>
      *
    </span>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="whitespace-nowrap text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {children}
      </span>
      <div className="h-px min-w-0 flex-1 bg-white/[0.08]" />
    </div>
  )
}

type UplineLookup = {
  found: boolean
  is_valid_upline?: boolean
  message?: string
  name?: string | null
}

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  /** Requested unique FBO ID (primary account identifier). */
  const [fboId, setFboId] = useState('')
  /** Display name — required; shown in the app (not the same as FBO). */
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [uplineFboId, setUplineFboId] = useState('')
  const [phone, setPhone] = useState('')
  const [newJoining, setNewJoining] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [uplineLookup, setUplineLookup] = useState<UplineLookup | null>(null)
  const [uplineLookupPending, setUplineLookupPending] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fromUrl =
      searchParams.get('upline')?.trim() ||
      searchParams.get('ref')?.trim() ||
      ''
    if (fromUrl) {
      setUplineFboId(fromUrl)
    }
  }, [searchParams])

  async function refreshUplineLookup(raw: string) {
    const s = raw.trim()
    if (!s) {
      setUplineLookup(null)
      return
    }
    setUplineLookupPending(true)
    try {
      const r = await apiFetch(
        `/api/v1/auth/lookup-upline-fbo?fbo_id=${encodeURIComponent(s)}`,
      )
      const data = (await r.json()) as UplineLookup
      setUplineLookup(data)
    } catch {
      setUplineLookup({ found: false, message: 'Could not verify upline. Try again.' })
    } finally {
      setUplineLookupPending(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const emailTrim = email.trim()
    const uname = username.trim()
    if (uname.length < 2) {
      setFormError('Enter your display name (at least 2 characters).')
      return
    }
    const phoneDigits = phone.replace(/\s/g, '').trim()
    if (phoneDigits.length < 10) {
      setFormError('Enter a valid phone number (at least 10 digits).')
      return
    }
    if (!fboId.trim() || !uplineFboId.trim() || !password || !emailTrim) {
      setFormError('Please fill all required fields.')
      return
    }
    setSubmitting(true)
    playUiButton()
    try {
      const res = await authRegister({
        username: uname,
        password,
        email: emailTrim,
        fbo_id: fboId.trim(),
        upline_fbo_id: uplineFboId.trim(),
        phone: phoneDigits,
        is_new_joining: newJoining,
      })
      setSuccessMessage(res.message ?? 'Registration submitted! Your account is pending admin approval.')
      setSubmitted(true)
      playUiCelebration()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-20 top-[10%] h-80 w-80 rounded-full bg-primary/[0.08] blur-3xl" />
        <div className="absolute -right-20 bottom-[15%] h-72 w-72 rounded-full bg-white/[0.03] blur-3xl" />
      </div>

      <div className="relative z-[1] w-full max-w-[min(100%,26rem)]">
        <Link
          to="/login"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => playUiTap()}
        >
          <ArrowLeft className="size-4 shrink-0 opacity-80" aria-hidden />
          Back
        </Link>

        <AuthCard
          variant="split"
          icon={UserPlus}
          title="Join Myle Community"
          subtitle="Submit your registration request"
          footer={
            <p className="text-sm text-muted-foreground">
              Already in?{' '}
              <Link
                to="/login"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                Continue
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </p>
          }
        >
          {submitted ? (
            <div
              className="rounded-xl border border-primary/35 bg-primary/[0.08] px-3 py-3 text-center text-sm text-foreground"
              role="status"
            >
              <p className="font-medium text-foreground">{successMessage}</p>
              <p className="mt-2 text-muted-foreground">
                We&apos;ll notify you when you can continue.
              </p>
              <Link
                to="/login"
                className="mt-3 inline-flex items-center justify-center gap-1 font-semibold text-primary hover:underline"
              >
                Back to entry
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          ) : (
          <form className="space-y-6" onSubmit={(e) => void handleSubmit(e)} noValidate>
            {formError ? (
              <div
                key={formError}
                className="animate-shake rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
                role="alert"
              >
                {formError}
              </div>
            ) : null}
            <div className="space-y-3.5">
              <SectionTitle>Account</SectionTitle>
              <p className="text-xs leading-relaxed text-muted-foreground">
                You&apos;ll use <strong className="font-semibold text-foreground">FBO ID</strong> and password to
                continue. Display name is how you show up in the app.
              </p>
              <div>
                <label
                  className="mb-1.5 flex flex-wrap items-baseline gap-1 text-sm font-semibold text-foreground"
                  htmlFor="reg-fbo-id"
                >
                  FBO ID
                  <RequiredMark />
                </label>
                <IconInput
                  id="reg-fbo-id"
                  autoComplete="off"
                  value={fboId}
                  onChange={(e) => setFboId(e.target.value)}
                  placeholder="e.g. FBO-12345"
                  icon={IdCard}
                />
              </div>
              <div>
                <label
                  className="mb-1.5 flex flex-wrap items-baseline gap-1 text-sm font-semibold text-foreground"
                  htmlFor="reg-username"
                >
                  Display name
                  <RequiredMark />
                </label>
                <IconInput
                  id="reg-username"
                  autoComplete="nickname"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your name as it should appear"
                  icon={User}
                />
              </div>
              <div>
                <label
                  className="mb-1.5 flex flex-wrap items-baseline gap-1 text-sm font-semibold text-foreground"
                  htmlFor="reg-email"
                >
                  Email
                  <RequiredMark />
                </label>
                <IconInput
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  icon={Mail}
                />
              </div>
              <div>
                <label
                  className="mb-1.5 flex flex-wrap items-baseline gap-1 text-sm font-semibold text-foreground"
                  htmlFor="reg-password"
                >
                  Password
                  <RequiredMark />
                </label>
                <IconInput
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  icon={Lock}
                  endAdornment={
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((s) => !s)}
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  }
                />
              </div>
            </div>

            <div className="space-y-3.5">
              <SectionTitle>Network details</SectionTitle>
              <div>
                <label
                  className="mb-1.5 flex flex-wrap items-baseline gap-1 text-sm font-semibold text-foreground"
                  htmlFor="reg-upline"
                >
                  Upline FBO ID
                  <RequiredMark />
                </label>
                <IconInput
                  id="reg-upline"
                  value={uplineFboId}
                  onChange={(e) => {
                    setUplineFboId(e.target.value)
                    setUplineLookup(null)
                  }}
                  onBlur={() => void refreshUplineLookup(uplineFboId)}
                  placeholder="e.g. FBO-12345"
                  icon={IdCard}
                />
                {uplineLookupPending ? (
                  <p className="mt-2 text-xs text-muted-foreground">Checking upline…</p>
                ) : uplineLookup?.message ? (
                  <p
                    className={`mt-2 flex items-start gap-2 text-xs leading-relaxed ${
                      uplineLookup.is_valid_upline
                        ? 'text-emerald-400/95'
                        : 'text-amber-200/90'
                    }`}
                  >
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{uplineLookup.message}</span>
                  </p>
                ) : (
                  <p className="mt-2 flex items-start gap-2 text-xs italic leading-relaxed text-muted-foreground">
                    <Info
                      className="mt-0.5 size-3.5 shrink-0 text-primary/90"
                      aria-hidden
                    />
                    <span>
                      Pre-filled from invite link when opened with{' '}
                      <code className="rounded bg-muted/50 px-1 py-0.5 text-[0.7rem]">?upline=</code>.
                      Approved leader or admin FBO ID.
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3.5">
              <SectionTitle>Joining info</SectionTitle>
              <div>
                <label
                  className="mb-1.5 flex flex-wrap items-baseline gap-1 text-sm font-semibold text-foreground"
                  htmlFor="reg-phone"
                >
                  Phone
                  <RequiredMark />
                </label>
                <IconInput
                  id="reg-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10+ digit mobile number"
                  icon={Phone}
                />
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-muted/35 p-4">
                <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={newJoining}
                    onChange={(e) => setNewJoining(e.target.checked)}
                    className="mt-1 size-4 shrink-0 rounded border-white/25 bg-muted/40 text-primary accent-primary focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="min-w-0">
                    <span className="mb-1 flex flex-wrap items-center gap-2 font-semibold text-foreground">
                      <Sparkles className="size-4 text-primary" aria-hidden />
                      New Joining
                    </span>
                    <span className="text-muted-foreground">
                      Include me in the <strong className="font-semibold text-foreground">first time</strong> onboarding
                      track (7-day training program) when applicable.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <Button
              type="submit"
              variant="default"
              disabled={submitting}
              className="h-11 w-full gap-2 text-base font-semibold shadow-lg shadow-primary/20"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              {submitting ? 'Submitting…' : 'Submit registration request'}
            </Button>
          </form>
          )}
        </AuthCard>
      </div>
    </div>
  )
}
