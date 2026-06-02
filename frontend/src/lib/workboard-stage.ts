import type { LeadPublic } from '@/hooks/use-leads-query'

export function isDay2AdvanceUnlocked(
  lead: Pick<LeadPublic, 'd2_morning' | 'd2_afternoon' | 'd2_evening' | 'day2_test_status'>,
): boolean {
  return Boolean(
    lead.d2_morning &&
      lead.d2_afternoon &&
      lead.d2_evening &&
      (lead.day2_test_status ?? 'pending') === 'passed',
  )
}
