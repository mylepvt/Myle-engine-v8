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
          { lineHeight: '2rem', fontWeight: '600', letterSpacing: '-0.03em' },
        ],
        'ds-h2': [
          '1.25rem',
          { lineHeight: '1.625rem', fontWeight: '600', letterSpacing: '-0.022em' },
        ],
        'ds-h3': [
          '1rem',
          { lineHeight: '1.375rem', fontWeight: '500', letterSpacing: '-0.012em' },
        ],
        'ds-body': [
          '0.9375rem',
          { lineHeight: '1.5rem', fontWeight: '400' },
        ],
        'ds-caption': [
          '0.8125rem',
          { lineHeight: '1.2rem', fontWeight: '400' },
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
        'ios-bar':
          '0 0.5px 0 0 hsl(0 0% 100% / 0.12), 0 8px 24px -12px rgba(0,0,0,0.45)',
        'ios-card': '0 4px 24px -8px rgba(0,0,0,0.55)',
        'glass-inset': 'inset 0 1px 1px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
