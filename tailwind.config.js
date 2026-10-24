/** @type {import('tailwindcss').Config} */
// Panel colors are semantic tokens backed by CSS variables (see index.css), so the same classes
// work in light and dark mode. The public store uses its own per-business theme instead.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './*.tsx', './components/**/*.tsx', './context/**/*.tsx'],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        muted: token('muted'),
        line: token('line'),
        control: token('control'),
        fg: {
          DEFAULT: token('fg'),
          muted: token('fg-muted'),
          subtle: token('fg-subtle'),
        },
        primary: {
          DEFAULT: token('primary'),
          fg: token('primary-fg'),
        },
        danger: token('danger'),
        success: token('success'),
        // Original palette, kept for the store's default theme values
        'brand-primary': '#4A7C59',
        'brand-secondary': '#F5F5DC',
        'brand-accent': '#D2B48C',
        'brand-text': '#3D3D3D',
        'brand-light': '#F9F9F0',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.04)',
        pop: '0 16px 48px -12px rgb(0 0 0 / 0.25)',
      },
    },
  },
  plugins: [],
};
