import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Lock, ShieldCheck, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { apiUrl } from '@/lib/api'

type TestQuestion = {
  id: number
  q: string
  options: string[]
}

type TestState = {
  status: 'created' | 'active' | 'submitted'
  total: number
  index: number
  pass_mark: number
  time_limit_seconds: number
  time_left_seconds: number
  prospect_name: string | null
  question: TestQuestion | null
  score?: number
  passed?: boolean
}

type AntiCheatEvent = 'blur' | 'hidden' | 'copy' | 'paste'

async function readJsonError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
    return body.detail
  }
  return res.statusText || `HTTP ${res.status}`
}

function fmtClock(totalSec: number): string {
  const s = Math.max(0, totalSec)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function Day2TestPage() {
  const { token } = useParams<{ token: string }>()

  const [state, setState] = useState<TestState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // identity gate
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [startBusy, setStartBusy] = useState(false)

  // active question
  const [choice, setChoice] = useState<number | null>(null)
  const [answerBusy, setAnswerBusy] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [warning, setWarning] = useState<number>(0)

  const finalizingRef = useRef(false)

  const post = useCallback(
    async (suffix: string, body?: unknown): Promise<TestState> => {
      const res = await fetch(apiUrl(`/test/d2/${token}${suffix}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await readJsonError(res))
      return (await res.json()) as TestState
    },
    [token],
  )

  const reportEvent = useCallback(
    (type: AntiCheatEvent) => {
      if (!token) return
      void fetch(apiUrl(`/test/d2/${token}/event`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      }).catch(() => undefined)
    },
    [token],
  )

  // initial load
  useEffect(() => {
    if (!token) {
      setError('This test link is incomplete.')
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/test/d2/${token}`))
        if (!res.ok) throw new Error(await readJsonError(res))
        const data = (await res.json()) as TestState
        if (!cancelled) {
          setState(data)
          setSecondsLeft(data.time_left_seconds)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open this test.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const applyState = useCallback((data: TestState) => {
    setState(data)
    setSecondsLeft(data.time_left_seconds)
    setChoice(null)
  }, [])

  const finalize = useCallback(async () => {
    if (finalizingRef.current) return
    finalizingRef.current = true
    try {
      const data = await post('/finalize')
      applyState(data)
    } catch {
      // ignore — server timer is authoritative; reload state
      try {
        const res = await fetch(apiUrl(`/test/d2/${token}`))
        if (res.ok) applyState((await res.json()) as TestState)
      } catch {
        /* noop */
      }
    } finally {
      finalizingRef.current = false
    }
  }, [applyState, post, token])

  // countdown ticker (active only)
  useEffect(() => {
    if (state?.status !== 'active') return
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null) return prev
        const next = prev - 1
        if (next <= 0) {
          clearInterval(id)
          void finalize()
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [state?.status, state?.index, finalize])

  // anti-cheat: tab switch / window blur / copy / paste
  useEffect(() => {
    if (state?.status !== 'active') return
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        reportEvent('hidden')
        setWarning((w) => w + 1)
      }
    }
    const onBlur = () => {
      reportEvent('blur')
      setWarning((w) => w + 1)
    }
    const onCopy = (e: Event) => {
      e.preventDefault()
      reportEvent('copy')
    }
    const onPaste = (e: Event) => {
      e.preventDefault()
      reportEvent('paste')
    }
    const onContext = (e: Event) => e.preventDefault()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    document.addEventListener('contextmenu', onContext)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('contextmenu', onContext)
    }
  }, [state?.status, reportEvent])

  const handleStart = async (e: FormEvent) => {
    e.preventDefault()
    if (startBusy) return
    setStartBusy(true)
    setError(null)
    try {
      const data = await post('/start', { name: name.trim(), phone: phone.trim() })
      applyState(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the test.')
    } finally {
      setStartBusy(false)
    }
  }

  const handleAnswer = async () => {
    if (choice === null || answerBusy || !state?.question) return
    setAnswerBusy(true)
    setError(null)
    try {
      const data = await post('/answer', {
        question_index: state.index,
        choice_index: choice,
      })
      applyState(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answer.')
    } finally {
      setAnswerBusy(false)
    }
  }

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-[#040915] text-white"
      style={{ userSelect: state?.status === 'active' ? 'none' : 'auto' }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-10rem] h-[24rem] w-[24rem] rounded-full bg-cyan-400/18 blur-3xl" />
        <div className="absolute right-[-10rem] top-[4rem] h-[28rem] w-[28rem] rounded-full bg-blue-500/16 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(8,15,30,0.72),rgba(3,6,13,0.96))]" />
      </div>

      <header className="relative border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/70">Myle Business Test</p>
            <p className="mt-1 text-ds-h2">Day 2 Evaluation</p>
          </div>
          {state?.status === 'active' && (
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-lg font-bold tabular-nums">
              <Clock className="size-4 text-cyan-200" />
              {fmtClock(secondsLeft ?? 0)}
            </div>
          )}
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-4 py-8">
        {loading ? (
          <p className="text-center text-white/60">Loading…</p>
        ) : error && !state ? (
          <div className="mx-auto max-w-xl rounded-[2rem] border border-red-400/20 bg-red-500/[0.08] px-6 py-8 text-center">
            <p className="text-base font-semibold text-white">This test could not be opened.</p>
            <p className="mt-2 text-sm text-white/70">{error}</p>
          </div>
        ) : state?.status === 'created' ? (
          // ── Identity gate ──────────────────────────────────────────────
          <form
            onSubmit={(e) => void handleStart(e)}
            className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-muted/50 p-6 backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center gap-2">
              <Lock className="size-5 text-cyan-200" />
              <h1 className="text-xl font-semibold">Apni details verify kariye</h1>
            </div>
            <p className="mb-5 text-sm text-white/62">
              Test sirf ek baar de sakte ho. Apne hi phone par, bina kisi ki madad ke complete kariye.
              {' '}
              {state.total} questions • {fmtClock(state.time_limit_seconds)} time • Pass {state.pass_mark}/
              {state.total}.
            </p>
            <label className="block">
              <span className="text-sm font-medium">Full name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aapka pura naam"
                className="mt-2 w-full rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-cyan-300/30 focus:ring-2 focus:ring-cyan-300/15"
              />
            </label>
            <label className="mt-4 block">
              <span className="text-sm font-medium">Phone number</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                placeholder="Registered mobile number"
                className="mt-2 w-full rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-cyan-300/30 focus:ring-2 focus:ring-cyan-300/15"
              />
            </label>
            {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            <Button type="submit" disabled={startBusy} className="mt-5 w-full">
              {startBusy ? 'Starting…' : 'Start test'}
            </Button>
            <div className="mt-4 flex items-start gap-2 rounded-[1.25rem] border border-amber-300/20 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <span>
                Tab switch, copy-paste aur back allowed nahi hai. Timer start hone ke baad test paused
                nahi hoga.
              </span>
            </div>
          </form>
        ) : state?.status === 'active' && state.question ? (
          // ── Active question ────────────────────────────────────────────
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex items-center justify-between">
              <Badge variant="outline" className="border-white/15 bg-muted/40 text-white/75">
                Question {state.index + 1} / {state.total}
              </Badge>
              <span className="text-xs text-white/50">No back • No skip</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all"
                style={{ width: `${((state.index) / state.total) * 100}%` }}
              />
            </div>

            <div className="mt-6 rounded-[2rem] border border-white/10 bg-muted/50 p-6 backdrop-blur-xl">
              <p className="text-lg font-semibold leading-snug">{state.question.q}</p>
              <div className="mt-5 space-y-3">
                {state.question.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setChoice(idx)}
                    className={`flex w-full items-center gap-3 rounded-[1.25rem] border px-4 py-3 text-left text-sm transition ${
                      choice === idx
                        ? 'border-cyan-300/50 bg-cyan-300/[0.12] text-white'
                        : 'border-white/10 bg-black/20 text-white/80 hover:border-white/25'
                    }`}
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                        choice === idx ? 'border-cyan-300 bg-cyan-300 text-black' : 'border-white/25'
                      }`}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
              {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
              <Button
                type="button"
                disabled={choice === null || answerBusy}
                onClick={() => void handleAnswer()}
                className="mt-6 w-full"
              >
                {answerBusy
                  ? 'Saving…'
                  : state.index + 1 >= state.total
                    ? 'Submit test'
                    : 'Next question'}
              </Button>
            </div>

            {warning > 0 ? (
              <div className="mt-4 flex items-center gap-2 rounded-[1.25rem] border border-red-400/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
                <AlertTriangle className="size-4 shrink-0" />
                Warning: tab-switch / app-switch {warning} baar detect hua. Yeh record ho raha hai.
              </div>
            ) : null}
          </div>
        ) : state?.status === 'submitted' ? (
          // ── Result ─────────────────────────────────────────────────────
          <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-muted/50 p-8 text-center backdrop-blur-xl">
            {state.passed ? (
              <CheckCircle2 className="mx-auto size-14 text-emerald-400" />
            ) : (
              <XCircle className="mx-auto size-14 text-red-400" />
            )}
            <h1 className="mt-4 text-2xl font-semibold">
              {state.passed ? 'Congratulations! Aap pass ho gaye 🎉' : 'Aap pass nahi ho paaye'}
            </h1>
            <p className="mt-2 text-sm text-white/65">
              Aapka score: <span className="font-bold text-white">{state.score ?? 0}</span> / {state.total}
              {' '}(pass mark {state.pass_mark})
            </p>
            <p className="mt-4 text-sm text-white/55">
              {state.passed
                ? 'Aapki team aapse Day 3 ke liye contact karegi.'
                : 'Aapki team aapse contact karegi. Dhanyavaad.'}
            </p>
          </div>
        ) : (
          <p className="text-center text-white/60">Nothing to show.</p>
        )}
      </main>
    </div>
  )
}
