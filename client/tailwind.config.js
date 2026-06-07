/**
 * Tailwind CSS Configuration
 *
 * Content paths scan all React components and pages for utility class usage.
 * Extends the default theme with Nebula-specific design tokens as needed.
 *
 * @see https://tailwindcss.com/docs/configuration
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};