import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			mono: [
  				'IBM Plex Mono',
  				'VT323',
  				'Space Mono',
  				'Courier New',
  				'monospace',
  			],
  		},
  		colors: {
  			terminal: {
  				DEFAULT: '#00ff00',
  				black: '#000000',
  				green: {
  					DEFAULT: '#00ff00',
  					dark: '#008800',
  				},
  				cyan: {
  					DEFAULT: '#00ffff',
  					dark: '#008888',
  				},
  				red: {
  					DEFAULT: '#ff0000',
  					dark: '#880000',
  				},
  				yellow: {
  					DEFAULT: '#ffff00',
  					dark: '#888800',
  				},
  			},
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
  		},
  		backgroundImage: {
  			'crt-lines': 'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.1) 0px, rgba(0, 0, 0, 0.1) 1px, transparent 1px, transparent 2px)',
  		},
  		animation: {
  			'crt-flicker': 'flicker 0.15s infinite',
  		},
  		keyframes: {
  			flicker: {
  				'0%': { opacity: '0.9' },
  				'50%': { opacity: '1' },
  				'100%': { opacity: '0.9' },
  			},
  		},
  	}
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
