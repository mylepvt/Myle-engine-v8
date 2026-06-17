import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import {
  buildLeadPoster,
  downloadDataUrl,
  POSTER_TEMPLATES,
  type PosterTemplate,
} from '@/lib/lead-poster'

type CategoryOption = { slug: string; label: string }

type CaptureLink = {
  id: number
  token: string
  category: string
  category_label: string
  active: boolean
  leads_count: number
  created_at: string
}

function publicUrl(token: string): string {
  return `${window.location.origin}/c/${token}`
}

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.detail || 'Request failed')
  }
  return res.json()
}

export function LeadGenPage({ title }: { title?: string }) {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [posterFor, setPosterFor] = useState<CaptureLink | null>(null)
  const [ownerName, setOwnerName] = useState('')

  const categoriesQuery = useQuery({
    queryKey: ['capture-categories'],
    queryFn: async (): Promise<CategoryOption[]> =>
      jsonOrThrow(await apiFetch('/api/v1/capture/categories')),
  })

  const linksQuery = useQuery({
    queryKey: ['capture-links'],
    queryFn: async (): Promise<CaptureLink[]> => {
      const data = await jsonOrThrow(await apiFetch('/api/v1/capture/links'))
      return data.links as CaptureLink[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async (slug: string): Promise<CaptureLink> =>
      jsonOrThrow(
        await apiFetch('/api/v1/capture/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: slug }),
        }),
      ),
    onSuccess: () => {
      setCategory('')
      void queryClient.invalidateQueries({ queryKey: ['capture-links'] })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: async (id: number) =>
      jsonOrThrow(
        await apiFetch(`/api/v1/capture/links/${id}`, { method: 'DELETE' }),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['capture-links'] }),
  })

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(token))
      setCopiedToken(token)
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1800)
    } catch {
      /* clipboard unavailable — user can long-press the link */
    }
  }

  async function downloadPoster(link: CaptureLink, template: PosterTemplate) {
    const dataUrl = await buildLeadPoster({
      template,
      ownerName: ownerName || 'Our team',
      url: publicUrl(link.token),
    })
    downloadDataUrl(dataUrl, `poster-${template.id}-${link.token}.png`)
  }

  const links = linksQuery.data ?? []

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">{title ?? 'Lead Generation'}</h1>
        <p className="text-sm text-muted-foreground">
          Create your own capture link for each category. Anyone who fills the form becomes
          a lead in your list automatically.
        </p>
      </div>

      {/* Create a link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a new capture link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {categoriesQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                aria-label="Category"
                className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Choose a category…</option>
                {(categoriesQuery.data ?? []).map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Button
                disabled={!category || createMutation.isPending}
                onClick={() => createMutation.mutate(category)}
              >
                {createMutation.isPending ? 'Creating…' : 'Generate link'}
              </Button>
            </div>
          )}
          {createMutation.isError ? (
            <p className="text-sm text-red-600">
              {(createMutation.error as Error).message}
            </p>
          ) : null}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="ownerName">
              Name shown on the poster (optional)
            </label>
            <input
              id="ownerName"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              placeholder="e.g. Karan Singh"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* My links */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">My links</h2>
        {linksQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">No links yet. Create one above.</p>
        ) : (
          links.map((link) => (
            <Card key={link.id} className={link.active ? '' : 'opacity-60'}>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{link.category_label}</p>
                    <p className="text-xs text-muted-foreground">
                      {link.leads_count} lead{link.leads_count === 1 ? '' : 's'} captured
                      {link.active ? '' : ' · inactive'}
                    </p>
                  </div>
                  {link.active ? (
                    <Button
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => deactivateMutation.mutate(link.id)}
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
                    {publicUrl(link.token)}
                  </code>
                  <Button variant="outline" onClick={() => copyLink(link.token)}>
                    {copiedToken === link.token ? 'Copied!' : 'Copy'}
                  </Button>
                </div>

                {link.active ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setPosterFor(posterFor?.id === link.id ? null : link)}
                  >
                    {posterFor?.id === link.id ? 'Hide posters' : 'Make a poster'}
                  </Button>
                ) : null}

                {posterFor?.id === link.id ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {POSTER_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className="rounded-lg p-3 text-left text-xs font-medium text-white"
                        style={{
                          background: `linear-gradient(160deg, ${tpl.bg[0]}, ${tpl.bg[1]})`,
                        }}
                        onClick={() => downloadPoster(link, tpl)}
                      >
                        {tpl.name}
                        <span className="mt-1 block text-[10px] opacity-80">
                          Tap to download
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
