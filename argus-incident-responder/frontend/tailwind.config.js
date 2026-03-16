/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        'slide-up-fade': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px 2px rgba(239,68,68,0.4)' },
          '50%':       { boxShadow: '0 0 20px 6px rgba(239,68,68,0.8)' },
        },
        'scan': {
          '0%':   { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 40px' },
        },
        'orb-idle': {
          '0%, 100%': { transform: 'scale(1)',    opacity: '0.7' },
          '50%':      { transform: 'scale(1.06)', opacity: '1'   },
        },
        'orb-active': {
          '0%, 100%': { transform: 'scale(1)',    boxShadow: '0 0 30px 8px rgba(99,102,241,0.35)' },
          '50%':      { transform: 'scale(1.08)', boxShadow: '0 0 60px 20px rgba(99,102,241,0.6)' },
        },
        'interrupt-flash': {
          '0%':   { opacity: '1',   transform: 'scale(1)' },
          '30%':  { opacity: '0.4', transform: 'scale(0.94)' },
          '60%':  { opacity: '1',   transform: 'scale(1.04)' },
          '100%': { opacity: '1',   transform: 'scale(1)' },
        },
        'slide-down-fade': {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'bar-grow': {
          '0%':   { transform: 'scaleY(0.1)' },
          '100%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'slide-up-fade':    'slide-up-fade 0.3s ease-out both',
        'slide-down-fade':  'slide-down-fade 0.2s ease-out both',
        'pulse-glow':       'pulse-glow 2s ease-in-out infinite',
        'scan':             'scan 4s linear infinite',
        'orb-idle':         'orb-idle 3s ease-in-out infinite',
        'orb-active':       'orb-active 2s ease-in-out infinite',
        'interrupt-flash':  'interrupt-flash 0.8s ease-out both',
      },
    },
  },
  plugins: [],
}
