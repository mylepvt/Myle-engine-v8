import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

export type LeadBooking = {
  booking_date: string
  requested_count: number
  fulfilled_count: number
  status: 'open' | 'fulfilled' | 'cancelled' | 'expired'
  last_skip_reason: string | null
}

export type MyLeadBookings = {
  today: LeadBooking | null
  tomorrow: LeadBooking | null
  max_count: number
}

export type LeadBookingAdminRow = LeadBooking & { user_id: number; member_name: string }

export type LeadBookingDay = {
  booking_date: string
  total_requested: number
  total_fulfilled: number
  items: LeadBookingAdminRow[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFromApiErrorPayload(body, `HTTP ${res.status}`))
  return body as T
}

const MINE_KEY = ['lead-bookings', 'me'] as const

export function useMyLeadBookingsQuery(enabled = true) {
  return useQuery({
    queryKey: MINE_KEY,
    queryFn: () => request<MyLeadBookings>('/api/v1/lead-bookings/me'),
    enabled,
    staleTime: 30_000,
  })
}

export function useBookLeadsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (count: number) =>
      request<MyLeadBookings>('/api/v1/lead-bookings/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      }),
    onSuccess: (data) => qc.setQueryData(MINE_KEY, data),
  })
}

export function useCancelLeadBookingMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => request<MyLeadBookings>('/api/v1/lead-bookings/me', { method: 'DELETE' }),
    onSuccess: (data) => qc.setQueryData(MINE_KEY, data),
  })
}

export function useLeadBookingsDayQuery(day: string | null, enabled = true) {
  return useQuery({
    queryKey: ['lead-bookings', 'day', day],
    queryFn: () =>
      request<LeadBookingDay>(`/api/v1/lead-bookings${day ? `?day=${encodeURIComponent(day)}` : ''}`),
    enabled,
    staleTime: 30_000,
  })
}

export function useFulfillLeadBookingsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      request<{ leads_assigned: number; members_filled: number; skipped: number }>(
        '/api/v1/lead-bookings/fulfill',
        { method: 'POST' },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lead-bookings'] })
      void qc.invalidateQueries({ queryKey: ['lead-pool'] })
    },
  })
}
