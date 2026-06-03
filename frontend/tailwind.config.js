/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // ── Couleurs fond noir pur ────────────────────────────────────────
      colors: {
        dark: {
          900: '#000000',   // fond principal — noir absolu
          800: '#0a0a0a',   // cartes / panels
          700: '#111111',   // éléments élevés
          600: '#1a1a1a',   // bordures, hover
          500: '#242424',   // secondary hover
        },
        accent: {
          blue:   '#3b82f6',
          green:  '#10b981',
          red:    '#ef4444',
          yellow: '#f59e0b',
        },
      },

      // ── Typographie ───────────────────────────────────────────────────
      fontFamily: {
        // UI générale — propre et lisible
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        // Terminal boursier — prix, tickers, codes, indicateurs
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },

      // ── Taille extra-small ────────────────────────────────────────────
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
}
