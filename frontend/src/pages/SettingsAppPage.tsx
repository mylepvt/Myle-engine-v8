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
    .replace(/\bd1\b/i, 'Day 2')
    .replace(/\bd2\b/i, 'Day 3')
    .replace(/\bv1\b/i, 'V1')
    .replace(/\bv2\b/i, 'V2')
    .replace(/\bmorning\b/i, '5pm')
    .replace(/\bafternoon\b/i, '6pm')
    .replace(/\bevening\b/i, '7pm')
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
  const [batchEdits, setBatchEdits] = useState<Record<string, string>>({})
  const [premiereSaveMsg, setPremiereSaveMsg] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [premiereErrorMsg, setPremiereErrorMsg] = useState<string | null>(null)
  const [batchErrorMsg, setBatchErrorMsg] = useState<string | null>(null)
  const premiereSource = appSettingsData?.settings ?? {}
  const resolvedPremiereValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(premiereEdits, key)
      ? (premiereEdits[key] ?? '')
      : (premiereSource[key] ?? '')
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
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
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
                  className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
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
