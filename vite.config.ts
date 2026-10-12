/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { devkit } from './vite-plugins/devkit/devkitVite'
import { words } from './vite-plugins/words/wordsVite'

// Fonts the game's UI style never uses (F66): the kit ships one font per style preset; the offline cache keeps only the
// ones content/ui/style.json's preset (+ its tweaks) names. A Dev Kit preset switch still fetches the others on demand.
function unusedFontGlobs(): string[] {
  const read = (path: string) => readFileSync(resolve(import.meta.dirname, path), 'utf8')
  const style = JSON.parse(read('content/ui/style.json'))
  const named = read(`src/ui/kit/styles/${style.preset}.json`) + JSON.stringify(style.tweaks ?? {})
  const faces = [...read('src/ui/kit/fonts/fonts.css').matchAll(/font-family: '([^']+)'; src: url\('\.\/([\w-]+)\.woff2'\)/g)]
  return faces.filter(([, family]) => !named.includes(`'${family}'`)).map(([, , file]) => `**/assets/${file}-*.woff2`)
}

// The Words tab's online server + admin key (F70) — from .env.local, never sent to the browser (no VITE_ prefix).
const wordsEnv = loadEnv('development', import.meta.dirname, 'WORDS_')

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/glyphtender/' : '/',
  plugins: [
    react(),
    devkit(), // Dev Kit: release switch (content/devkit.json) + Save button (dev server only)
    words({ key: wordsEnv.WORDS_ADMIN_KEY, server: wordsEnv.WORDS_SERVER }), // Dev Kit Words tab (dev server only)
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Glyphtender',
        short_name: 'Glyphtender',
        description: 'A cozy hex-garden word game — the best speller doesn’t always win',
        theme_color: '#141a2e',
        background_color: '#141a2e',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Sound effects (sfx, ui, stg — ~360 KB) are precached so they work offline. Music and ambience (~3 MB) are NOT,
        // to keep the first load small: they're cached the first time they play (runtime, cache-first, below).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,csv,mp3}'],
        // Not cached either: the v0.1 code sketch (its own page, still online) and the unused style fonts (F66).
        globIgnores: ['**/audio/mus/**', '**/audio/amb/**', 'sketches/**', '**/assets/moveCast-*', ...unusedFontGlobs()],
        navigateFallback: 'index.html',
        runtimeCaching: [{
          urlPattern: /\/audio\/(mus|amb)\/.*\.mp3$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'glyphtender-music',
            expiration: { maxEntries: 12 },
            cacheableResponse: { statuses: [0, 200] },
            rangeRequests: true, // (for streaming music later — framework F28)
          },
        }],
      },
    }),
  ],
  build: {
    rollupOptions: {
      // Prototypes (code sketches) are extra pages: /glyphtender/sketches/<name>/
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        moveCast: resolve(import.meta.dirname, 'sketches/move-cast/index.html'),
      },
    },
  },
  test: {
    // Helpers' git worktrees live in .claude/worktrees — never run their copies of the tests
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
  server: {
    host: true, // expose on local network for phone testing
  },
})
