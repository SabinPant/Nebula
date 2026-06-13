/**
 * Tailwind CSS Configuration
 *
 * Nebula design tokens — institutional blue and white palette.
 * Clean, accessible, educational platform styling.
 * Ages 12-70. Financial trust, not crypto startup.
 *
 * @see https://tailwindcss.com/docs/configuration
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary palette
        primary: {
          50: '#eef4fb',
          100: '#d4e3f5',
          200: '#b1cdec',
          300: '#81aee0',
          400: '#4f8cd0',
          500: '#3470b8',
          600: '#28589c',
          700: '#22487f',
          800: '#1f3d69',
          900: '#1a3558', // Deepest blue — nav, footer
          950: '#112240',
        },
        // Success / positive (green — price up)
        success: {
          500: '#16a34a',
          600: '#15803d',
        },
        // Danger / negative (red — price down)
        danger: {
          500: '#dc2626',
          600: '#b91c1c',
        },
        // Surface colors
        surface: {
          50: '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};