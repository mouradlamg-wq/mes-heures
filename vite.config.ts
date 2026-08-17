/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// CLAUDE.md §8 : les tests tournent dans un fuseau volontairement différent de
// Europe/Paris, pour faire tomber toute fuite de fuseau navigateur dans le moteur.
// Posé ici plutôt que dans le script npm : c'est le seul point d'entrée commun à
// tous les OS, et Node applique le changement à chaud.
process.env['TZ'] = 'America/New_York'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        // Precache complet : l'app doit démarrer sans réseau, jamais de fetch runtime.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Mes Heures',
        short_name: 'Mes Heures',
        description:
          'Suivi des heures et vérification de fiche de paie. Fonctionne hors ligne, sans compte.',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#faf9f7',
        theme_color: '#ec3013',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
