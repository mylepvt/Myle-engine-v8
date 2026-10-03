import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { apiFetch } from '@/lib/api'

type AlertKind = { kind: string; label: string; on: boolean }
type AlertSettings = { kinds: AlertKind[] }

const KEY = ['admin', 'alert-settings'] as const

const HINT: Record<string, string> = {
  lead_added: 'A member adds a new lead.',
  status: 'A lead moves stage (Day 1, Day 2, Converted…) or a calling-board button is pressed (Interested, Not picked, Call later…).',
  enrollment: 'An enrollment proof is uploaded.',
  online: "A member comes online for the first time today.",
}

/** Admin-only: which live work alerts reach the admin's phone. */
export function AdminLiveAlertsCard() {
  const qc = useQueryClient()
  const { data, isPending } = useQuery<AlertSettings>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/alert-settings')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
  const save = useMutation({
    mutationFn: async (off: string[]) => {
      const res = await apiFetch('/api/v1/admin/alert-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ off }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as AlertSettings
    },
    onSuccess: (next) => qc.setQueryData(KEY, next),
    onError: () => toast.error('Could not save. Try again.'),
  })

  const toggle = (kind: string, on: boolean) => {
    if (!data) return
    const off = data.kinds.filter((k) => (k.kind === kind ? !on : !k.on)).map((k) => k.kind)
    save.mutate(off)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <Radio className="mr-2 h-5 w-5" />
          Live work alerts
        </CardTitle>
        <CardDescription>A phone notification every time this happens anywhere in the team.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isPending || !data
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
          : data.kinds.map((k) => (
              <div key={k.kind} className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={`alert-${k.kind}`}>{k.label}</Label>
                  <p className="text-sm text-muted-foreground">{HINT[k.kind] ?? ''}</p>
                </div>
                <Switch
                  id={`alert-${k.kind}`}
                  checked={k.on}
                  disabled={save.isPending}
                  onCheckedChange={(on) => toggle(k.kind, on)}
                />
              </div>
            ))}
      </CardContent>
    </Card>
  )
}
