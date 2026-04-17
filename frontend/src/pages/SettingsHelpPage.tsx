import { useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'

type Props = { title: string }

const ICONS: Record<number, string> = {
  0: '🔐',
  1: '👤',
  2: '💼',
  3: '🛟',
}

function HelpArticleCard({
  idx,
  titleText,
  detail,
}: {
  idx: number
  titleText: string
  detail: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="surface-elevated overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
        aria-expanded={open}
      >
        <span className="text-lg" aria-hidden="true">
          {ICONS[idx] ?? '📋'}
        </span>
        <span className="flex-1 text-sm font-medium text-foreground">{titleText}</span>
        <span
          className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/[0.08] px-4 pb-4 pt-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>
        </div>
      ) : null}
    </li>
  )
}

export function SettingsHelpPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/settings/help')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Common questions and guidance for using the platform.
        </p>
      </div>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load help articles'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="space-y-4">
          {data.note ? (
            <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
              {data.note}
            </p>
          ) : null}
          <ul className="space-y-2">
            {data.items.map((row, i) => (
              <HelpArticleCard
                key={i}
                idx={i}
                titleText={typeof row.title === 'string' ? row.title : `Topic ${i + 1}`}
                detail={typeof row.detail === 'string' ? row.detail : ''}
              />
            ))}
          </ul>
          {data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No help articles available.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
