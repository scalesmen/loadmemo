/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", 
    "./public/index.html" // This line makes Tailwind scan your React files
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}