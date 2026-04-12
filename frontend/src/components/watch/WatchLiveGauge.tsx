/**
 * Minimal SaaS-style “live session” gauge — animated needle + shifting accent colour.
 * Respects `prefers-reduced-motion`.
 */

export function WatchLiveGauge() {
  return (
    <div
      className="watch-live-gauge relative mx-auto mb-6 w-full max-w-[280px] select-none"
      aria-hidden
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/55">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/80 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Live
        </span>
        <span className="text-[0.65rem] tabular-nums text-white/40">Session</span>
      </div>

      <div className="relative aspect-[2/1] w-full">
        <svg
          viewBox="0 0 200 110"
          className="h-full w-full overflow-visible"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="watchGaugeArc" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(190 95% 52%)" />
              <stop offset="50%" stopColor="hsl(280 90% 58%)" />
              <stop offset="100%" stopColor="hsl(32 95% 58%)" />
            </linearGradient>
            <filter id="watchGaugeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Arc track */}
          <path
            d="M 24 100 A 76 76 0 0 1 176 100"
            stroke="url(#watchGaugeArc)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity={0.35}
            className="watch-gauge-hue"
          />
          <path
            d="M 24 100 A 76 76 0 0 1 176 100"
            stroke="url(#watchGaugeArc)"
            strokeWidth="3"
            strokeLinecap="round"
            filter="url(#watchGaugeGlow)"
            className="watch-gauge-hue"
          />

          {/* Needle — pivot at semicircle centre */}
          <g transform="translate(100 100)">
            <g className="watch-gauge-needle">
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="-64"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity={0.95}
              />
              <circle cx="0" cy="0" r="5" fill="white" opacity={0.9} />
              <circle cx="0" cy="0" r="2.5" fill="hsl(190 95% 45%)" />
            </g>
          </g>
        </svg>
      </div>

      <style>{`
        .watch-gauge-hue {
          animation: watch-gauge-hue-shift 8s ease-in-out infinite alternate;
        }
        .watch-gauge-needle {
          transform-origin: 0 0;
          animation: watch-gauge-needle-swing 2.8s ease-in-out infinite alternate;
        }
        @keyframes watch-gauge-hue-shift {
          from { filter: hue-rotate(0deg); }
          to { filter: hue-rotate(45deg); }
        }
        @keyframes watch-gauge-needle-swing {
          from { transform: rotate(-58deg); }
          to { transform: rotate(58deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .watch-gauge-hue,
          .watch-gauge-needle {
            animation: none !important;
          }
          .watch-gauge-needle {
            transform: rotate(0deg);
          }
        }
      `}</style>
    </div>
  )
}
