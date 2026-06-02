import { type HTMLAttributes, useMemo, useState } from 'react'
import { Eye, EyeOff, CheckCircle2, XCircle, Smartphone } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import {
  useAppSettingUpdateMutation,
  useAppSettingsQuery,
  useWhatsAppStatusQuery,
  useWhatsAppTestSendMutation,
} from '@/hooks/use-settings-query'
import { apiFetch } from '@/lib/api'
import { type ReminderResult, type SendRemindersResponse } from '@/hooks/use-today-pulse-query'

type Props = { title: string }

type SettingsTextField = {
  key: string
  label: string
  placeholder: string
  help: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
}

const CONTENT_LINK_FIELDS: readonly SettingsTextField[] = [
  {
    key: 'content.esbi_model',
    label: 'ESBI Model Video',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Day 2 card me ESBI Model task ka Watch button is link pe jaata hai.',
  },
  {
    key: 'content.power_of_network',
    label: 'Power of Network Video',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Day 2 card me Power of Network task ka Watch button is link pe jaata hai.',
  },
  {
    key: 'content.manik_expose',
    label: 'Expose Video (Manik Aggarwal)',
    placeholder: 'https://youtube.com/watch?v=...',
    help: 'Day 2 me Expose Video Share button WhatsApp pe yahi link bhejta hai.',
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
  const {
    data: waStatus,
    isFetching: waStatusFetching,
    refetch: refetchWaStatus,
  } = useWhatsAppStatusQuery()
  const waTestSend = useWhatsAppTestSendMutation()
  const [waTestPhone, setWaTestPhone] = useState('')

  const [q, setQ] = useState('')
  const [contentEdits, setContentEdits] = useState<Record<string, string>>({})
  const [waEdits, setWaEdits] = useState<Record<string, string>>({})
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderSummary, setReminderSummary] = useState<Omit<SendRemindersResponse, 'results'> | null>(null)
  const [reminderResults, setReminderResults] = useState<ReminderResult[] | null>(null)
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [contentSaveMsg, setContentSaveMsg] = useState<string | null>(null)
  const [waSaveMsg, setWaSaveMsg] = useState<string | null>(null)
  const [contentErrorMsg, setContentErrorMsg] = useState<string | null>(null)
  const [waErrorMsg, setWaErrorMsg] = useState<string | null>(null)
  const settingsSource = appSettingsData?.settings ?? {}
  const resolvedContentValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(contentEdits, key) ? (contentEdits[key] ?? '') : (settingsSource[key] ?? '')
  const resolvedWaValue = (key: string): string =>
    Object.prototype.hasOwnProperty.call(waEdits, key) ? (waEdits[key] ?? '') : (settingsSource[key] ?? '')

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

  const WA_FIELDS = [
    {
      key: 'whatsapp.meta.phone_number_id',
      label: 'Phone Number ID',
      placeholder: '123456789012345',
      help: 'Meta Developer Console → WhatsApp → API Setup → Phone Number ID.',
    },
    {
      key: 'whatsapp.meta.access_token',
      label: 'Access Token',
      placeholder: 'EAAGm0PX4ZAisBOxxx...',
      help: 'Meta Developer Console → WhatsApp → API Setup → Temporary or Permanent Token.',
    },
    {
      key: 'whatsapp.meta.api_version',
      label: 'API Version',
      placeholder: 'v19.0',
      help: 'Meta Graph API version. Default: v19.0',
    },
    {
      key: 'whatsapp.meta.verify_token',
      label: 'Webhook Verify Token',
      placeholder: 'myle-webhook-secret-2026',
      help: 'Khud banao koi bhi string. Meta Console mein bhi yahi daalna hoga.',
    },
    {
      key: 'whatsapp.removal_template_name',
      label: 'Removal Template Name',
      placeholder: 'member_removal_v1',
      help: 'Meta pe approved template ka exact naam — removal outreach ke liye. Set hone pe 24-hour window ke bahar bhi deliver hoga.',
    },
    {
      key: 'whatsapp.removal_template_lang',
      label: 'Removal Template Language',
      placeholder: 'en',
      help: 'Template language code, e.g. en, en_US, hi. Default: en',
    },
    {
      key: 'whatsapp.report_reminder_template_name',
      label: 'Report Reminder Template Name',
      placeholder: 'daily_report_reminder',
      help: 'Meta pe approved template naam — report reminder ke liye. Set hone pe 24-hour window ke bahar bhi deliver hoga.',
    },
    {
      key: 'whatsapp.report_reminder_template_lang',
      label: 'Report Reminder Template Language',
      placeholder: 'en',
      help: 'Template language code. Default: en',
    },
    {
      key: 'whatsapp.daily_team_summary_template_name',
      label: 'Daily Team Summary Template',
      placeholder: 'daily_team_summary',
      help: 'Leader ko daily report summary — jab kuch members ne submit nahi kiya ho.',
    },
    {
      key: 'whatsapp.daily_team_summary_template_lang',
      label: '… Language',
      placeholder: 'en',
      help: 'Template language code. Default: en',
    },
    {
      key: 'whatsapp.daily_team_summary_all_clear_template_name',
      label: 'Daily Team Summary (All Clear) Template',
      placeholder: 'daily_team_summary_all_clear',
      help: 'Leader ko daily report summary — jab saare members ne submit kar diya ho.',
    },
    {
      key: 'whatsapp.daily_team_summary_all_clear_template_lang',
      label: '… Language',
      placeholder: 'en',
      help: 'Template language code. Default: en',
    },
    {
      key: 'whatsapp.leader_member_removed_template_name',
      label: 'Member Removed (Leader Alert) Template',
      placeholder: 'leader_member_removed',
      help: 'Leader ko alert jab uske team se koi member remove kiya jaye.',
    },
    {
      key: 'whatsapp.leader_member_removed_template_lang',
      label: '… Language',
      placeholder: 'en',
      help: 'Template language code. Default: en',
    },
    {
      key: 'whatsapp.leader_new_member_template_name',
      label: 'New Member (Leader Alert) Template',
      placeholder: 'leader_new_member',
      help: 'Leader ko alert jab naya member approve hoke team mein add ho.',
    },
    {
      key: 'whatsapp.leader_new_member_template_lang',
      label: '… Language',
      placeholder: 'en',
      help: 'Template language code. Default: en',
    },
    {
      key: 'whatsapp.leader_grace_requested_template_name',
      label: 'Grace Requested (Leader Alert) Template',
      placeholder: 'leader_grace_requested',
      help: 'Leader ko alert jab kisi member ne grace period request kiya ho.',
    },
    {
      key: 'whatsapp.leader_grace_requested_template_lang',
      label: '… Language',
      placeholder: 'en',
      help: 'Template language code. Default: en',
    },
    {
      key: 'whatsapp.member_removal_notice_template_name',
      label: 'Member Removal Notice Template',
      placeholder: 'member_removal_notice',
      help: 'Member ko removal notification — jab use system se hata diya jaye.',
    },
    {
      key: 'whatsapp.member_removal_notice_template_lang',
      label: '… Language',
      placeholder: 'en',
      help: 'Template language code. Default: en',
    },
  ] as const

  const handleSendReportReminders = async () => {
    setReminderSending(true)
    setReminderError(null)
    setReminderSummary(null)
    setReminderResults(null)
    try {
      const res = await apiFetch('/api/v1/admin/send-report-reminders', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SendRemindersResponse = await res.json()
      setReminderSummary({ sent: data.sent, failed: data.failed, no_phone: data.no_phone })
      setReminderResults(data.results)
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setReminderSending(false)
    }
  }

  const handleSaveWhatsApp = async () => {
    setWaSaveMsg(null)
    setWaErrorMsg(null)
    try {
      for (const field of WA_FIELDS) {
        const value = resolvedWaValue(field.key).trim()
        await updateAppSetting.mutateAsync({ key: field.key, value })
      }
      setWaEdits({})
      setWaSaveMsg('WhatsApp settings saved.')
      void refetchAppSettings()
      void refetchWaStatus()
    } catch (error) {
      setWaErrorMsg(error instanceof Error ? error.message : 'Could not save WhatsApp settings.')
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




      {/* WhatsApp Meta API */}
      <section className="surface-elevated space-y-3 p-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">WhatsApp (Meta Cloud API)</h2>
            {waStatusFetching ? (
              <span className="text-[11px] text-muted-foreground">Checking…</span>
            ) : waStatus?.connected === true ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Connected
                {waStatus.display_phone_number ? (
                  <span className="text-muted-foreground">({waStatus.display_phone_number})</span>
                ) : null}
              </span>
            ) : waStatus?.connected === false ? (
              <span className="flex items-center gap-1 text-[11px] text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                Not connected
              </span>
            ) : waStatus?.configured === false ? (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                Not configured
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Removed member ko automatically WhatsApp message bhejne ke liye Meta credentials yahan set karo.
            Ye settings env vars se override karti hain.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Webhook URL jo Meta Console mein dalna hai:{' '}
            <code className="rounded bg-white/10 px-1 text-[10px]">
              https://yourdomain.com/api/v1/webhooks/whatsapp/reply
            </code>
          </p>
        </div>

        {appSettingsPending ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : appSettingsError ? (
          <div className="text-sm text-destructive" role="alert">
            {appSettingsErrorObj instanceof Error ? appSettingsErrorObj.message : 'Could not load settings.'}
          </div>
        ) : (
          <div className="grid gap-3">
            {WA_FIELDS.map((field) => {
              const isTokenField = field.key === 'whatsapp.meta.access_token'
              return (
                <label key={field.key} className="block text-sm">
                  <span className="mb-1 block text-ds-caption text-muted-foreground">{field.label}</span>
                  <div className="relative">
                    <input
                      type={isTokenField && !showAccessToken ? 'password' : 'text'}
                      value={resolvedWaValue(field.key)}
                      onChange={(e) => setWaEdits((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      autoComplete="off"
                      className="w-full rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 pr-9 text-foreground shadow-glass-inset backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                    {isTokenField && (
                      <button
                        type="button"
                        onClick={() => setShowAccessToken((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showAccessToken ? 'Hide token' : 'Show token'}
                      >
                        {showAccessToken ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    )}
                  </div>
                  <span className="mt-1 block text-[11px] text-muted-foreground/70">{field.help}</span>
                </label>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updateAppSetting.isPending || appSettingsPending || !!appSettingsError}
            onClick={() => void handleSaveWhatsApp()}
            className="rounded-md border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
          >
            {updateAppSetting.isPending ? 'Saving...' : 'Save WhatsApp settings'}
          </button>
          {waSaveMsg ? <p className="text-xs text-emerald-400">{waSaveMsg}</p> : null}
          {waErrorMsg ? <p className="text-xs text-destructive">{waErrorMsg}</p> : null}
          {waStatus?.connected === false && waStatus.error ? (
            <p className="text-xs text-destructive/80">API error: {waStatus.error}</p>
          ) : null}
        </div>

        {/* Test send — debug delivery */}
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="mb-2 text-xs font-medium text-foreground">Test message bhejo (debug)</p>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Kisi number pe test message bhej ke Meta ka exact response dekho — pata chalega delivery ho rahi hai ya nahi.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="tel"
              value={waTestPhone}
              onChange={(e) => setWaTestPhone(e.target.value)}
              placeholder="10-digit number, e.g. 7230930370"
              className="flex-1 min-w-[200px] rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              disabled={waTestSend.isPending || !waTestPhone.trim()}
              onClick={() => waTestSend.mutate(waTestPhone.trim())}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
            >
              {waTestSend.isPending ? 'Sending…' : 'Send test message'}
            </button>
          </div>
          {waTestSend.isError ? (
            <p className="mt-2 text-xs text-destructive">
              Error: {waTestSend.error instanceof Error ? waTestSend.error.message : 'Failed'}
            </p>
          ) : null}
          {waTestSend.data ? (
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/40 p-3 text-[11px] text-emerald-300 ring-1 ring-white/10">
              {JSON.stringify(waTestSend.data, null, 2)}
            </pre>
          ) : null}
        </div>

        {/* Report reminder resend panel */}
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="mb-1 text-xs font-medium text-foreground">Report reminder manually bhejo</p>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Aaj ki report abhi tak submit nahi ki aur pehle reminder nahi mila — unhe WhatsApp pe reminder bhejo.
            Jinhe aaj already reminder mila hai wo skip honge.
          </p>
          <button
            type="button"
            disabled={reminderSending}
            onClick={() => void handleSendReportReminders()}
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {reminderSending ? 'Bhej raha hoon…' : 'Send report reminders'}
          </button>

          {reminderError ? (
            <p className="mt-2 text-xs text-destructive">Error: {reminderError}</p>
          ) : null}

          {reminderSummary ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <span className="text-[11px] font-semibold text-emerald-400">✅ {reminderSummary.sent} sent</span>
              {reminderSummary.failed > 0 && (
                <span className="text-[11px] font-semibold text-red-400">❌ {reminderSummary.failed} failed</span>
              )}
              {reminderSummary.no_phone > 0 && (
                <span className="text-[11px] font-semibold text-muted-foreground/60">📵 {reminderSummary.no_phone} no phone</span>
              )}
              {reminderSummary.sent === 0 && reminderSummary.failed === 0 && reminderSummary.no_phone === 0 && (
                <span className="text-[11px] text-muted-foreground">Koi pending nahi — sab ne report submit kar di ya pehle reminder mil chuka hai.</span>
              )}
            </div>
          ) : null}

          {reminderResults && reminderResults.length > 0 ? (
            <div className="mt-3 max-h-64 overflow-y-auto rounded border border-white/[0.08] bg-black/30">
              {reminderResults.map((r) => (
                <div key={r.user_id} className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-1.5 last:border-0">
                  {r.status === 'sent' || r.status === 'stub'
                    ? <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
                    : r.status === 'no_phone'
                    ? <Smartphone className="size-3 shrink-0 text-muted-foreground/40" />
                    : <XCircle className="size-3 shrink-0 text-red-400" />}
                  <span className="flex-1 truncate text-[11px] text-foreground">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground/50">
                    {r.phone_tail !== '—' ? `…${r.phone_tail}` : '—'}
                  </span>
                  <span className={`text-[10px] font-medium ${
                    r.status === 'sent' || r.status === 'stub' ? 'text-emerald-400'
                    : r.status === 'no_phone' ? 'text-muted-foreground/40'
                    : 'text-red-400'
                  }`}>
                    {r.status === 'stub' ? 'sent' : r.status}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
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
