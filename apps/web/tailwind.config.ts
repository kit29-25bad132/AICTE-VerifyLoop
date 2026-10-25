export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { navy: '#0F1B2D', blue: '#1A56DB', sky: '#E8F0FE' },
        status: { verified: '#16A34A', mismatch: '#DC2626', pending: '#D97706', unavailable: '#6B7280' },
        sla: { safe: '#16A34A', risk: '#D97706', breach: '#DC2626' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
    },
  },
};
