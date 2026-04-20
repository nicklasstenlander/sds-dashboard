/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          mint:       '#CDDCD1',
          mintLight:  '#e6f0ec',
          dark:       '#001617',
          forest:     '#1e4025',
          sage:       '#a3c0b2',
          muted:      '#082826',
        },
      },
      fontFamily: {
        sans: ['Agrandir', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
