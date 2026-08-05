/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { brand: { 600: '#0d9488', 700: '#0f766e', 800: '#115e59' } },
      // Field workers use this one-handed, sometimes with gloves.
      minHeight: { touch: '44px' },
    },
  },
  plugins: [],
};
