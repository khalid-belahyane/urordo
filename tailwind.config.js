/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ─── All colors reference CSS custom properties ──────────────────
           This means Tailwind classes automatically respond to the active
           theme (light or dark) without needing dark: variants on every element. */

        /* Paper (background) tier */
        paper: {
          DEFAULT: 'var(--color-paper)',
          2:       'var(--color-paper-2)',
          3:       'var(--color-paper-3)',
          4:       'var(--color-paper-4)',
          /* Compatibility aliases — kept for legacy classes in Inbox / Review / History */
          25:  'var(--color-paper)',
          50:  'var(--color-paper)',
          100: 'var(--color-paper-2)',
          200: 'var(--color-rule)',
          300: 'var(--color-ink-faint)',
          400: 'var(--color-ink-muted)',
          900: 'var(--color-ink)',
        },

        /* Ink (text) tier */
        ink: {
          DEFAULT: 'var(--color-ink)',
          2:       'var(--color-ink-2)',
          muted:   'var(--color-ink-muted)',
          faint:   'var(--color-ink-faint)',
          /* Compatibility aliases */
          dark:    'var(--color-ink)',
          light:   'var(--color-ink-muted)',
        },

        /* Semantic border / divider */
        rule: 'var(--color-rule)',

        /* Brand accent — warm gold */
        gold: {
          DEFAULT: 'var(--color-gold)',
          dark:    'var(--color-gold-dark)',
          light:   'var(--color-gold-light)',
        },

        /* State colors */
        green: {
          DEFAULT: 'var(--color-green)',
          dark:    'var(--color-green-dark)',
          transparent: 'rgba(46,94,24,.08)',
        },
        red: {
          DEFAULT: 'var(--color-red)',
        },
        brand: {
          DEFAULT: 'var(--color-brand)',
        },

        /* Compatibility aliases for legacy accent classes in Inbox / Review / Settings */
        accent: {
          DEFAULT: 'var(--color-gold)',
          light:   'var(--color-rule)',
          dark:    'var(--color-gold-dark)',
          copper:  'var(--color-gold)',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        body:    ['"DM Mono"', 'monospace'],
        mono:    ['"DM Mono"', 'ui-monospace', 'Menlo', 'Consolas', '"Courier New"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        sm:     '4px',
        DEFAULT:'8px',
        md:     '8px',
        lg:     '12px',
        xl:     '16px',
        '2xl':  '20px',
        '3xl':  '28px',
      },
      boxShadow: {
        'warm-sm':   'var(--shadow-sm)',
        'warm-md':   'var(--shadow-md)',
        'warm-lg':   'var(--shadow-lg)',
        'accent':    'var(--shadow-accent)',
        'inset':     'var(--shadow-inset)',
        'inset-sm':  'var(--shadow-inset-sm)',
      },
    },
  },
  plugins: [],
}
