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

type BatchVideoDayKey = 'd4' | 'd5'
type BatchVideoSlotKey = 'morning' | 'afternoon' | 'evening'

const CONTENT_LINK_FIELDS: readonly SettingsTextField[] = [
  {
    key: 'content.esbi_model',
    label: 'ESBI Model Video',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Mindset Lock me ESBI Model task ka Watch button is link pe jaata hai.',
  },
  {
    key: 'content.power_of_network',
    label: 'Power of Network Video',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Mindset Lock me Power of Network task ka Watch button is link pe jaata hai.',
  },
  {
    key: 'content.manik_expose',
    label: 'Expose Video (Manik Aggarwal)',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Day 2 me Expose Video Share button WhatsApp pe yahi link bhejta hai.',
  },
]

const PREMIERE_SETTING_FIELDS: readonly SettingsTextField[] = [
  {
    key: 'premiere_day1_video_url',
    label: 'Day 1 video URL (Power of Digital India)',
    placeholder: 'https://cdn.example.com/day1.mp4',
    help: 'Cloudflare R2 / HLS URL for Day 1 premiere session. Plays at 5pm, 6pm, 7pm.',
  },
  {
    key: 'premiere_day2_video_url',
    label: 'Day 2 video URL (Secret Industry Reveal)',
    placeholder: 'https://cdn.example.com/day2.mp4',
    help: 'Cloudflare R2 / HLS URL for Day 2 premiere session. Plays at 5pm, 6pm, 7pm.',
  },
  {
    key: 'premiere_day3_video_url',
    label: 'Day 3 video URL (Final Day)',
    placeholder: 'https://cdn.example.com/day3.mp4',
    help: 'Cloudflare R2 / HLS URL for Day 3 premiere session. Plays at 5pm, 6pm, 7pm.',
  },
  {
    key: 'premiere_session_hours',
    label: 'Session hours (IST)',
    placeholder: '17,18,19',
    inputMode: 'text',
    help: 'Comma-separated 24h hours when premiere goes live. Default: 5 PM, 6 PM, 7 PM (17,18,19).',
  },
  {
    key: 'premiere_waiting_minutes',
    label: 'Waiting room opens (minutes before live)',
    placeholder: '30',
    inputMode: 'numeric',
    help: 'How many minutes before each session the waiting room opens. Default: 30.',
  },
  {
    key: 'premiere_duration_minutes',
    label: 'Session duration (minutes)',
    placeholder: '49',
    inputMode: 'numeric',
    help: 'How long each premiere session runs. Default: 49 minutes.',
  },
]

const BATCH_VIDEO_DAYS: readonly { dayKey: BatchVideoDayKey; dayNumber: number }[] = [
  { dayKey: 'd4', dayNumber: 4 },
  { dayKey: 'd5', dayNumber: 5 },
]

const BATCH_VIDEO_SLOTS: readonly { slotKey: BatchVideoSlotKey; label: string }[] = [
  { slotKey: 'morning', label: 'Morning' },
  { slotKey: 'afternoon', label: 'Afternoon' },
  { slotKey: 'evening', label: 'Evening' },
]

