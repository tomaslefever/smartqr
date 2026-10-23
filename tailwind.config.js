/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './*.tsx', './components/**/*.tsx', './context/**/*.tsx'],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#4A7C59',
        'brand-secondary': '#F5F5DC',
        'brand-accent': '#D2B48C',
        'brand-text': '#3D3D3D',
        'brand-light': '#F9F9F0',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
