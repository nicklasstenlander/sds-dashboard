// Färgtokens för inline-stilar. Tailwind-token med samma namn finns i tailwind.config.js.
export const colors = {
  brand: {
    lightGreen: '#CDDCD1',
    darkGreen: '#1e4025',
    midGreen: '#a3c0b2',
    pink: '#dd5c86',
    background: '#f5f8f6',
    white: '#ffffff',
    black: '#111111',
  },
  status: {
    ok: '#a3c0b2',
    okSoft: '#CDDCD1',
    warning: '#E0A23B',
    warningSoft: '#F6E4BE',
    critical: '#dd5c86',
    criticalSoft: '#F7DDE6',
  },
  identity: {
    violet: '#f0e9f5',
    sky: '#dceff8',
    amber: '#f7dc66',
  },
} as const
