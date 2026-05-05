import { type HTMLAttributes, useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import {
  useAppSettingUpdateMutation,
  useAppSettingsQuery,
} from '@/hooks/use-settings-query'

type Props = { title: string }

type SettingsTextField = {
  key: string
  label: string
  placeholder: string
  help: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
}

const BATCH_SETTING_KEYS = [
  'batch_d1_morning_v1',
  'batch_d1_morning_v2',
  'batch_d1_afternoon_v1',
  'batch_d1_afternoon_v2',
  'batch_d1_evening_v1',
  'batch_d1_evening_v2',
  'batch_d2_morning_v1',
  'batch_d2_morning_v2',
  'batch_d2_afternoon_v1',
  'batch_d2_afternoon_v2',
  'batch_d2_evening_v1',
  'batch_d2_evening_v2',
] as const

const LIVE_SESSION_SETTING_FIELDS = [
  {
    key: 'live_session_url',
    label: 'Join link',
    placeholder: 'https://zoom.us/j/...',
    help: 'Paste the Zoom or Meet join URL shown on Community -> Live session.',
  },
  {
    key: 'live_session_title',
    label: 'Title',
    placeholder: "Today's Live Session",
    help: 'Short heading shown on the live session card.',
  },
  {
    key: 'live_session_schedule',
    label: 'Schedule / details',
    placeholder: 'Daily · 8:00 PM IST',
    help: 'Shown below the title. You can include time, topic, or host details.',
  },
] as const

const LIVE_SESSION_SLOT_FIELDS: readonly SettingsTextField[] = [
  { key: 'live_session_slot_11_00', label: '11:00 AM video', placeholder: 'https://media.example.com/live-11am.mp4', help: 'Sent Enroll Video chooser me 11:00 AM slot ke liye direct hosted video link.' },
  { key: 'live_session_slot_12_00', label: '12:00 PM video', placeholder: 'https://media.example.com/live-12pm.mp4', help: '12:00 PM slot video link.' },
  { key: 'live_session_slot_13_00', label: '1:00 PM video', placeholder: 'https://media.example.com/live-1pm.mp4', help: '1:00 PM slot video link.' },
  { key: 'live_session_slot_14_00', label: '2:00 PM video', placeholder: 'https://media.example.com/live-2pm.mp4', help: '2:00 PM slot video link.' },
  { key: 'live_session_slot_15_00', label: '3:00 PM video', placeholder: 'https://media.example.com/live-3pm.mp4', help: '3:00 PM slot video link.' },
  { key: 'live_session_slot_16_00', label: '4:00 PM video', placeholder: 'https://media.example.com/live-4pm.mp4', help: '4:00 PM slot video link.' },
  { key: 'live_session_slot_17_00', label: '5:00 PM video', placeholder: 'https://media.example.com/live-5pm.mp4', help: '5:00 PM slot video link.' },
  { key: 'live_session_slot_18_00', label: '6:00 PM video', placeholder: 'https://media.example.com/live-6pm.mp4', help: '6:00 PM slot video link.' },
  { key: 'live_session_slot_19_00', label: '7:00 PM video', placeholder: 'https://media.example.com/live-7pm.mp4', help: '7:00 PM slot video link.' },
  { key: 'live_session_slot_20_00', label: '8:00 PM video', placeholder: 'https://media.example.com/live-8pm.mp4', help: '8:00 PM slot video link.' },
  { key: 'live_session_slot_21_00', label: '9:00 PM video', placeholder: 'https://media.example.com/live-9pm.mp4', help: '9:00 PM slot video link.' },
] as const

const ENROLLMENT_VIDEO_SETTING_FIELDS: readonly SettingsTextField[] = [
  {
    key: 'enrollment_video_source_url',
    label: 'Video URL',
    placeholder: 'https://media.example.com/enrollment.mp4',
    help: 'Cloudflare R2 / CDN ka public MP4 URL yahan paste karein. Lead ko raw URL nahi, tokenized Myle room hi jata hai.',
  },
  {
    key: 'enrollment_video_title',
    label: 'Room title',
    placeholder: 'Welcome to Myle enrollment',
    help: 'Private watch room par clean heading dikhane ke liye optional title.',
  },
  {
    key: 'public_app_url',
    label: 'Public app URL',
    placeholder: 'https://app.example.com',
    help: 'Optional. Sirf tab jab API aur frontend alag domains par deployed hon aur WhatsApp link ko public app domain par khulna ho.',
  },
] as const

const ENROLLMENT_VIDEO_OPTIONAL_FIELDS: readonly SettingsTextField[] = [
  {
    key: 'enrollment_social_proof_count',
    label: 'Forms received',
    placeholder: '300',
    help: 'Optional. Enrollment room me social-proof counter ke liye current form volume.',
    inputMode: 'numeric',
  },
  {
    key: 'enrollment_total_seats',
    label: 'Batch seats',
    placeholder: '50',
    help: 'Optional. Current batch me total seats kitni hain.',
    inputMode: 'numeric',
  },
  {
    key: 'enrollment_seats_left',
    label: 'Seats left',
    placeholder: '12',
    help: 'Optional. Enrollment room me currently kitni seats left dikhani hain.',
    inputMode: 'numeric',
  },
  {
    key: 'enrollment_trust_note',
    label: 'Trust note',
    placeholder: 'Private room access is limited to the current batch window.',
    help: 'Optional. Clean trust-building line jo video ke upar snapshot section me dikhani ho.',
  },
] as const

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtu.be', 'youtube-nocookie.com'])

function looksLikeYouTubeUrl(rawValue: string): boolean {
  const value = rawValue.trim()
  if (!value) return false
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.replace(/^(www|m|music)\./i, '').toLowerCase()
    return YOUTUBE_HOSTS.has(host)
  } catch {
    return value.toLowerCase().includes('youtu')
  }
}

