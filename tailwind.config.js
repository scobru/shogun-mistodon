/** @type {import('tailwindcss').Config} */
import shogunConfig from 'shogun-theme/tailwind.config.js';

export default {
  ...shogunConfig,
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
    './index.html',
  ],
  daisyui: {
    ...shogunConfig.daisyui,
    themes: [
      "shogun-dark",
      "shogun-light",
    ],
    darkTheme: "shogun-dark",
  },
}

