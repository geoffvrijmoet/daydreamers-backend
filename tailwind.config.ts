import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

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
  			quicksand: ['var(--font-quicksand)', 'sans-serif'],
  		},
  		colors: {
  			blue: {
  				pastel: '#E0F2FE',
  				light: '#BAE6FD',
  				DEFAULT: '#7DD3FC',
  				dark: '#38BDF8',
  			},
  			purple: {
  				pastel: '#F3E8FF',
  				light: '#E9D5FF',
  				DEFAULT: '#D8B4FE',
  				dark: '#C084FC',
  			},
  			green: {
  				pastel: '#DCFCE7',
  				light: '#BBF7D0',
  				DEFAULT: '#86EFAC',
  				dark: '#4ADE80',
  			},
  			red: {
  				pastel: '#FFE4E6',
  				light: '#FECDD3',
  				DEFAULT: '#FDA4AF',
  				dark: '#FB7185',
  			},
  			yellow: {
  				pastel: '#FEF9C3',
  				light: '#FEF08A',
  				DEFAULT: '#FDE047',
  				dark: '#FACC15',
  			},
  			background: '#FFFFFF',
  			surface: {
  				light: '#FFFFFF',
  				DEFAULT: '#F8FAFC',
  				dark: '#F1F5F9',
  			},
  		},
  		boxShadow: {
  			'soft': '0 2px 4px rgba(0, 0, 0, 0.05)',
  			'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
  		},
  	}
  },
  plugins: [animate],
};

export default config;