function batchVideoSettingKey(dayKey: BatchVideoDayKey, slotKey: BatchVideoSlotKey, version: 1 | 2): string {
  return `batch_${dayKey}_${slotKey}_v${version}`
}


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
  const [premiereEdits, setPremiereEdits] = useState<Record<string, string>>({})
  const [contentEdits, setContentEdits] = useState<Record<string, string>>({})
  const [batchVideoEdits, setBatchVideoEdits] = useState<Record<string, string>>({})
  const [premiereSaveMsg, setPremiereSaveMsg] = useState<string | null>(null)
  const [contentSaveMsg, setContentSaveMsg] = useState<string | null>(null)
  const [batchVideoSaveMsg, setBatchVideoSaveMsg] = useState<string | null>(null)
  const [premiereErrorMsg, setPremiereErrorMsg] = useState<string | null>(null)
  const [contentErrorMsg, setContentErrorMsg] = useState<string | null>(null)
  const [batchVideoErrorMsg, setBatchVideoErrorMsg] = useState<string | null>(null)
  const settingsSource = appSettingsData?.settings ?? {}
  const resolvedPremiereValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(premiereEdits, key)
      ? (premiereEdits[key] ?? '')
      : (settingsSource[key] ?? '')
  const resolvedContentValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(contentEdits, key) ? (contentEdits[key] ?? '') : (settingsSource[key] ?? '')
  const resolvedBatchVideoValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(batchVideoEdits, key)
      ? (batchVideoEdits[key] ?? '')
      : (settingsSource[key] ?? '')

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

  const handleSaveBatchVideos = async () => {
    setBatchVideoSaveMsg(null)
    setBatchVideoErrorMsg(null)
    const editedKeys = Object.keys(batchVideoEdits)
    if (editedKeys.length === 0) {
      setBatchVideoSaveMsg('No batch video changes to save.')
      return
    }
    try {
      for (const key of editedKeys) {
        await updateAppSetting.mutateAsync({ key, value: resolvedBatchVideoValue(key).trim() })
      }
      setBatchVideoEdits({})
      setBatchVideoSaveMsg('Day 4 / Day 5 batch videos saved.')
      void refetchAppSettings()
    } catch (error) {
      setBatchVideoErrorMsg(error instanceof Error ? error.message : 'Could not save batch video links.')
    }
  }

  const handleSavePremiere = async () => {
    setPremiereSaveMsg(null)
    setPremiereErrorMsg(null)
    const videoUrl = resolvedPremiereValue('premiere_video_url').trim()
    if (videoUrl && looksLikeYouTubeUrl(videoUrl)) {
      setPremiereErrorMsg('YouTube link allowed nahi hai. Direct hosted .mp4 / HLS URL use karein.')
      return
    }
    try {
      for (const field of PREMIERE_SETTING_FIELDS) {
        const value = resolvedPremiereValue(field.key).trim()
        await updateAppSetting.mutateAsync({ key: field.key, value })
      }
      setPremiereEdits({})
      setPremiereSaveMsg('Premiere settings updated successfully.')
      void refetchAppSettings()
    } catch (error) {
      setPremiereErrorMsg(error instanceof Error ? error.message : 'Could not update premiere settings.')
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-ds-h2">{title}</h1>
      <p className="text-sm text-muted-foreground">
        All rows from <code className="rounded bg-white/10 px-1 text-xs">app_settings</code>. Sensitive
        secrets should stay in server environment variables — this table is for product toggles and
        copy (e.g. live session text).
      </p>
      {/* Premiere Settings */}
      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Live Premiere</h2>
          <p className="text-xs text-muted-foreground">
            Prospects <code className="rounded bg-white/10 px-1 text-[10px]">/premiere</code> page ka config.
            Video URL set karo aur session hours define karo. Admin premiere tab mein viewers real-time dikhenge.
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
            {PREMIERE_SETTING_FIELDS.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="mb-1 block text-ds-caption text-muted-foreground">{field.label}</span>
                <input
                  type="text"
                  inputMode={field.inputMode}
                  value={resolvedPremiereValue(field.key)}
                  onChange={(e) =>
                    setPremiereEdits((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
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
            onClick={() => void handleSavePremiere()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Save premiere settings'}
          </button>
          {premiereSaveMsg ? <p className="text-xs text-emerald-400">{premiereSaveMsg}</p> : null}
          {premiereErrorMsg ? <p className="text-xs text-destructive">{premiereErrorMsg}</p> : null}
        </div>
      </section>

      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Day 4 / Day 5 Batch Videos</h2>
          <p className="text-xs text-muted-foreground">
            Ye links <code className="rounded bg-white/10 px-1 text-[10px]">/watch/batch/...</code> room me play hote hain.
            Agar sirf ek video ho, to usi ko dono batch buttons ke liye fallback kiya jayega.
          </p>
        </div>

        {appSettingsPending ? (
          <Skeleton className="h-9 w-full" />
        ) : appSettingsError ? (
          <div className="text-sm text-destructive" role="alert">
            {appSettingsErrorObj instanceof Error ? appSettingsErrorObj.message : 'Could not load app settings.'}
          </div>
        ) : (
          <div className="space-y-5">
            {BATCH_VIDEO_DAYS.map((day) => (
              <div key={day.dayKey} className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Day {day.dayNumber}</h3>
                <div className="grid gap-3 lg:grid-cols-3">
                  {BATCH_VIDEO_SLOTS.map((slot) => {
                    const v1Key = batchVideoSettingKey(day.dayKey, slot.slotKey, 1)
                    const v2Key = batchVideoSettingKey(day.dayKey, slot.slotKey, 2)
                    return (
                      <div key={slot.slotKey} className="space-y-2 rounded-lg border border-white/[0.12] bg-muted/40 p-3">
                        <p className="text-ds-caption font-medium text-foreground">{slot.label}</p>
                        <label className="block text-sm">
                          <span className="mb-1 block text-ds-caption text-muted-foreground">Video 1</span>
                          <input
                            type="text"
                            value={resolvedBatchVideoValue(v1Key)}
                            onChange={(e) =>
                              setBatchVideoEdits((prev) => ({
                                ...prev,
                                [v1Key]: e.target.value,
                              }))
                            }
                            placeholder="https://youtube.com/watch?v=... or https://cdn.example.com/day4.mp4"
                            className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block text-ds-caption text-muted-foreground">Video 2 (optional)</span>
                          <input
                            type="text"
                            value={resolvedBatchVideoValue(v2Key)}
                            onChange={(e) =>
                              setBatchVideoEdits((prev) => ({
                                ...prev,
                                [v2Key]: e.target.value,
                              }))
                            }
                            placeholder="Optional second video"
                            className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                          />
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updateAppSetting.isPending || appSettingsPending || appSettingsError}
            onClick={() => void handleSaveBatchVideos()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Save batch videos'}
          </button>
          {batchVideoSaveMsg ? <p className="text-xs text-emerald-400">{batchVideoSaveMsg}</p> : null}
          {batchVideoErrorMsg ? <p className="text-xs text-destructive">{batchVideoErrorMsg}</p> : null}
        </div>
      </section>

      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Content Links</h2>
          <p className="text-xs text-muted-foreground">
            ESBI Model, Power of Network, aur Expose Video ke links yahan set karo. Ye links Mindset Lock aur Day 2 cards mein directly use hote hain.
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
            {CONTENT_LINK_FIELDS.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="mb-1 block text-ds-caption text-muted-foreground">{field.label}</span>
                <input
                  type="text"
                  value={resolvedContentValue(field.key)}
                  onChange={(e) => setContentEdits((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
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
          {contentSaveMsg ? <p className="text-xs text-emerald-400">{contentSaveMsg}</p> : null}
          {contentErrorMsg ? <p className="text-xs text-destructive">{contentErrorMsg}</p> : null}
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
              className="rounded-md bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/[0.08] disabled:opacity-50"
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
              className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
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
