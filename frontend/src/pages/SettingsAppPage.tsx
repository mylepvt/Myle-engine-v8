import { useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import {
  useAppSettingUpdateMutation,
  useAppSettingsQuery,
  useEnrollmentVideoUploadMutation,
} from '@/hooks/use-settings-query'

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

const ENROLLMENT_VIDEO_SETTING_FIELDS = [
  {
    key: 'enrollment_video_source_url',
    label: 'Secure video source',
    placeholder: 'https://cdn.example.com/enrollment.mp4 or /uploads/enrollment-video.mp4',
    help: 'Sent Enroll Video status se tokenized private room isi source ko use karta hai. Direct hosted video use karein, YouTube nahi.',
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
  const enrollmentVideoUpload = useEnrollmentVideoUploadMutation()

  const [q, setQ] = useState('')
  const [enrollmentVideoFile, setEnrollmentVideoFile] = useState<File | null>(null)
  const [enrollmentVideoEdits, setEnrollmentVideoEdits] = useState<Record<string, string>>({})
  const [liveSessionEdits, setLiveSessionEdits] = useState<Record<string, string>>({})
  const [batchEdits, setBatchEdits] = useState<Record<string, string>>({})
  const [enrollmentVideoSaveMsg, setEnrollmentVideoSaveMsg] = useState<string | null>(null)
  const [enrollmentVideoUploadMsg, setEnrollmentVideoUploadMsg] = useState<string | null>(null)
  const [liveSessionSaveMsg, setLiveSessionSaveMsg] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [enrollmentVideoErrorMsg, setEnrollmentVideoErrorMsg] = useState<string | null>(null)
  const [enrollmentVideoUploadErrorMsg, setEnrollmentVideoUploadErrorMsg] = useState<string | null>(null)
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

  const handleUploadEnrollmentVideo = async () => {
    setEnrollmentVideoUploadMsg(null)
    setEnrollmentVideoUploadErrorMsg(null)
    if (!enrollmentVideoFile) {
      setEnrollmentVideoUploadErrorMsg('Pehle video file choose karein.')
      return
    }

    try {
      const payload = await enrollmentVideoUpload.mutateAsync(enrollmentVideoFile)
      setEnrollmentVideoEdits((prev) => ({
        ...prev,
        enrollment_video_source_url: payload.source_url,
      }))
      setEnrollmentVideoFile(null)
      setEnrollmentVideoUploadMsg(`${payload.message} Source path automatically save ho gaya.`)
      void refetchAppSettings()
    } catch (error) {
      setEnrollmentVideoUploadErrorMsg(
        error instanceof Error ? error.message : 'Could not upload enrollment video.',
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
                <span className="mt-1 block font-mono text-[10px] text-muted-foreground/80">{field.key}</span>
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
            Calling Board par jab koi <strong>Sent Enroll Video</strong> select karta hai, secure tokenized WhatsApp room
            isi configuration se banta hai.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lead ko raw video URL nahi jata. WhatsApp par private Myle room link jata hai jo sirf registered number aur
            30-minute expiry ke saath khulta hai.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.1] bg-white/[0.04] p-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Upload directly
            </p>
            <p className="text-xs text-muted-foreground">
              MP4 ya supported video file yahin upload karein. App file ko backend uploads me save karke
              <code className="mx-1 rounded bg-white/10 px-1 text-[10px]">enrollment_video_source_url</code>
              automatically update kar dega.
            </p>
          </div>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/mpeg,.mp4,.webm,.mov,.m4v,.mpeg,.mpg"
              className="block w-full text-sm file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
              disabled={enrollmentVideoUpload.isPending}
              onChange={(e) => {
                setEnrollmentVideoUploadMsg(null)
                setEnrollmentVideoUploadErrorMsg(null)
                setEnrollmentVideoFile(e.target.files?.[0] ?? null)
              }}
            />
            <button
              type="button"
              disabled={
                enrollmentVideoUpload.isPending ||
                appSettingsPending ||
                appSettingsError ||
                !enrollmentVideoFile
              }
              onClick={() => void handleUploadEnrollmentVideo()}
              className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
            >
              {enrollmentVideoUpload.isPending ? 'Uploading...' : 'Upload video'}
            </button>
          </div>
          {enrollmentVideoFile ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Selected: <span className="font-medium text-foreground">{enrollmentVideoFile.name}</span>
            </p>
          ) : null}
          {enrollmentVideoUploadMsg ? (
            <p className="mt-2 text-xs text-emerald-400">{enrollmentVideoUploadMsg}</p>
          ) : null}
          {enrollmentVideoUploadErrorMsg ? (
            <p className="mt-2 text-xs text-destructive">{enrollmentVideoUploadErrorMsg}</p>
          ) : null}
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

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updateAppSetting.isPending || appSettingsPending || appSettingsError}
            onClick={() => void handleSaveEnrollmentVideo()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Save enrollment video'}
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
