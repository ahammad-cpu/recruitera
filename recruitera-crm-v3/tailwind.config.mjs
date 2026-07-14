import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{ts,tsx,js,jsx,html}'),
  ],
  theme: {
    extend: {
      colors: {
        cg: {
          50: '#EAEBEC', 100: '#D5D7D9', 200: '#C0C3C6', 300: '#ABAFB4',
          400: '#969BA1', 500: '#81878E', 600: '#6C737C', 700: '#575F69',
          800: '#424B56', 900: '#2D3844',
        },
        accent: {
          DEFAULT: '#C0E930',
          strong: '#A8D11A',
          soft: '#F0FAD0',
          ink: '#4F5E1B',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          2: '#F2F4F7',
        },
        border: {
          DEFAULT: '#E2E5EA',
          2: '#CDD2DA',
        },
        text: {
          DEFAULT: '#2D3844',
          2: '#575F69',
          3: '#81878E',
          4: '#ABAFB4',
        },
        ok: { DEFAULT: '#2F8F5C', bg: '#E5F4EC' },
        warn: { DEFAULT: '#B8761A', bg: '#FBF1DE' },
        bad: { DEFAULT: '#B83A3A', bg: '#F7E3E3' },
        info: { DEFAULT: '#2C5BA8', bg: '#E3ECF7' },
        bg: '#F7F8FA',
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
