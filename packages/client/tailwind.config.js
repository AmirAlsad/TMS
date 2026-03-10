/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        whatsapp: {
          teal: '#075e54',
          green: '#25D366',
          'bubble-user': '#d9fdd3',
          'bubble-user-dark': '#005c4b',
          'bubble-bot': '#ffffff',
          'bubble-bot-dark': '#202c33',
          bg: '#ece5dd',
          'bg-dark': '#0b141a',
          'input-bg': '#f0f0f0',
          'input-bg-dark': '#1f2c34',
          border: '#d1d1d1',
          'border-dark': '#2a3942',
        },
        sms: {
          blue: '#3B82F6',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'typing-bounce': 'typingBounce 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
