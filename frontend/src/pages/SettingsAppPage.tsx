import { type HTMLAttributes, useEffect, useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import {
  useAppSettingUpdateMutation,
  useAppSettingsQuery,
} from '@/hooks/use-settings-query'
import { buildLiveSessionMessage, extractJoinUrl, extractPasscode } from '@/lib/live-session-message'

type Props = { title: string }

type SettingsTextField = {
  key: string
  label: string
  placeholder: string
  help: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
}

const BATCH_VIDEO_FIELDS: readonly SettingsTextField[] = [
  { key: 'batch_d1_morning_v1', label: 'Day 1 - Morning Video 1', placeholder: 'https://youtube.com/watch?v=...', help: 'Serves as the video URL for watch/batch/d1_morning/1 when a token link is generated.' },
  { key: 'batch_d1_morning_v2', label: 'Day 1 - Morning Video 2', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d1_morning/2.' },
  { key: 'batch_d1_afternoon_v1', label: 'Day 1 - Afternoon Video 1', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d1_afternoon/1.' },
  { key: 'batch_d1_afternoon_v2', label: 'Day 1 - Afternoon Video 2', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d1_afternoon/2.' },
  { key: 'batch_d1_evening_v1', label: 'Day 1 - Evening Video 1', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d1_evening/1.' },
  { key: 'batch_d1_evening_v2', label: 'Day 1 - Evening Video 2', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d1_evening/2.' },
  { key: 'batch_d2_morning_v1', label: 'Day 2 - Morning Video 1', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d2_morning/1.' },
  { key: 'batch_d2_morning_v2', label: 'Day 2 - Morning Video 2', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d2_morning/2.' },
  { key: 'batch_d2_afternoon_v1', label: 'Day 2 - Afternoon Video 1', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d2_afternoon/1.' },
  { key: 'batch_d2_afternoon_v2', label: 'Day 2 - Afternoon Video 2', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d2_afternoon/2.' },
  { key: 'batch_d2_evening_v1', label: 'Day 2 - Evening Video 1', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d2_evening/1.' },
  { key: 'batch_d2_evening_v2', label: 'Day 2 - Evening Video 2', placeholder: 'https://youtube.com/watch?v=...', help: 'Video URL for watch/batch/d2_evening/2.' },
]

// The 2 PM message text is fixed (src/lib/live-session-message.ts); only the
// Zoom link and its passcode change day to day. The Meeting ID comes from the link.
const LIVE_SESSION_FIELDS: readonly SettingsTextField[] = [
  {
    key: 'live_session_url',
    label: 'Zoom link',
    placeholder: 'https://us06web.zoom.us/j/...',
    help: 'The Zoom link for the day. You can also paste the whole Zoom "Copy Invitation" text: the link and passcode are filled in for you. The Meeting ID is read from the link.',
  },
  {
    key: 'live_session_schedule',
    label: 'Passcode',
    placeholder: '331434',
    help: 'Passcode of the current Zoom meeting. Leave empty to drop the Passcode line from the message.',
  },
]

const CONTENT_LINK_FIELDS: readonly SettingsTextField[] = [
  {
    key: 'content.esbi_model',
    label: 'ESBI Model Video',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Day 2 card — ESBI Model task Watch button uses this link.',
  },
  {
    key: 'content.power_of_network',
    label: 'Power of Network Video',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Day 2 card — Power of Network task Watch button uses this link.',
  },
  {
    key: 'content.manik_expose',
    label: 'Expose Video (Manik Aggarwal)',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Day 2 — Expose Video Share button sends this link on WhatsApp.',
  },
  {
    key: 'content.blueprint_video',
    label: 'Blueprint Video',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Day 3 — Blueprint Video Share button sends this link on WhatsApp.',
  },
]


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
  const [contentEdits, setContentEdits] = useState<Record<string, string>>({})
  const [secureEnrollUrlValue, setSecureEnrollUrlValue] = useState('')
  const [secureEnrollSaveMsg, setSecureEnrollSaveMsg] = useState<string | null>(null)
  const [secureEnrollErrorMsg, setSecureEnrollErrorMsg] = useState<string | null>(null)
  const [batchEdits, setBatchEdits] = useState<Record<string, string>>({})
  const [batchSaveMsg, setBatchSaveMsg] = useState<string | null>(null)
  const [batchErrorMsg, setBatchErrorMsg] = useState<string | null>(null)
  const [liveSessionEdits, setLiveSessionEdits] = useState<Record<string, string>>({})
  const [liveSessionSaveMsg, setLiveSessionSaveMsg] = useState<string | null>(null)
  const [liveSessionErrorMsg, setLiveSessionErrorMsg] = useState<string | null>(null)
  const [contentSaveMsg, setContentSaveMsg] = useState<string | null>(null)
  const [contentErrorMsg, setContentErrorMsg] = useState<string | null>(null)
  const settingsSource = appSettingsData?.settings ?? {}

  useEffect(() => {
    if (!secureEnrollUrlValue && settingsSource.enrollment_video_source_url) {
      setSecureEnrollUrlValue(settingsSource.enrollment_video_source_url)
    }
  }, [settingsSource.enrollment_video_source_url])
  const resolvedContentValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(contentEdits, key) ? (contentEdits[key] ?? '') : (settingsSource[key] ?? '')
  const resolvedBatchValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(batchEdits, key) ? (batchEdits[key] ?? '') : (settingsSource[key] ?? '')
  const resolvedLiveSessionValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(liveSessionEdits, key) ? (liveSessionEdits[key] ?? '') : (settingsSource[key] ?? '')

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

  const handleSaveLiveSession = async () => {
    setLiveSessionSaveMsg(null)
    setLiveSessionErrorMsg(null)
    try {
      for (const field of LIVE_SESSION_FIELDS) {
        const raw = resolvedLiveSessionValue(field.key).trim()
        const value =
          field.key === 'live_session_url'
            ? extractJoinUrl(raw)
            : field.key === 'live_session_schedule'
              ? extractPasscode(raw)
              : raw
        await updateAppSetting.mutateAsync({ key: field.key, value })
      }
      setLiveSessionEdits({})
      setLiveSessionSaveMsg('Live session updated — visible to all members now. Team & leaders get a notification when the link changes.')
      void refetchAppSettings()
    } catch (error) {
      setLiveSessionErrorMsg(error instanceof Error ? error.message : 'Could not save live session.')
    }
  }

  const handleSaveContentLinks = async () => {
    setContentSaveMsg(null)
    setContentErrorMsg(null)
    try {
      for (const field of CONTENT_LINK_FIELDS) {
        const value = resolvedContentValue(field.key).trim()
        await updateAppSetting.mutateAsync({ key: field.key, value })
      }
      setContentEdits({})
      setContentSaveMsg('Content links saved.')
      void refetchAppSettings()
    } catch (error) {
      setContentErrorMsg(error instanceof Error ? error.message : 'Could not save content links.')
    }
  }

  const handleSaveBatchLinks = async () => {
    setBatchSaveMsg(null)
    setBatchErrorMsg(null)
    try {
      for (const field of BATCH_VIDEO_FIELDS) {
        const value = resolvedBatchValue(field.key).trim()
        await updateAppSetting.mutateAsync({ key: field.key, value })
      }
      setBatchEdits({})
      setBatchSaveMsg('Batch video links saved.')
      void refetchAppSettings()
    } catch (error) {
      setBatchErrorMsg(error instanceof Error ? error.message : 'Could not save batch video links.')
    }
  }

  const handleSaveSecureEnrollUrl = async () => {
    setSecureEnrollSaveMsg(null)
    setSecureEnrollErrorMsg(null)
    try {
      await updateAppSetting.mutateAsync({
        key: 'enrollment_video_source_url',
        value: secureEnrollUrlValue.trim(),
      })
      setSecureEnrollSaveMsg('Enrollment video saved.')
      void refetchAppSettings()
    } catch (error) {
      setSecureEnrollErrorMsg(error instanceof Error ? error.message : 'Could not save secure enrollment video URL.')
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-ds-h2">{title}</h1>
      <p className="text-sm text-muted-foreground">
        All rows from <code className="rounded bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] px-1 text-xs">app_settings</code>. Sensitive
        secrets should stay in server environment variables — this table is for product toggles and
        copy (e.g. live session text).
      </p>


      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><span className="size-2 rounded-full bg-destructive" aria-hidden />Daily Live Session (2 PM)</h2>
          <p className="text-xs text-muted-foreground">
            Roz ka naya Zoom link yahan paste karo. Ye turant sabhi members ke Home aur Live Session screen par dikhega.
          </p>
        </div>

        {appSettingsPending ? (
          <Skeleton className="h-9 w-full" />
        ) : appSettingsError ? (
          <div className="text-sm text-destructive" role="alert">
            {appSettingsErrorObj instanceof Error ? appSettingsErrorObj.message : 'Could not load app settings.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {LIVE_SESSION_FIELDS.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="mb-1 block text-ds-caption text-muted-foreground">{field.label}</span>
                <input
                  type="text"
                  value={resolvedLiveSessionValue(field.key)}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (field.key === 'live_session_url' && /\s/.test(raw.trim())) {
                      // whole Zoom invitation pasted: keep only the link, lift the passcode out of it
                      const pass = extractPasscode(raw)
                      setLiveSessionEdits((prev) => ({
                        ...prev,
                        live_session_url: extractJoinUrl(raw),
                        ...(pass ? { live_session_schedule: pass } : {}),
                      }))
                      return
                    }
                    setLiveSessionEdits((prev) => ({
                      ...prev,
                      [field.key]: field.key === 'live_session_schedule' ? extractPasscode(raw) || raw : raw,
                    }))
                  }}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                />
                <span className="mt-1 block text-muted-foreground/80">{field.help}</span>
              </label>
            ))}
          </div>
        )}

        {extractJoinUrl(resolvedLiveSessionValue('live_session_url')) ? (
          <div>
            <p className="mb-1 text-ds-caption text-muted-foreground">Members see and copy exactly this message:</p>
            <pre className="max-h-72 select-text overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 font-sans text-xs leading-relaxed text-foreground">
              {buildLiveSessionMessage(
                extractJoinUrl(resolvedLiveSessionValue('live_session_url')),
                extractPasscode(resolvedLiveSessionValue('live_session_schedule')),
              )}
            </pre>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updateAppSetting.isPending || appSettingsPending || appSettingsError}
            onClick={() => void handleSaveLiveSession()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Update live session'}
          </button>
          {liveSessionSaveMsg ? <p className="text-xs text-success-ink">{liveSessionSaveMsg}</p> : null}
          {liveSessionErrorMsg ? <p className="text-xs text-destructive">{liveSessionErrorMsg}</p> : null}
        </div>
      </section>

      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Content Links</h2>
          <p className="text-xs text-muted-foreground">
            ESBI Model, Power of Network, aur Expose Video ke links yahan set karo. Ye links Day 2 cards mein directly use hote hain.
          </p>
        </div>

        {appSettingsPending ? (
          <Skeleton className="h-9 w-full" />
        ) : appSettingsError ? (
          <div className="text-sm text-destructive" role="alert">
            {appSettingsErrorObj instanceof Error ? appSettingsErrorObj.message : 'Could not load app settings.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {CONTENT_LINK_FIELDS.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="mb-1 block text-ds-caption text-muted-foreground">{field.label}</span>
                <input
                  type="text"
                  value={resolvedContentValue(field.key)}
                  onChange={(e) => setContentEdits((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
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
            onClick={() => void handleSaveContentLinks()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Save content links'}
          </button>
          {contentSaveMsg ? <p className="text-xs text-success-ink">{contentSaveMsg}</p> : null}
          {contentErrorMsg ? <p className="text-xs text-destructive">{contentErrorMsg}</p> : null}
        </div>
      </section>

      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Batch Video Links</h2>
          <p className="text-xs text-muted-foreground">
            Day 1 aur Day 2 ke 6 slots (Morning/Afternoon/Evening) × 2 videos = 12 URL yahan set karo.
            These YouTube links are served directly on watch pages when a lead opens their token link.
          </p>
        </div>

        {appSettingsPending ? (
          <Skeleton className="h-9 w-full" />
        ) : appSettingsError ? (
          <div className="text-sm text-destructive" role="alert">
            {appSettingsErrorObj instanceof Error ? appSettingsErrorObj.message : 'Could not load app settings.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {(['d1', 'd2'] as const).map((day) => (
              <div key={day} className="rounded-lg border border-border dark:border-white/10 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Day {day === 'd1' ? '1' : '2'}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(['morning', 'afternoon', 'evening'] as const).map((slot) => (
                    <div key={`${day}_${slot}`} className="space-y-2">
                      <p className="text-ds-caption font-medium capitalize text-muted-foreground/80">{slot}</p>
                      {([1, 2] as const).map((v) => {
                        const key = `batch_${day}_${slot}_v${v}`
                        const field = BATCH_VIDEO_FIELDS.find((f) => f.key === key)
                        return (
                          <label key={key} className="block text-sm">
                            <span className="mb-0.5 block text-ds-caption text-muted-foreground">Video {v}</span>
                            <input
                              type="text"
                              value={resolvedBatchValue(key)}
                              onChange={(e) => setBatchEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                              placeholder={field?.placeholder}
                              className="w-full rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                            />
                          </label>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
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
            {updateAppSetting.isPending ? 'Saving...' : 'Save batch video links'}
          </button>
          {batchSaveMsg ? <p className="text-xs text-success-ink">{batchSaveMsg}</p> : null}
          {batchErrorMsg ? <p className="text-xs text-destructive">{batchErrorMsg}</p> : null}
        </div>
      </section>

      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Enrollment Video</h2>
          <p className="text-xs text-muted-foreground">
            Sent from the Calling Board when a lead is moved to &quot;Enrollment Video&quot;. The prospect opens a private
            link with their name + registered number; the video plays with a moving name/number watermark. Set the
            Cloudflare R2 link/key.
          </p>
        </div>

        {appSettingsPending ? (
          <Skeleton className="h-9 w-full" />
        ) : appSettingsError ? (
          <div className="text-sm text-destructive" role="alert">
            {appSettingsErrorObj instanceof Error ? appSettingsErrorObj.message : 'Could not load app settings.'}
          </div>
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-ds-caption text-muted-foreground">Cloudflare R2 link / object key</span>
            <input
              type="text"
              value={secureEnrollUrlValue}
              onChange={(e) => setSecureEnrollUrlValue(e.target.value)}
              placeholder="videos/enrollment/master.mp4  ya  https://pub-xxxx.r2.dev/enrollment.mp4"
              className="w-full rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
            <span className="mt-1 block text-muted-foreground/80">R2 object key (recommended — private + signed) or a direct R2 URL. YouTube links are not supported.</span>
          </label>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updateAppSetting.isPending || appSettingsPending || appSettingsError}
            onClick={() => void handleSaveSecureEnrollUrl()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Save enrollment video'}
          </button>
          {secureEnrollSaveMsg ? <p className="text-xs text-success-ink">{secureEnrollSaveMsg}</p> : null}
          {secureEnrollErrorMsg ? <p className="text-xs text-destructive">{secureEnrollErrorMsg}</p> : null}
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
              className="rounded-md bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] disabled:opacity-50"
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
              className="w-full rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
          </label>
          <div className="surface-elevated max-h-[min(32rem,70vh)] overflow-auto p-3">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/40 backdrop-blur-sm">
                <tr className="border-b border-border dark:border-white/10 text-ds-caption text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Key</th>
                  <th className="py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.key ? `${r.key}:${idx}` : `row-${idx}`} className="border-b border-border dark:border-white/[0.06] align-top">
                    <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs text-primary">{r.key}</td>
                    <td className="py-2 break-all text-muted-foreground">{r.value || '—'}</td>
                  </tr>
                ))}
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
