import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1B3252',
        'navy-lt': '#243F66',
        blue: '#2D7DD2',
        'blue-bg': '#EBF4FF',
        teal: '#34C3A0',
        'teal-dk': '#239C80',
        'teal-bg': '#E8FAF6',
        body: '#374151',
        muted: '#6B7280',
        border: '#E5E7EB',
        bmd: '#D1D5DB',
        off: '#F6F8FA',
        off2: '#EEF1F5',
      },
      fontFamily: {
        heading: ['Nunito', 'sans-serif'],
        body: ['Nunito Sans', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(27,50,82,0.08)',
        'card-lg': '0 8px 28px rgba(27,50,82,0.12)',
      },
    },
  },
  plugins: [],
};
export default config;
