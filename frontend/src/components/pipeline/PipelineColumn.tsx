import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  DollarSign,
  ChevronDown,
  User
} from 'lucide-react'
import { useAvailableTransitionsQuery } from '@/hooks/use-pipeline-query'
import type { PipelineLead } from '@/hooks/use-pipeline-query'

interface PipelineColumnProps {
  status: string
  statusLabel: string
  leads: PipelineLead[]
  onStatusTransition: (leadId: number, newStatus: string) => void
  selectedLead: number | null
  onSelectLead: (leadId: number | null) => void
  userRole?: string
}

/** Pastel column surfaces: always pair with dark text (readable in dark app theme). */
const STATUS_COLORS = {
  new_lead: 'border-blue-300/80 bg-blue-100',
  contacted: 'border-amber-300/80 bg-amber-100',
  invited: 'border-violet-300/80 bg-violet-100',
  video_sent: 'border-indigo-300/80 bg-indigo-100',
  video_watched: 'border-pink-300/80 bg-pink-100',
  paid: 'border-emerald-300/80 bg-emerald-100',
  day1: 'border-orange-300/80 bg-orange-100',
  day2: 'border-orange-300/80 bg-orange-100',
  interview: 'border-red-300/80 bg-red-100',
  track_selected: 'border-teal-300/80 bg-teal-100',
  seat_hold: 'border-cyan-300/80 bg-cyan-100',
  converted: 'border-emerald-300/80 bg-emerald-100',
  lost: 'border-zinc-300/80 bg-zinc-100',
}

export default function PipelineColumn({
  status,
  statusLabel,
  leads,
  onStatusTransition,
  selectedLead,
  onSelectLead,
}: PipelineColumnProps) {
  const [expandedLead, setExpandedLead] = useState<number | null>(null)
  
  // Get available transitions for expanded lead
  const { data: transitions } = useAvailableTransitionsQuery(
    expandedLead || 0
  )

  const handleLeadClick = (leadId: number) => {
    if (selectedLead === leadId) {
      onSelectLead(null)
      setExpandedLead(null)
    } else {
      onSelectLead(leadId)
      setExpandedLead(leadId)
    }
  }

  const handleTransition = (newStatus: string) => {
    if (expandedLead) {
      onStatusTransition(expandedLead, newStatus)
      setExpandedLead(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Column Header */}
      <div className="mb-4">
        <Card
          className={`border shadow-sm !shadow-black/10 ${STATUS_COLORS[status as keyof typeof STATUS_COLORS] || 'border-zinc-300/80 bg-zinc-100'} !text-slate-950`}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="!text-slate-950 text-sm font-semibold">{statusLabel}</CardTitle>
              <Badge
                variant="outline"
                className="border-slate-500/35 bg-white/60 text-xs font-semibold text-slate-800"
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
            className={`cursor-pointer border shadow-sm !shadow-black/10 transition-all duration-200 !text-slate-950 ${
              selectedLead === lead.id
                ? 'ring-2 ring-blue-600 ring-offset-2 ring-offset-transparent'
                : 'hover:brightness-[0.99]'
            } ${STATUS_COLORS[status as keyof typeof STATUS_COLORS] || 'border-zinc-300/80 bg-zinc-50'}`}
            onClick={() => handleLeadClick(lead.id)}
          >
            <CardContent className="p-3">
              {/* Lead Header */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center space-x-2">
                  <User className="h-4 w-4 shrink-0 text-slate-600" />
                  <span className="truncate text-sm font-semibold text-slate-950">{lead.name}</span>
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
              <div className="space-y-1 text-xs text-slate-700">
                {lead.phone && (
                  <div className="flex items-center space-x-1">
                    <Phone className="h-3 w-3 shrink-0 text-slate-600" />
                    <span>{lead.phone}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center space-x-1">
                    <Mail className="h-3 w-3 shrink-0 text-slate-600" />
                    <span className="truncate">{lead.email}</span>
                  </div>
                )}
                {lead.city && (
                  <div className="flex items-center space-x-1">
                    <MapPin className="h-3 w-3 shrink-0 text-slate-600" />
                    <span>{lead.city}</span>
                  </div>
                )}
              </div>

              {/* Created At */}
              <div className="mt-2 flex items-center space-x-1 text-xs text-slate-600">
                <Clock className="h-3 w-3 shrink-0" />
                <span>{new Date(lead.created_at).toLocaleDateString()}</span>
              </div>

              {/* Expanded View */}
              {expandedLead === lead.id && transitions && (
                <div className="mt-3 border-t border-slate-300/80 pt-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-800">Move to:</p>
                    <div className="grid grid-cols-1 gap-1">
                      {transitions.map((transition) => (
                        <Button
                          key={transition}
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 justify-start"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTransition(transition)
                          }}
                        >
                          <ChevronDown className="w-3 h-3 mr-1" />
                          {transition.replace('_', ' ').toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
