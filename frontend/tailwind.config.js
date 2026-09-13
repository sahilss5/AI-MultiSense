/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          main: '#05070B',
          surface: '#0B0F16',
          elevated: '#101621',
        },
        thermal: {
          cyan: '#63D8E6',
          violet: '#8C9BFF',
          green: '#68D7A5',
          coral: '#E97D87',
          amber: '#E6B866',
        },
        text: {
          primary: '#F5F7FA',
          secondary: '#8D98AA',
          muted: '#5E697A',
        },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}


