import type { Config } from "tailwindcss";

const config = {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			primary: {
  				DEFAULT: '#d5bcff',
  				50: '#faf7ff',
  				100: '#f4eeff',
  				200: '#e9ddff',
  				300: '#d5bcff', // New main color
  				400: '#c39dff',
  				500: '#ab74ff',
  				600: '#9955ff',
  				700: '#8833ff',
  				800: '#7719ff',
  				900: '#6600ff',
  				950: '#5200cc',
  			},
  			secondary: {
  				DEFAULT: '#bce0ff',
  				50: '#f1f9ff',
  				100: '#e3f2ff',
  				200: '#bce0ff', // New secondary color
  				300: '#85c6ff',
  				400: '#49a6ff',
  				500: '#1a85ff',
  				600: '#0066ff',
  				700: '#0052cc',
  				800: '#0042a3',
  				900: '#003380',
  				950: '#001f4d',
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