function batchSettingLabel(key: string): string {
  return key
    .replace('batch_', '')
    .replaceAll('_', ' ')
    .replace(/\bd1\b/i, 'Day 1')
    .replace(/\bd2\b/i, 'Day 2')
    .replace(/\bv1\b/i, 'V1')
    .replace(/\bv2\b/i, 'V2')
    .replace(/\bmorning\b/i, 'Morning')
    .replace(/\bafternoon\b/i, 'Afternoon')
    .replace(/\bevening\b/i, 'Evening')
}

export function SettingsAppPage({ title }: Props) {
  const {
    data: appSettingsData,
    isPending: appSettingsPending,
    isError: appSettingsError,
    error: appSettingsErrorObj,
    refetch: refetchAppSettings,
  } = useAppSettingsQuery()
  const updateAppSetting = useAppSettingUpdateMutation()

  const [q, setQ] = useState('')
  const [enrollmentVideoEdits, setEnrollmentVideoEdits] = useState<Record<string, string>>({})
  const [liveSessionEdits, setLiveSessionEdits] = useState<Record<string, string>>({})
  const [batchEdits, setBatchEdits] = useState<Record<string, string>>({})
  const [enrollmentVideoSaveMsg, setEnrollmentVideoSaveMsg] = useState<string | null>(null)
  const [liveSessionSaveMsg, setLiveSessionSaveMsg] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [enrollmentVideoErrorMsg, setEnrollmentVideoErrorMsg] = useState<string | null>(null)
  const [liveSessionErrorMsg, setLiveSessionErrorMsg] = useState<string | null>(null)
  const [batchErrorMsg, setBatchErrorMsg] = useState<string | null>(null)
  const enrollmentVideoSource = appSettingsData?.settings ?? {}
  const resolvedEnrollmentVideoValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(enrollmentVideoEdits, key)
      ? (enrollmentVideoEdits[key] ?? '')
      : (enrollmentVideoSource[key] ?? '')
  const liveSessionSource = appSettingsData?.settings ?? {}
  const resolvedLiveSessionValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(liveSessionEdits, key)
      ? (liveSessionEdits[key] ?? '')
      : (liveSessionSource[key] ?? '')
  const batchSource = appSettingsData?.settings ?? {}
  const resolvedBatchValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(batchEdits, key) ? (batchEdits[key] ?? '') : (batchSource[key] ?? '')

  const rows = useMemo(() => {
    const settings = appSettingsData?.settings ?? {}
    const mapped = Object.entries(settings)
      .map(([k, v]) => ({ key: k, value: v }))
      .sort((a, b) => a.key.localeCompare(b.key))
    const needle = q.trim().toLowerCase()
    if (!needle) return mapped
    return mapped.filter(
      (r) => r.key.toLowerCase().includes(needle) || r.value.toLowerCase().includes(needle),
    )
  }, [appSettingsData, q])

  const handleSaveBatchLinks = async () => {
    setSaveMsg(null)
    setBatchErrorMsg(null)
    try {
      for (const key of BATCH_SETTING_KEYS) {
        const value = resolvedBatchValue(key).trim()
        await updateAppSetting.mutateAsync({ key, value })
      }
      setBatchEdits({})
      setSaveMsg('Batch links updated successfully.')
      void refetchAppSettings()
    } catch (error) {
      setBatchErrorMsg(error instanceof Error ? error.message : 'Could not update batch links.')
    }
  }

  const handleSaveEnrollmentVideo = async () => {
    setEnrollmentVideoSaveMsg(null)
    setEnrollmentVideoErrorMsg(null)

    const sourceUrl = resolvedEnrollmentVideoValue('enrollment_video_source_url').trim()
    if (looksLikeYouTubeUrl(sourceUrl)) {
      setEnrollmentVideoErrorMsg('YouTube link yahan allowed nahi hai. Direct hosted .mp4 / HLS / app file URL use karein.')
      return
    }

    try {
      for (const field of ENROLLMENT_VIDEO_SETTING_FIELDS) {
        const value = resolvedEnrollmentVideoValue(field.key).trim()
        await updateAppSetting.mutateAsync({ key: field.key, value })
      }
      setEnrollmentVideoEdits({})
      setEnrollmentVideoSaveMsg('Enrollment video settings updated successfully.')
      void refetchAppSettings()
    } catch (error) {
      setEnrollmentVideoErrorMsg(
        error instanceof Error ? error.message : 'Could not update enrollment video settings.',
      )
    }
  }

  const handleSaveLiveSession = async () => {
    setLiveSessionSaveMsg(null)
    setLiveSessionErrorMsg(null)
    try {
      for (const field of LIVE_SESSION_SETTING_FIELDS) {
        const value = resolvedLiveSessionValue(field.key).trim()
        await updateAppSetting.mutateAsync({ key: field.key, value })
      }
      for (const field of LIVE_SESSION_SLOT_FIELDS) {
        const value = resolvedLiveSessionValue(field.key).trim()
        await updateAppSetting.mutateAsync({ key: field.key, value })
      }
      setLiveSessionEdits({})
      setLiveSessionSaveMsg('Live session settings updated successfully.')
      void refetchAppSettings()
    } catch (error) {
      setLiveSessionErrorMsg(error instanceof Error ? error.message : 'Could not update live session settings.')
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        All rows from <code className="rounded bg-white/10 px-1 text-xs">app_settings</code>. Sensitive
        secrets should stay in server environment variables — this table is for product toggles and
        copy (e.g. live session text).
      </p>
      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Live Session</h2>
          <p className="text-xs text-muted-foreground">
            Admin join details for <strong>Community → Live session</strong>. These
            <code className="mx-1 rounded bg-white/10 px-1 text-[10px]">live_session_*</code>
            keys are the preferred vl2 settings.
          </p>
        </div>

        {appSettingsPending ? (
          <Skeleton className="h-9 w-full" />
        ) : appSettingsError ? (
          <div className="text-sm text-destructive" role="alert">
            {appSettingsErrorObj instanceof Error ? appSettingsErrorObj.message : 'Could not load app settings.'}
          </div>
        ) : (
          <div className="grid gap-3">
                {LIVE_SESSION_SETTING_FIELDS.map((field) => (
              <label key={field.key} className="block text-xs">
                <span className="mb-1 block text-muted-foreground">{field.label}</span>
                <input
                  value={resolvedLiveSessionValue(field.key)}
                  onChange={(e) =>
                    setLiveSessionEdits((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                />
                <span className="mt-1 block text-muted-foreground/80">{field.help}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updateAppSetting.isPending || appSettingsPending || appSettingsError}
            onClick={() => void handleSaveLiveSession()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Save live session'}
          </button>
          {liveSessionSaveMsg ? <p className="text-xs text-emerald-400">{liveSessionSaveMsg}</p> : null}
          {liveSessionErrorMsg ? <p className="text-xs text-destructive">{liveSessionErrorMsg}</p> : null}
        </div>
      </section>
      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Enrollment Video</h2>
          <p className="text-xs text-muted-foreground">
            Yahan Cloudflare R2 ya kisi bhi CDN ka public MP4 URL set karein. App DB me sirf URL save hota hai,
            video file nahi.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <strong>Sent Enroll Video</strong> par lead ko raw R2 link nahi, private Myle watch room hi bheja jata hai.
          </p>
        </div>

        {appSettingsPending ? (
          <Skeleton className="h-9 w-full" />
        ) : appSettingsError ? (
          <div className="text-sm text-destructive" role="alert">
            {appSettingsErrorObj instanceof Error ? appSettingsErrorObj.message : 'Could not load app settings.'}
          </div>
        ) : (
          <div className="grid gap-3">
            {ENROLLMENT_VIDEO_SETTING_FIELDS.map((field) => (
              <label key={field.key} className="block text-xs">
                <span className="mb-1 block text-muted-foreground">{field.label}</span>
                <input
                  value={resolvedEnrollmentVideoValue(field.key)}
                  onChange={(e) =>
                    setEnrollmentVideoEdits((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                />
                <span className="mt-1 block text-muted-foreground/80">{field.help}</span>
                <span className="mt-1 block font-mono text-[10px] text-muted-foreground/80">{field.key}</span>
              </label>
            ))}
          </div>
        )}

        {appSettingsPending || appSettingsError ? null : (
          <details className="rounded-xl border border-white/[0.1] bg-white/[0.04] p-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Room Snapshot Optional
            </summary>
            <div className="mt-4 grid gap-3">
              {ENROLLMENT_VIDEO_OPTIONAL_FIELDS.map((field) => (
                <label key={field.key} className="block text-xs">
                  <span className="mb-1 block text-muted-foreground">{field.label}</span>
                  <input
                    value={resolvedEnrollmentVideoValue(field.key)}
                    onChange={(e) =>
                      setEnrollmentVideoEdits((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    inputMode={field.inputMode ?? undefined}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                  />
                  <span className="mt-1 block text-muted-foreground/80">{field.help}</span>
                </label>
              ))}
            </div>
          </details>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updateAppSetting.isPending || appSettingsPending || appSettingsError}
            onClick={() => void handleSaveEnrollmentVideo()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Save video setup'}
          </button>
          {enrollmentVideoSaveMsg ? <p className="text-xs text-emerald-400">{enrollmentVideoSaveMsg}</p> : null}
          {enrollmentVideoErrorMsg ? <p className="text-xs text-destructive">{enrollmentVideoErrorMsg}</p> : null}
        </div>
      </section>

      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Batch Video Links</h2>
          <p className="text-xs text-muted-foreground">
            Update WhatsApp watch links for D1/D2 batches. Admin YouTube link ya direct hosted `.mp4/.webm` link dono use kar sakta hai.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Direct file link use karoge to in-app native player chalega with fullscreen and without YouTube bottom clutter.
          </p>
        </div>

        {appSettingsPending ? (
          <Skeleton className="h-9 w-full" />
        ) : appSettingsError ? (
          <div className="text-sm text-destructive" role="alert">
            {appSettingsErrorObj instanceof Error ? appSettingsErrorObj.message : 'Could not load app settings.'}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {BATCH_SETTING_KEYS.map((key) => (
              <label key={key} className="block text-xs">
                <span className="mb-1 block text-muted-foreground">{batchSettingLabel(key)}</span>
                <input
                  value={resolvedBatchValue(key)}
                  onChange={(e) =>
                    setBatchEdits((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  placeholder="https://youtube.com/watch?v=... or https://cdn.example.com/video.mp4"
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                />
                <span className="mt-1 block font-mono text-[10px] text-muted-foreground/80">{key}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updateAppSetting.isPending || appSettingsPending || appSettingsError}
            onClick={() => void handleSaveBatchLinks()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Save batch links'}
          </button>
          {saveMsg ? <p className="text-xs text-emerald-400">{saveMsg}</p> : null}
          {batchErrorMsg ? <p className="text-xs text-destructive">{batchErrorMsg}</p> : null}
        </div>
      </section>

      {appSettingsData ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">All Settings</h2>
            <button
              type="button"
              disabled={appSettingsPending}
              onClick={() => void refetchAppSettings()}
              className="rounded-md bg-white/[0.05] px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/[0.08] disabled:opacity-50"
            >
              {appSettingsPending ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <label className="block max-w-md text-sm">
            <span className="mb-1 block text-ds-caption text-muted-foreground">Filter keys / values</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
          </label>
          <div className="surface-elevated max-h-[min(32rem,70vh)] overflow-auto p-3">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/40 backdrop-blur-sm">
                <tr className="border-b border-white/10 text-ds-caption text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Key</th>
                  <th className="py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.key ? `${r.key}:${idx}` : `row-${idx}`} className="border-b border-white/[0.06] align-top">
                    <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-primary">{r.key}</td>
                    <td className="py-2 break-all text-muted-foreground">{r.value || '—'}</td>
                  </tr>
                ))}
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-foreground">Sent Enroll Video slot chooser</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Team/leader jab `Sent Enroll Video` choose karega to current time ke baad wale configured slots hi dikhेंगे.
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {LIVE_SESSION_SLOT_FIELDS.map((field) => (
                      <label key={field.key} className="grid gap-1.5">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</span>
                        <input
                          value={resolvedLiveSessionValue(field.key)}
                          onChange={(event) => {
                            setLiveSessionSaveMsg(null)
                            setLiveSessionErrorMsg(null)
                            setLiveSessionEdits((prev) => ({ ...prev, [field.key]: event.target.value }))
                          }}
                          placeholder={field.placeholder}
                          className="rounded-xl border border-white/[0.08] bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/40"
                        />
                        <span className="text-xs text-muted-foreground">{field.help}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="p-3 text-muted-foreground">
                {q ? 'No matching keys.' : 'No settings stored yet.'}
              </p>
            ) : null}
          </div>
          {Object.keys(appSettingsData.settings).length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {rows.length} of {Object.keys(appSettingsData.settings).length} keys
              {q ? ' (filtered)' : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
