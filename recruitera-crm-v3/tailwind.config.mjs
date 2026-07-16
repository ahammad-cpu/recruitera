import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tailwind's documented pattern for CSS-variable-backed colors that still
// support opacity modifiers (bg-warn/30, border-bad/40, ...). The CSS
// variables are RGB triplets (defined once in src/index.css) — this wraps
// them in rgb(...) and substitutes the /NN opacity when one is given.
function withOpacity(variableName) {
  return ({ opacityValue }) => (opacityValue !== undefined
    ? `rgb(var(${variableName}) / ${opacityValue})`
    : `rgb(var(${variableName}))`);
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{ts,tsx,js,jsx,html}'),
  ],
  theme: {
    extend: {
      colors: {
        // Every value here reads the CSS custom property defined in
        // src/index.css — that file is the single source of truth. Change
        // a color there and every Tailwind class (including /opacity
        // variants) and any inline style that reads rgb(var(--token))
        // update together.
        cg: {
          50: withOpacity('--cg-50'), 100: withOpacity('--cg-100'), 200: withOpacity('--cg-200'), 300: withOpacity('--cg-300'),
          400: withOpacity('--cg-400'), 500: withOpacity('--cg-500'), 600: withOpacity('--cg-600'), 700: withOpacity('--cg-700'),
          800: withOpacity('--cg-800'), 900: withOpacity('--cg-900'),
        },
        accent: {
          DEFAULT: withOpacity('--accent'),
          strong: withOpacity('--accent-strong'),
          soft: withOpacity('--accent-soft'),
          ink: withOpacity('--accent-ink'),
        },
        surface: {
          DEFAULT: withOpacity('--surface'),
          2: withOpacity('--surface-2'),
        },
        border: {
          DEFAULT: withOpacity('--border'),
          2: withOpacity('--border-2'),
        },
        text: {
          DEFAULT: withOpacity('--text'),
          2: withOpacity('--text-2'),
          3: withOpacity('--text-3'),
          4: withOpacity('--text-4'),
        },
        ok: { DEFAULT: withOpacity('--ok'), bg: withOpacity('--ok-bg') },
        warn: { DEFAULT: withOpacity('--warn'), bg: withOpacity('--warn-bg') },
        bad: { DEFAULT: withOpacity('--bad'), bg: withOpacity('--bad-bg') },
        info: { DEFAULT: withOpacity('--info'), bg: withOpacity('--info-bg') },
        // Pipeline-stage-only hues (SQL / Demo columns + StagePill badges).
        violet: { DEFAULT: withOpacity('--violet'), bg: withOpacity('--violet-bg') },
        purple: { DEFAULT: withOpacity('--purple'), bg: withOpacity('--purple-bg') },
        bg: withOpacity('--bg'),
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        xxs: ['10px', '1.4'],
      },
      boxShadow: {
        sh1: '0 1px 0 rgba(45,56,68,.04)',
        sh2: '0 1px 2px rgba(45,56,68,.06),0 4px 12px rgba(45,56,68,.04)',
        sh3: '0 8px 24px rgba(45,56,68,.10),0 2px 6px rgba(45,56,68,.06)',
      },
    },
  },
  plugins: [],
};
