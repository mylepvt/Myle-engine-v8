import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail, MapPin, Clock, DollarSign, User } from 'lucide-react'
import type { PipelineLead } from '@/hooks/use-pipeline-query'
import { LeadNextStepPanel } from '@/components/leads/LeadNextStepPanel'

interface PipelineColumnProps {
  status: string
  statusLabel: string
  leads: PipelineLead[]
  selectedLead: number | null
  onSelectLead: (leadId: number | null) => void
}

/** Subtle tinted borders — readable in both light and dark themes. */
const STATUS_COLORS = {
  new_lead:       'border-blue-500/35 bg-blue-500/[0.07]',
  contacted:      'border-amber-500/35 bg-amber-500/[0.07]',
  invited:        'border-violet-500/35 bg-violet-500/[0.07]',
  video_sent:     'border-indigo-500/35 bg-indigo-500/[0.07]',
  video_watched:  'border-pink-500/35 bg-pink-500/[0.07]',
  paid:           'border-emerald-500/35 bg-emerald-500/[0.07]',
  day1:           'border-orange-500/35 bg-orange-500/[0.07]',
  day2:           'border-orange-500/35 bg-orange-500/[0.07]',
  interview:      'border-red-500/35 bg-red-500/[0.07]',
  track_selected: 'border-teal-500/35 bg-teal-500/[0.07]',
  seat_hold:      'border-cyan-500/35 bg-cyan-500/[0.07]',
  converted:      'border-emerald-500/35 bg-emerald-500/[0.07]',
  lost:           'border-zinc-500/25 bg-zinc-500/[0.05]',
}

const STATUS_LABEL_COLORS: Record<string, string> = {
  new_lead:       'text-blue-400',
  contacted:      'text-amber-400',
  invited:        'text-violet-400',
  video_sent:     'text-indigo-400',
  video_watched:  'text-pink-400',
  paid:           'text-emerald-400',
  day1:           'text-orange-400',
  day2:           'text-orange-400',
  interview:      'text-red-400',
  track_selected: 'text-teal-400',
  seat_hold:      'text-cyan-400',
  converted:      'text-emerald-400',
  lost:           'text-zinc-400',
}

export default function PipelineColumn({
  status,
  statusLabel,
  leads,
  selectedLead,
  onSelectLead,
}: PipelineColumnProps) {
  const [expandedLead, setExpandedLead] = useState<number | null>(null)

  const handleLeadClick = (leadId: number) => {
    if (selectedLead === leadId) {
      onSelectLead(null)
      setExpandedLead(null)
    } else {
      onSelectLead(leadId)
      setExpandedLead(leadId)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Column Header */}
      <div className="mb-4">
        <Card
          className={`border shadow-sm ${STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'border-zinc-500/25 bg-zinc-500/[0.05]'}`}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className={`text-sm font-semibold ${STATUS_LABEL_COLORS[status] ?? 'text-foreground'}`}>{statusLabel}</CardTitle>
              <Badge
                variant="outline"
                className="border-border/60 bg-background/40 text-xs font-semibold text-foreground/70"
              >
                {leads.length}
              </Badge>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Leads List */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {leads.map((lead) => (
          <Card
            key={lead.id}
            className={`cursor-pointer border shadow-sm transition-all duration-200 ${
              selectedLead === lead.id
                ? 'ring-2 ring-primary/60 ring-offset-1 ring-offset-background'
                : 'hover:brightness-[1.06]'
            } ${STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'border-zinc-500/25 bg-zinc-500/[0.05]'}`}
            onClick={() => handleLeadClick(lead.id)}
          >
            <CardContent className="p-3">
              {/* Lead Header */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center space-x-2">
                  <User className="h-4 w-4 shrink-0 text-foreground/50" />
                  <span className="truncate text-sm font-semibold text-foreground">{lead.name}</span>
                </div>
                {lead.payment_status && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-slate-500/35 bg-white/70 text-xs text-slate-800"
                  >
                    <DollarSign className="mr-1 h-3 w-3" />
                    {lead.payment_status}
                  </Badge>
                )}
              </div>

              {/* Contact Info */}
              <div className="space-y-1 text-xs text-foreground/70">
                {lead.phone && (
                  <div className="flex items-center space-x-1">
                    <Phone className="h-3 w-3 shrink-0 text-foreground/50" />
                    <span>{lead.phone}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center space-x-1">
                    <Mail className="h-3 w-3 shrink-0 text-foreground/50" />
                    <span className="truncate">{lead.email}</span>
                  </div>
                )}
                {lead.city && (
                  <div className="flex items-center space-x-1">
                    <MapPin className="h-3 w-3 shrink-0 text-foreground/50" />
                    <span>{lead.city}</span>
                  </div>
                )}
              </div>

              {/* Created At */}
              <div className="mt-2 flex items-center space-x-1 text-xs text-foreground/50">
                <Clock className="h-3 w-3 shrink-0" />
                <span>{new Date(lead.created_at).toLocaleDateString()}</span>
              </div>

              {expandedLead === lead.id ? (
                <div
                  className="mt-3 border-t border-slate-300/80 pt-3"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <LeadNextStepPanel lead={{ id: lead.id, name: lead.name, phone: lead.phone, status: lead.status }} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {leads.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-3 py-10">
          <div className="text-center text-muted-foreground">
            <User className="mx-auto mb-2 h-8 w-8 opacity-70" />
            <p className="text-sm font-medium text-foreground">No leads</p>
          </div>
        </div>
      )}
    </div>
  )
}
