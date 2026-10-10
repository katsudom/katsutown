/** @type {import('tailwindcss').Config} */
export default {
  content: ['./classic.html', './src/classic/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        crimson: { DEFAULT: '#C2283C', dark: '#8E1B2E', light: '#E04A5A' },
        cream: { DEFAULT: '#F7EBD3', light: '#FFF8E7', dark: '#D9C6A3' },
        ink: '#1E1A21',
      },
      fontFamily: {
        pixel: ['"Katsudom Pixel"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
