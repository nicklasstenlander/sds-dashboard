/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Statusfärger är semantiska och ska endast användas för tillstånd.
        status: {
          ok: '#a3c0b2',
          okSoft: '#CDDCD1',
          warning: '#E0A23B',
          warningSoft: '#F6E4BE',
          critical: '#dd5c86',
          criticalSoft: '#F7DDE6',
        },
        // Identitetsfärger är dekorativa per korttyp och saknar statusbetydelse.
        identity: {
          violet: '#f0e9f5',
          sky: '#dceff8',
          amber: '#f7dc66',
        },
        // Neutrala ytor (2.0): grå sidbakgrund bakom vita kort. Ingen grön ton.
        surface: {
          page:     '#ffffff',
          selected: '#e9ecec',
        },
        brand: {
          // Teal/mint family
          dark:       '#1a2e2e',  // mörk text-färg (teal-tinted near-black)
          accent:     '#dd5c86',  // SDS Rosa — den enda accentfärgen (fyllningar, markeringar, fokus)
          teal:       '#45aba5',
          sage:       '#a0c4b9',  // ljus teal-sage
          mint:       '#cfded2',  // ljusgrön mint — borders, dividers

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
