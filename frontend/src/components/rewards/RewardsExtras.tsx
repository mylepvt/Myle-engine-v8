import { useState } from 'react'
import { Award, Flame, Gift, Medal, Users, Zap } from 'lucide-react'
import { toast } from 'sonner'

import type { MyRewards, ScratchCardInfo } from '@/hooks/use-rewards-query'
import { useScratchCardMutation } from '@/hooks/use-rewards-query'
import { playAppSound } from '@/lib/app-sounds'
import { monthName, powerHourLine, rupees, streakLine } from '@/lib/rewards'
import { cn } from '@/lib/utils'

/** Streak + Power Hour, shown under the ticket bar. */
export function StreakPowerLines({ data, now }: { data: MyRewards; now: number }) {
  const power = data.power_hour ? powerHourLine(data.power_hour, now) : null
  return (
    <>
      {data.streak ? (
        <p
          className={cn(
            'flex items-center gap-1.5 text-ds-caption',
            data.streak.doubled ? 'font-semibold text-destructive-ink' : 'text-muted-foreground',
          )}
        >
          <Flame className="size-3.5 shrink-0" aria-hidden />
          {streakLine(data.streak)}
        </p>
      ) : null}
      {power ? (
        <p
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-ds-caption',
            data.power_hour?.active ? 'bg-primary/15 font-semibold text-primary' : 'text-muted-foreground',
          )}
        >
          <Zap className="size-3.5 shrink-0" aria-hidden />
          {power}
        </p>
      ) : null}
    </>
  )
}

function ScratchTile({ card }: { card: ScratchCardInfo }) {
  const scratch = useScratchCardMutation()
  const [revealed, setRevealed] = useState<{ amount: number; bonus: number } | null>(null)
  const result = card.scratched ? { amount: card.amount_rupees, bonus: card.bonus_points } : revealed

  const onScratch = () => {
    playAppSound('scratch')
    scratch.mutate(card.id, {
      onSuccess: (r) => {
        setRevealed({ amount: r.amount_rupees, bonus: r.bonus_points })
        if (r.amount_rupees) {
          playAppSound(r.amount_rupees >= 20 ? 'jackpot' : 'claim')
          toast.success(`You won ${rupees(r.amount_rupees)} — added to your wallet`)
        } else {
          playAppSound('notify')
          toast(`+${r.bonus_points} MP bonus`, { description: 'Better luck on the next card' })
        }
      },
      onError: (e) => {
        playAppSound('error')
        toast.error(e instanceof Error ? e.message : 'Could not scratch')
      },
    })
  }

  return (
    <li>
      {result ? (
        <div
          className={cn(
            'flex h-16 flex-col items-center justify-center rounded-lg border px-2 text-center',
            result.amount ? 'border-success/40 bg-success/10' : 'border-border/60 bg-muted/30',
          )}
        >
          <span className={cn('font-bold tabular-nums', result.amount ? 'text-success-ink' : 'text-muted-foreground')}>
            {result.amount ? rupees(result.amount) : `+${result.bonus} MP`}
          </span>
          <span className="truncate text-ds-micro text-muted-foreground">{card.lead_name ?? card.source}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onScratch}
          disabled={scratch.isPending}
          className="flex h-16 w-full flex-col items-center justify-center rounded-lg border border-warning/40 bg-warning/20 px-2 text-center text-warning-ink transition active:scale-95 disabled:opacity-60"
        >
          <Gift className="size-4" aria-hidden />
          <span className="text-ds-micro font-semibold">{scratch.isPending ? 'Scratching…' : 'Tap to scratch'}</span>
        </button>
      )}
    </li>
  )
}

/** Scratch cards, Team League, Season and badges — below the pipeline. */
export function RewardsExtras({ data }: { data: MyRewards }) {
  const cards = data.scratch_cards ?? []
  const league = data.league
  const season = data.season
  const badges = data.badges ?? []
  const earned = badges.filter((b) => b.earned)

  return (
    <>
      {cards.length ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-ds-caption font-semibold text-foreground">
            <Gift className="size-3.5 text-warning-ink" aria-hidden />
            Scratch cards
            <span className="font-normal text-muted-foreground">· win up to ₹50</span>
          </p>
          <ul className="grid grid-cols-3 gap-2">
            {cards.slice(0, 6).map((c) => (
              <ScratchTile key={c.id} card={c} />
            ))}
          </ul>
        </div>
      ) : null}

      {league ? (
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-ds-caption font-semibold text-foreground">
            <Users className="size-3.5 text-primary" aria-hidden />
            Team League · {rupees(league.pot_rupees)} this week
          </p>
          {league.my_team ? (
            <p className="mt-0.5 text-ds-micro text-muted-foreground">
              Team {league.my_team.name} is #{league.my_team.rank} · you: {league.my_team.my_points} MP
              {league.my_team.my_points < league.min_mp
                ? ` (${league.min_mp - league.my_team.my_points} more to share the prize)`
                : ' — you share the prize if your team wins'}
            </p>
          ) : null}
          {league.top.length ? (
            <ol className="mt-1.5 space-y-0.5">
              {league.top.map((t, i) => (
                <li key={t.name} className="flex justify-between text-ds-caption">
                  <span>
                    {i + 1}. Team {t.name} <span className="text-muted-foreground">({t.members})</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">{t.score} MP/member</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {season ? (
        <div className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-ds-caption font-semibold text-foreground">
            <Medal className="size-3.5 text-warning-ink" aria-hidden />
            {monthName(season.month)} Season
            {season.my_rank ? (
              <span className="ml-auto font-normal text-muted-foreground">
                you #{season.my_rank} · {season.my_points} MP
              </span>
            ) : null}
          </p>
          <ol className="mt-1.5 space-y-0.5">
            {season.top.map((t) => (
              <li key={t.rank} className="flex justify-between text-ds-caption">
                <span>
                  {t.rank}. {t.name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {t.points} MP · {rupees(t.prize_rupees)}
                </span>
              </li>
            ))}
            {season.most_improved ? (
              <li className="flex justify-between text-ds-caption">
                <span>Most Improved: {season.most_improved.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  +{season.most_improved.gain} · {rupees(season.most_improved.prize_rupees)}
                </span>
              </li>
            ) : null}
          </ol>
        </div>
      ) : null}

      {badges.length ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-ds-caption font-semibold text-foreground">
            <Award className="size-3.5 text-warning-ink" aria-hidden />
            Badges · {earned.length}/{badges.length}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <li
                key={b.key}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-ds-micro font-semibold',
                  b.earned ? 'bg-warning/20 text-warning-ink' : 'bg-muted text-muted-foreground/60',
                )}
              >
                {b.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
