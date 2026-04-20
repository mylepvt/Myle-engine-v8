import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ListSearchInput } from '@/components/ui/list-search-input'
import { ErrorState, LoadingState } from '@/components/ui/states'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetch } from '@/lib/api'
import { directorySearchValues, filterCollectionByQuery } from '@/lib/search-filter'

type PendingRow = {
  id: number
  fbo_id: string
  username: string | null
  email: string
  phone: string | null
  created_at: string
  upline_fbo_id: string | null
  upline_name: string | null
}

type Props = {
  title: string
}

export function TeamApprovalsPage({ title }: Props) {
  const qc = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const q = useQuery({
    queryKey: ['team', 'pending-registrations'],
    queryFn: async () => {
      const r = await apiFetch('/api/v1/team/pending-registrations')
      if (!r.ok) {
        const t = await r.text()
        throw new Error(t || r.statusText)
      }
      return r.json() as Promise<{ items: PendingRow[]; total: number }>
    },
  })

  const decide = useMutation({
    mutationFn: async (vars: { id: number; action: 'approve' | 'reject' }) => {
      const r = await apiFetch(
        `/api/v1/team/pending-registrations/${vars.id}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: vars.action }),
        },
      )
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        const msg =
          typeof err === 'object' && err !== null && 'detail' in err
            ? String((err as { detail?: string }).detail)
            : await r.text()
        throw new Error(msg || r.statusText)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team', 'pending-registrations'] })
    },
  })
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const searchActive = searchQuery.trim().length > 0
  const filteredRows = q.data
    ? filterCollectionByQuery(q.data.items, deferredSearchQuery, (row) => directorySearchValues(row))
    : []

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Self-serve registrations pending admin approval (legacy parity). Rejected users cannot sign
        in; approved users can log in with the password they set at registration.
      </p>

      <div className="surface-elevated space-y-2 p-4 text-sm">
        <ListSearchInput
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search by FBO ID, username, email, phone, or upline"
          aria-label="Search pending registrations"
          wrapperClassName="w-full sm:max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          {searchActive
            ? `Showing ${filteredRows.length} of ${q.data?.total ?? 0} pending registrations.`
            : 'Search helps when multiple pending registrations are waiting for approval.'}
        </p>
      </div>

      {q.isPending ? <LoadingState label="Loading pending registrations" /> : null}
      {q.isError ? (
        <ErrorState message={q.error instanceof Error ? q.error.message : 'Failed to load'} />
      ) : null}

      {q.data ? (
        q.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending registrations.</p>
        ) : filteredRows.length === 0 ? (
          <div className="surface-elevated rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No pending registrations match this search.
          </div>
        ) : (
          <div className="surface-elevated overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>FBO ID</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Upline</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.fbo_id}</TableCell>
                    <TableCell>{row.username ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {row.upline_name ? (
                        <span className="font-medium text-foreground">{row.upline_name}</span>
                      ) : null}
                      {row.upline_fbo_id ? (
                        <span className="block font-mono text-[0.68rem] text-muted-foreground">{row.upline_fbo_id}</span>
                      ) : null}
                      {!row.upline_name && !row.upline_fbo_id ? '—' : null}
                    </TableCell>
                    <TableCell className="text-xs">{row.email}</TableCell>
                    <TableCell className="text-xs">{row.phone ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: row.id, action: 'reject' })}
                        >
                          Reject
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: row.id, action: 'approve' })}
                        >
                          Approve
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}
    </div>
  )
}
