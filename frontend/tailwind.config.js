import tailwindcssAnimate from 'tailwindcss-animate'

/**
 * Theme colours are CSS variables (hex / oklch). Tailwind can only apply an opacity
 * modifier (`bg-muted/60`, `border-border/50`) when the colour exposes
 * `<alpha-value>`, so wrap each variable in color-mix. Without this every
 * `<token>/<n>` class compiled to nothing.
 */
function themeColor(name) {
  return `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // On touch devices (mobile / Capacitor app) `hover:` styles otherwise "stick"
  // after the first tap, so the real action needs a second tap. Gating hover
  // variants behind `@media (hover: hover)` makes them apply only with a real
  // pointer (mouse), so a single tap activates everywhere on touch.
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        heading: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      /* Extra opacity steps used across the app (Tailwind only ships multiples of 5,
         so e.g. `border-white/12` silently compiled to nothing). */
      opacity: {
        8: '0.08',
        12: '0.12',
        16: '0.16',
        18: '0.18',
        42: '0.42',
        62: '0.62',
        64: '0.64',
        68: '0.68',
        72: '0.72',
        74: '0.74',
        88: '0.88',
        96: '0.96',
      },
      fontSize: {
        /* 28px — big KPI / stat numbers only (dashboard tiles, scores). */
        'ds-display': ['1.75rem', { lineHeight: '2rem', letterSpacing: '-0.03em' }],
        /* iOS large title feel on web (scaled for dashboard density) */
        'ds-h1': [
          '1.625rem',
          { lineHeight: '2rem', fontWeight: '700', letterSpacing: '-0.035em' },
        ],
        'ds-h2': [
          '1.25rem',
          { lineHeight: '1.625rem', fontWeight: '700', letterSpacing: '-0.025em' },
        ],
        'ds-h3': [
          // 17px — restores a real step above the 15px body (was 16px, a 1px
          // collapse that flattened the heading vs body hierarchy)
          '1.0625rem',
          { lineHeight: '1.45rem', fontWeight: '600', letterSpacing: '-0.015em' },
        ],
        'ds-body': [
          '0.9375rem',
          { lineHeight: '1.5rem', fontWeight: '400' },
        ],
        'ds-caption': [
          '0.8125rem',
          { lineHeight: '1.2rem', fontWeight: '500' },
        ],
        'ds-label': [
          '0.6875rem',
          { lineHeight: '1rem', fontWeight: '600', letterSpacing: '0.07em' },
        ],
        /* 11px — smallest text allowed anywhere (metadata, chips, chart ticks).
           No weight/tracking so it composes with font-* / tracking-* utilities. */
        'ds-micro': ['0.6875rem', { lineHeight: '1rem' }],
      },
      colors: {
        /* oklch tokens from CSS variables (shadcn / v0 export compatible) */
        palette: {
          ink: themeColor('palette-ink'),
          blue: themeColor('palette-blue'),
          'blue-light': themeColor('palette-blue-light'),
          mist: themeColor('palette-mist'),
          'cyan-neon': themeColor('palette-cyan-neon'),
          'cyan-dull': themeColor('palette-cyan-dull'),
        },
        urgency: {
          safe: themeColor('urgency-safe'),
          watch: themeColor('urgency-watch'),
          caution: themeColor('urgency-caution'),
          warning: themeColor('urgency-warning'),
          danger: themeColor('urgency-danger'),
          critical: themeColor('urgency-critical'),
        },
        border: themeColor('border'),
        input: themeColor('input'),
        ring: themeColor('ring'),
        background: themeColor('background'),
        foreground: themeColor('foreground'),
        surface: themeColor('surface'),
        subtle: themeColor('subtle'),
        primary: {
          DEFAULT: themeColor('primary'),
          foreground: themeColor('primary-foreground'),
        },
        secondary: {
          DEFAULT: themeColor('secondary'),
          foreground: themeColor('secondary-foreground'),
        },
        destructive: {
          DEFAULT: themeColor('destructive'),
          foreground: themeColor('destructive-foreground'),
          ink: themeColor('destructive-ink'),
        },
        muted: {
          DEFAULT: themeColor('muted'),
          foreground: themeColor('muted-foreground'),
        },
        accent: {
          DEFAULT: themeColor('accent'),
          foreground: themeColor('accent-foreground'),
        },
        popover: {
          DEFAULT: themeColor('popover'),
          foreground: themeColor('popover-foreground'),
        },
        card: {
          DEFAULT: themeColor('card'),
          foreground: themeColor('card-foreground'),
        },
        /* informational blue (status, not brand actions — use primary for those) */
        info: {
          DEFAULT: themeColor('info'),
          ink: themeColor('info-ink'),
        },
        success: {
          DEFAULT: themeColor('success'),
          foreground: themeColor('success-foreground'),
          ink: themeColor('success-ink'),
        },
        warning: {
          DEFAULT: themeColor('warning'),
          foreground: themeColor('warning-foreground'),
          ink: themeColor('warning-ink'),
        },
        /* WhatsApp brand — fixed colours (same in light / dark). */
        whatsapp: {
          DEFAULT: '#25D366',
          teal: '#128C7E',
          dark: '#1EA34B',
          light: '#34EB75',
          ink: '#065F46',
          'ink-dark': '#DCF8C6',
        },
        /* Prospect-facing "private room" pages (watch, Day 1/2/6, enrollment) —
           always dark navy regardless of the app theme. */
        room: {
          base: '#040915',
          surface: '#0A1120',
          raised: '#14233F',
          strong: '#3158A4',
          border: '#26385D',
          'border-strong': '#3F537D',
          text: '#F3F7FF',
          soft: '#C9D9FF',
          muted: '#9DB0D6',
          subtle: '#7A94C4',
          accent: '#8EB0FF',
          cta: '#DCE7FF',
          'cta-hover': '#C6D8FF',
          'cta-ink': '#0A1530',
          danger: '#FFB8BD',
          'danger-soft': '#D6C3C7',
          'danger-border': '#5B2327',
          'danger-bg': '#100708',
          warning: '#FFD9A0',
        },
        /* lead-journey phase colours (src/lib/stage-colors.ts) */
        stage: {
          early: themeColor('stage-early'),
          'early-ink': themeColor('stage-early-ink'),
          engaged: themeColor('stage-engaged'),
          'engaged-ink': themeColor('stage-engaged-ink'),
          closing: themeColor('stage-closing'),
          'closing-ink': themeColor('stage-closing-ink'),
          won: themeColor('stage-won'),
          'won-ink': themeColor('stage-won-ink'),
          lost: themeColor('stage-lost'),
          'lost-ink': themeColor('stage-lost-ink'),
          parked: themeColor('stage-parked'),
          'parked-ink': themeColor('stage-parked-ink'),
        },
        chart: {
          1: themeColor('chart-1'),
          2: themeColor('chart-2'),
          3: themeColor('chart-3'),
          4: themeColor('chart-4'),
          5: themeColor('chart-5'),
        },
      },
      animation: {
        /* statusPulse / global fadeIn + slideUp keyframes live in index.css;
           dot-in is the only config-defined animation still in use */
        'dot-in': 'dotIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
      keyframes: {
        /* statusPulse is consumed directly by .status-dot in index.css */
        statusPulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.75', transform: 'scale(1.15)' },
        },
        dotIn: {
          '0%': { opacity: '0', transform: 'translateY(-8px) scale(0.6)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'smooth-bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
            borderRadius: {
        /* One scale from --radius (10px). Arbitrary `rounded-[…]` values are
           blocked by design-tokens-usage.test.ts — pick the nearest step instead. */
        DEFAULT: 'calc(var(--radius) - 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 2px)',
        '2xl': 'calc(var(--radius) + 4px)',
        '3xl': 'calc(var(--radius) + 8px)',
        /* hero panels and prospect-room cards */
        '4xl': 'calc(var(--radius) + 14px)',
      },
      letterSpacing: {
        'label-wide': '0.06em',
      },
      boxShadow: {
        'ios-bar': 'var(--shadow-ios-bar)',
        'ios-card': 'var(--shadow-card)',
        'glass-inset': 'inset 0 1px 1px color-mix(in srgb, var(--palette-ink) 35%, transparent)',
        'urgency-safe': themeColor('urgency-safe-glow'),
        'urgency-safe-card': themeColor('urgency-safe-card-glow'),
        'urgency-watch': themeColor('urgency-watch-glow'),
        'urgency-watch-card': themeColor('urgency-watch-card-glow'),
        'urgency-caution': themeColor('urgency-caution-glow'),
        'urgency-caution-card': themeColor('urgency-caution-card-glow'),
        'urgency-warning': themeColor('urgency-warning-glow'),
        'urgency-warning-card': themeColor('urgency-warning-card-glow'),
        'urgency-danger': themeColor('urgency-danger-glow'),
        'urgency-danger-card': themeColor('urgency-danger-card-glow'),
        'urgency-critical': themeColor('urgency-critical-glow'),
        'urgency-critical-card': themeColor('urgency-critical-card-glow'),
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
