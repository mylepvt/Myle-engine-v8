import { useEffect, useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'
import { useAppSettingUpdateMutation, useAppSettingsQuery } from '@/hooks/use-settings-query'

type Props = { title: string }

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
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/settings/app')
  const {
    data: appSettingsData,
    isPending: appSettingsPending,
    isError: appSettingsError,
    error: appSettingsErrorObj,
    refetch: refetchAppSettings,
  } = useAppSettingsQuery()
  const updateAppSetting = useAppSettingUpdateMutation()

  const [q, setQ] = useState('')
  const [batchValues, setBatchValues] = useState<Record<string, string>>({})
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    const next: Record<string, string> = {}
    const src = appSettingsData?.settings ?? {}
    for (const key of BATCH_SETTING_KEYS) {
      next[key] = src[key] ?? ''
    }
    setBatchValues(next)
  }, [appSettingsData])

  const rows = useMemo(() => {
    const items = data?.items ?? []
    const mapped = items
      .map((row) => ({
        key: typeof row.key === 'string' ? row.key : '',
        value: typeof row.value === 'string' ? row.value : JSON.stringify(row),
      }))
      .filter((r) => r.key || r.value)
    const needle = q.trim().toLowerCase()
    if (!needle) return mapped
    return mapped.filter(
      (r) => r.key.toLowerCase().includes(needle) || r.value.toLowerCase().includes(needle),
    )
  }, [data, q])

  const handleSaveBatchLinks = async () => {
    setSaveMsg(null)
    for (const key of BATCH_SETTING_KEYS) {
      const value = (batchValues[key] ?? '').trim()
      await updateAppSetting.mutateAsync({ key, value })
    }
    setSaveMsg('Batch links updated successfully.')
    void refetch()
    void refetchAppSettings()
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        All rows from <code className="rounded bg-white/10 px-1 text-xs">app_settings</code>. Sensitive
        secrets should stay in server environment variables — this table is for product toggles and
        copy (e.g. live session text).
      </p>
      <section className="surface-elevated space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Batch Video Links</h2>
          <p className="text-xs text-muted-foreground">
            Update WhatsApp watch links for D1/D2 batches. Button color auto-updates after viewer completes video.
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
                  value={batchValues[key] ?? ''}
                  onChange={(e) =>
                    setBatchValues((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  placeholder="https://youtube.com/watch?v=..."
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
          {updateAppSetting.error ? (
            <p className="text-xs text-destructive">
              {updateAppSetting.error instanceof Error ? updateAppSetting.error.message : 'Save failed'}
            </p>
          ) : null}
        </div>
      </section>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="space-y-4">
          {data.note ? <p className="text-sm text-muted-foreground">{data.note}</p> : null}
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
              </tbody>
            </table>
            {rows.length === 0 ? <p className="p-3 text-muted-foreground">No matching rows.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
