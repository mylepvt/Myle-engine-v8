import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type OrgTreeNode = {
  id: number
  name: string
  fbo_id: string
  role: string
  team_size: number
  children: OrgTreeNode[]
}

export type OrgTreeResponse = {
  items: OrgTreeNode[]
  total: number
}

export async function fetchOrgTree(includeInactive: boolean): Promise<OrgTreeResponse> {
  const q = includeInactive ? '?include_inactive=true' : '?include_inactive=false'
  const res = await apiFetch(`/api/v1/org/tree${q}`)
  if (!res.ok) {
    throw new Error(await res.text())
  }
  return res.json() as Promise<OrgTreeResponse>
}

export function useOrgTreeQuery(opts: { includeInactive?: boolean; enabled?: boolean } = {}) {
  const includeInactive = opts.includeInactive ?? false
  const enabled = opts.enabled ?? true
  return useQuery({
    queryKey: ['org', 'tree', includeInactive],
    queryFn: () => fetchOrgTree(includeInactive),
    enabled,
    staleTime: 45_000,
  })
}
