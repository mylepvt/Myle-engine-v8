import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

type ContentLinksResponse = {
  links: Record<string, string>
}

async function fetchContentLinks(): Promise<Record<string, string>> {
  const res = await apiFetch('/api/v1/other/content-links')
  if (!res.ok) return {}
  const data = (await res.json()) as ContentLinksResponse
  return data.links ?? {}
}

export function useContentLinksQuery() {
  return useQuery({
    queryKey: ['content-links'],
    queryFn: fetchContentLinks,
    staleTime: 5 * 60 * 1000,
  })
}
