import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch, apiUrl } from '@/lib/api'
import {
  buildLeadPoster,
  buildPosterFromImageFile,
  dataUrlToFile,
  POSTER_TEMPLATES,
  sharePosterOrFallback,
  type PosterTemplate,
} from '@/lib/lead-poster'

type CategoryOption = { slug: string; label: string; message: string }

type CaptureLeadRow = {
  id: number
  name: string
  phone: string | null
  city: string | null
  age: number | null
  status: string
  created_at: string
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type CaptureLink = {
  id: number
  token: string
  category: string
  category_label: string
  active: boolean
  leads_count: number
  created_at: string
  poster_url: string | null
  views: number
  custom_message: string | null
  share_message: string
}

function publicUrl(token: string): string {
  return `${window.location.origin}/c/${token}`
}

function messageFor(link: CaptureLink): string {
  return link.share_message.replace('{link}', publicUrl(link.token))
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
  const [templatesFor, setTemplatesFor] = useState<number | null>(null)
  const [ownerName, setOwnerName] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [editMsgFor, setEditMsgFor] = useState<number | null>(null)
  const [msgDraft, setMsgDraft] = useState('')
  const [leadsFor, setLeadsFor] = useState<number | null>(null)
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({})

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
      jsonOrThrow(await apiFetch(`/api/v1/capture/links/${id}`, { method: 'DELETE' })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['capture-links'] }),
  })

  const messageMutation = useMutation({
    mutationFn: async ({ id, message }: { id: number; message: string | null }) =>
      jsonOrThrow(
        await apiFetch(`/api/v1/capture/links/${id}/message`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        }),
      ),
    onSuccess: () => {
      setEditMsgFor(null)
      void queryClient.invalidateQueries({ queryKey: ['capture-links'] })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ link, file }: { link: CaptureLink; file: File }) => {
      // Overlay the QR/link badge onto the member's own poster, then save it.
      const composedDataUrl = await buildPosterFromImageFile(file, publicUrl(link.token))
      const composed = dataUrlToFile(composedDataUrl, `poster-${link.token}.png`)
      const form = new FormData()
      form.append('poster', composed)
      return jsonOrThrow(
        await apiFetch(`/api/v1/capture/links/${link.id}/poster`, {
          method: 'POST',
          body: form,
        }),
      )
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['capture-links'] }),
  })

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(token))
      setCopiedToken(token)
      setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  async function sharePoster(link: CaptureLink) {
    if (!link.poster_url) return
    setNote(null)
    try {
      const res = await apiFetch(link.poster_url)
      const blob = await res.blob()
      const file = new File([blob], `poster-${link.token}.png`, { type: blob.type || 'image/png' })
      const outcome = await sharePosterOrFallback(file, messageFor(link))
      if (outcome === 'fallback') {
        setNote('Poster downloaded and message copied — attach it in WhatsApp.')
      }
    } catch {
      setNote('Could not share. Try downloading the poster instead.')
    }
  }

  async function shareTemplate(link: CaptureLink, template: PosterTemplate) {
    const dataUrl = await buildLeadPoster({
      template,
      ownerName: ownerName || 'Our team',
      url: publicUrl(link.token),
    })
    const file = dataUrlToFile(dataUrl, `poster-${template.id}-${link.token}.png`)
    const outcome = await sharePosterOrFallback(file, messageFor(link))
    if (outcome === 'fallback') {
      setNote('Poster downloaded and message copied — attach it in WhatsApp.')
    }
  }

  function onPickFile(link: CaptureLink, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) uploadMutation.mutate({ link, file })
  }

  const links = linksQuery.data ?? []
  const uploadingId =
    uploadMutation.isPending && uploadMutation.variables
      ? uploadMutation.variables.link.id
      : null

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">{title ?? 'Lead Generation'}</h1>
        <p className="text-sm text-muted-foreground">
          Make a link for each category, add your own poster, and share both with a ready
          message. Anyone who fills the form becomes a lead in your list.
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
            <p className="text-sm text-red-600">{(createMutation.error as Error).message}</p>
          ) : null}
        </CardContent>
      </Card>

      {note ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{note}</p>
      ) : null}

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
                      {link.views} open{link.views === 1 ? '' : 's'} · {link.leads_count} lead
                      {link.leads_count === 1 ? '' : 's'} ·{' '}
                      {link.views > 0 ? Math.round((link.leads_count / link.views) * 100) : 0}%
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
                  editMsgFor === link.id ? (
                    <div className="space-y-2">
                      <textarea
                        className="min-h-[96px] w-full rounded-md border border-input bg-background p-2 text-sm"
                        value={msgDraft}
                        onChange={(e) => setMsgDraft(e.target.value)}
                        placeholder={link.share_message}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Tip: use {'{link}'} where your link should appear.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          disabled={messageMutation.isPending}
                          onClick={() =>
                            messageMutation.mutate({ id: link.id, message: msgDraft })
                          }
                        >
                          {messageMutation.isPending ? 'Saving…' : 'Save message'}
                        </Button>
                        {link.custom_message ? (
                          <Button
                            variant="outline"
                            onClick={() => messageMutation.mutate({ id: link.id, message: '' })}
                          >
                            Reset to default
                          </Button>
                        ) : null}
                        <Button variant="ghost" onClick={() => setEditMsgFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => {
                        setEditMsgFor(link.id)
                        setMsgDraft(link.custom_message ?? link.share_message)
                      }}
                    >
                      {link.custom_message ? 'Edit share message' : 'Customise share message'}
                    </button>
                  )
                ) : null}

                <div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setLeadsFor(leadsFor === link.id ? null : link.id)}
                  >
                    {leadsFor === link.id
                      ? 'Hide responses'
                      : `View responses (${link.leads_count})`}
                  </button>
                  {leadsFor === link.id ? <LinkResponses linkId={link.id} /> : null}
                </div>

                {link.active ? (
                  <div className="space-y-3">
                    <input
                      ref={(el) => {
                        fileInputs.current[link.id] = el
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => onPickFile(link, e)}
                    />

                    {link.poster_url ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={apiUrl(link.poster_url)}
                          alt="Your poster"
                          className="h-20 w-20 rounded-md border object-cover"
                        />
                        <div className="flex flex-1 flex-col gap-2">
                          <Button className="w-full" onClick={() => sharePoster(link)}>
                            Share poster + message
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full"
                            disabled={uploadingId === link.id}
                            onClick={() => fileInputs.current[link.id]?.click()}
                          >
                            {uploadingId === link.id ? 'Uploading…' : 'Replace poster'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={uploadingId === link.id}
                        onClick={() => fileInputs.current[link.id]?.click()}
                      >
                        {uploadingId === link.id ? 'Adding QR…' : 'Upload your poster'}
                      </Button>
                    )}

                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() =>
                        setTemplatesFor(templatesFor === link.id ? null : link.id)
                      }
                    >
                      {templatesFor === link.id
                        ? 'Hide quick templates'
                        : 'No poster? Use a quick template'}
                    </button>

                    {templatesFor === link.id ? (
                      <div className="space-y-2">
                        <input
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          placeholder="Name shown on template (optional)"
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {POSTER_TEMPLATES.map((tpl) => (
                            <button
                              key={tpl.id}
                              type="button"
                              className="rounded-lg p-3 text-left text-xs font-medium text-white"
                              style={{
                                background: `linear-gradient(160deg, ${tpl.bg[0]}, ${tpl.bg[1]})`,
                              }}
                              onClick={() => shareTemplate(link, tpl)}
                            >
                              {tpl.name}
                              <span className="mt-1 block text-[10px] opacity-80">
                                Tap to share
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {uploadMutation.isError && uploadingId === link.id ? (
                  <p className="text-sm text-red-600">
                    {(uploadMutation.error as Error).message}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function LinkResponses({ linkId }: { linkId: number }) {
  const q = useQuery({
    queryKey: ['capture-link-leads', linkId],
    queryFn: async (): Promise<CaptureLeadRow[]> => {
      const data = await jsonOrThrow(
        await apiFetch(`/api/v1/capture/links/${linkId}/leads`),
      )
      return data.leads as CaptureLeadRow[]
    },
  })

  if (q.isLoading) {
    return <Skeleton className="mt-2 h-16 w-full" />
  }
  const rows = q.data ?? []
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">No responses yet.</p>
    )
  }
  return (
    <div className="mt-2 divide-y rounded-md border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-3 p-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{r.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[r.phone, r.city, r.age ? `${r.age}y` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">
            {formatWhen(r.created_at)}
          </span>
        </div>
      ))}
    </div>
  )
}
