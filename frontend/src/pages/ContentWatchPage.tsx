import { useSearchParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'

import { InAppVideoPlayer } from '@/components/watch/InAppVideoPlayer'
import { whatsAppChatWithTextHref } from '@/lib/phone-links'
import { buildEmbeddableVideoUrl } from '@/lib/youtube'

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good Morning'
  if (h < 17) return 'Good Afternoon'
  return 'Good Evening'
}

export function ContentWatchPage() {
  const [params] = useSearchParams()
  const videoUrl = params.get('video') ?? ''
  const leadName = params.get('name') ?? ''
  const title = params.get('title') ?? 'Watch Session'
  const phone = params.get('phone') ?? ''

  const greeting = timeGreeting()
  const firstName = leadName.split(/\s+/)[0] ?? ''
  const greetLine = firstName ? `${greeting}, ${firstName}!` : `${greeting}!`

  // Convert raw YouTube watch URL → embed URL; native video URLs pass through as-is
  const embedUrl = buildEmbeddableVideoUrl(videoUrl || null, null) ?? (videoUrl || null)

  const waHref =
    phone && videoUrl
      ? whatsAppChatWithTextHref(
          phone,
          `Hi ${leadName || 'there'},\n\nHere is your session video for ${title}:\n${videoUrl}`,
        )
      : null

  return (
    <div className="min-h-dvh bg-[#060f20] text-white">
      <div className="mx-auto max-w-3xl px-4 py-10 md:py-16">
        <div className="mb-8">
          <p className="text-ds-caption font-semibold uppercase tracking-[0.28em] text-cyan-300/70">
            Myle · {title}
          </p>
          <h1 className="mt-3 text-ds-h1">{greetLine}</h1>
          <p className="mt-2 text-base text-white/55">
            Your session is ready — watch it below.
          </p>
        </div>

        <InAppVideoPlayer
          embedUrl={embedUrl}
          title={title}
          fallbackUrl={videoUrl || null}
          previewEyebrow={greetLine}
          previewTitle={title}
          previewDescription={`Watch ${title} right here inside the app.`}
          playLabel="Watch Now"
        />

        {waHref ? (
          <div className="mt-6">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-ds-body font-semibold text-emerald-300 transition hover:bg-emerald-400/20"
            >
              <MessageCircle className="size-4" />
              {firstName ? `Send to ${firstName} on WhatsApp` : 'Send on WhatsApp'}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}
