import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
      fontSize: {
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
          '1rem',
          { lineHeight: '1.375rem', fontWeight: '600', letterSpacing: '-0.015em' },
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
      },
      spacing: {
        'ds-1': '4px',
        'ds-2': '8px',
        'ds-3': '16px',
        'ds-4': '24px',
        'ds-5': '32px',
      },
      colors: {
        /* oklch tokens from CSS variables (shadcn / v0 export compatible) */
        palette: {
          ink: 'var(--palette-ink)',
          blue: 'var(--palette-blue)',
          'blue-light': 'var(--palette-blue-light)',
          mist: 'var(--palette-mist)',
          'cyan-neon': 'var(--palette-cyan-neon)',
          'cyan-dull': 'var(--palette-cyan-dull)',
        },
        urgency: {
          safe: 'var(--urgency-safe)',
          watch: 'var(--urgency-watch)',
          caution: 'var(--urgency-caution)',
          warning: 'var(--urgency-warning)',
          danger: 'var(--urgency-danger)',
          critical: 'var(--urgency-critical)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: 'var(--surface)',
        subtle: 'var(--subtle)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        success: {
          DEFAULT: 'var(--success)',
          foreground: 'var(--success-foreground)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          foreground: 'var(--warning-foreground)',
        },
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-down': 'slideDown 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-up': 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'bounce-in': 'bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleUp: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '50%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
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
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
      },
      letterSpacing: {
        'label-wide': '0.06em',
      },
      boxShadow: {
        'ios-bar': 'var(--shadow-ios-bar)',
        'ios-card': 'var(--shadow-card)',
        'glass-inset': 'inset 0 1px 1px color-mix(in srgb, var(--palette-ink) 35%, transparent)',
        'urgency-safe': 'var(--urgency-safe-glow)',
        'urgency-safe-card': 'var(--urgency-safe-card-glow)',
        'urgency-watch': 'var(--urgency-watch-glow)',
        'urgency-watch-card': 'var(--urgency-watch-card-glow)',
        'urgency-caution': 'var(--urgency-caution-glow)',
        'urgency-caution-card': 'var(--urgency-caution-card-glow)',
        'urgency-warning': 'var(--urgency-warning-glow)',
        'urgency-warning-card': 'var(--urgency-warning-card-glow)',
        'urgency-danger': 'var(--urgency-danger-glow)',
        'urgency-danger-card': 'var(--urgency-danger-card-glow)',
        'urgency-critical': 'var(--urgency-critical-glow)',
        'urgency-critical-card': 'var(--urgency-critical-card-glow)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
