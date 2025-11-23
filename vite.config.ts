import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  // Base configuration
  root: ".",
  base: "/",

  // Development server
  server: {
    port: 8080,
    host: true,
    open: true,
    cors: true,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
    fs: {
      // Allow serving files from one level up to the project root
      allow: [".."],
    },
    // Handle client-side routing
    historyApiFallback: {
      disableDotRule: true,
      rewrites: [
        { from: /^\/auth\/callback/, to: '/index.html' },
        { from: /./, to: '/index.html' }
      ]
    }
  },

  // Preview server (for built files)
  preview: {
    port: 8080,
    host: true,
    open: true,
    strictPort: true,
  },

  // Build configuration
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: true,
    minify: "terser",
    target: "es2020",
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
  },

  // Plugins
  plugins: [
    react(), 
    tailwindcss(),
    nodePolyfills({
      // Include polyfills for specific globals and modules
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Enable polyfills for specific Node.js modules
      protocolImports: true,
    }),
  ],

  // Resolve configuration
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: 'buffer',
      stream: 'stream-browserify',
      crypto: 'crypto-browserify',
      util: 'util',
      process: 'process/browser',
    },
  },

  // Optimizations
  optimizeDeps: {
    include: [ "uuid", "buffer", "process", "shogun-core"],
    exclude: ["shogun-button-react"],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
    },
  },

  // Define global constants
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === "development"),
    __VERSION__: JSON.stringify(process.env.npm_package_version),
    global: "globalThis",
    "process.env": {},
    "process.env.SKIP_CRYPTO_GENERATION": JSON.stringify("1"),
  },

  // Prevent conflicts with wallet extensions
  esbuild: {
    define: {
      global: "globalThis",
    },
  },

  // CSS configuration
  css: {
    devSourcemap: true,
    preprocessorOptions: {
      css: {
        charset: false,
      },
    },
  },

  // Asset handling
  assetsInclude: ["**/*.md", "**/*.txt"],

  // Worker configuration
  worker: {
    format: "es",
  },

  // Public directory configuration
  publicDir: "public",
});

