/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#12141e',
          raised: '#1a1d2e',
          overlay: '#161825',
          sunken: '#0e1018',
          hover: 'rgba(255,255,255,0.04)',
        },
        border: {
          DEFAULT: 'rgba(55,65,81,0.5)',
          strong: 'rgba(55,65,81,0.8)',
          accent: 'rgba(99,102,241,0.3)',
        },
        accent: {
          DEFAULT: '#5b5fc7',
          hover: '#7578d4',
          muted: 'rgba(91,95,199,0.15)',
        },
        status: {
          success: '#3d9470',
          warning: '#c48a3c',
          danger: '#c94a4a',
          info: '#4a7ec4',
        },
      },
      borderRadius: {
        'card': '0.75rem',
        'pill': '9999px',
      },
      spacing: {
        'sidebar': '16rem',
        'sidebar-collapsed': '4rem',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'slide-up': 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}

