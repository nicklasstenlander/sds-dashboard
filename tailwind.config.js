/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // Teal/mint family
          dark:       '#1a2e2e',  // mörk text-färg (teal-tinted near-black)
          forest:     '#009399',  // primär accent — ikoner, länkar, aktiv nav
          teal:       '#45aba5',
          sage:       '#a0c4b9',  // ljus teal-sage
          mint:       '#cfded2',  // ljusgrön mint — borders, dividers
          mintLight:  '#f4d1ce',  // ljusrosa — hover-bakgrunder, kort-tints

          // Rosa/pink family
          pink:       '#f192ac',
          pinkLight:  '#f4d1ce',
          pinkMid:    '#ee7a9f',
          pinkDark:   '#dd5c86',
        },
      },
      fontFamily: {
        sans: ['Agrandir', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
