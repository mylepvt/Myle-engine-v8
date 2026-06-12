import { cn } from '@/lib/utils'
import { CheckCircle2, GraduationCap } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyCampaigns, useSubmitCampaignProgress, type CampaignEnrollmentPublic } from '@/hooks/use-training-campaign-query'

function CampaignProgressRow({
  item,
  enrollmentId,
  onTick,
  ticking,
}: {
  item: { id: number; campaign_mission_id: number; label: string; target: number; achieved: number; status: string }
  enrollmentId: number
  onTick: (missionId: number, achieved: number, evidence?: string) => void
  ticking: boolean
}) {
  const isDone = item.status === 'verified'
  const isSubmitted = item.status === 'submitted'

  if (isDone) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 p-2">
        <CheckCircle2 className="size-3.5 shrink-0 text-success" />
        <span className="text-ds-caption font-medium">{item.label}</span>
        <Badge className="ml-auto text-[10px]" variant="success">Done</Badge>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/40 p-2">
      <div className="min-w-0 flex-1">
        <p className="text-ds-caption font-medium">{item.label}</p>
        <p className="text-[10px] text-muted-foreground">{item.achieved}/{item.target}</p>
      </div>
      {isSubmitted ? (
        <Badge className="text-[10px]" variant="secondary">Submitted</Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px]"
          disabled={ticking}
          onClick={() => onTick(item.campaign_mission_id, item.target)}
        >
          {ticking ? '...' : 'Done'}
        </Button>
      )}
    </div>
  )
}

export function CampaignProgressCard() {
  const campaigns = useMyCampaigns()
  const submitMutation = useSubmitCampaignProgress()

  if (campaigns.isPending) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <GraduationCap className="size-4" />Campaigns
        </CardTitle></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    )
  }

  if (campaigns.isError || !campaigns.data || campaigns.data.length === 0) return null

  const activeCampaigns = campaigns.data.filter(
    (e: CampaignEnrollmentPublic) => e.status !== 'completed'
  )
  if (activeCampaigns.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <GraduationCap className="size-4 text-primary" />
          Campaign Progress
        </CardTitle>
        <CardDescription className="text-xs">Active training campaign tasks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {activeCampaigns.slice(0, 2).map((enrollment: CampaignEnrollmentPublic) => (
          <div key={enrollment.id} className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground">
              Campaign #{enrollment.campaign_id}
              <Badge variant="outline" className="ml-2 text-[10px]">{enrollment.status}</Badge>
            </p>
            <div className="space-y-1">
              {enrollment.progress.map((p: CampaignEnrollmentPublic['progress'][0]) => (
                <CampaignProgressRow
                  key={p.id}
                  item={p}
                  enrollmentId={enrollment.id}
                  onTick={(missionId) =>
                    submitMutation.mutate({
                      enrollment_id: enrollment.id,
                      campaign_mission_id: missionId,
                      achieved: p.target,
                    })
                  }
                  ticking={submitMutation.isPending}
                />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
