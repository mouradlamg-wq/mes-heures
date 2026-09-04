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
  // Relatif plutôt que `/` : l'app est servie tantôt à la racine (`pnpm
  // preview`, installation par USB, cf. README), tantôt depuis le sous-chemin
  // d'un projet GitHub Pages (`/mes-heures/`). Sans routeur ni lien profond
  // (App.tsx — navigation par état, pas par URL), un chemin relatif fonctionne
  // dans les deux cas sans configuration séparée par cible.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        // Precache complet : l'app doit démarrer sans réseau, jamais de fetch runtime.
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Mes Heures',
        short_name: 'Mes Heures',
        description:
          'Suivi des heures et vérification de fiche de paie. Fonctionne hors ligne, sans compte.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        // Écran de démarrage : le fond de l'app en clair, pas la couleur de marque.
        background_color: '#f2efec',
        theme_color: '#f2efec',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Carré plein bord à bord : Android y découpe la forme de son choix.
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
  build: {
    rolldownOptions: {
      output: {
        // Luxon et Dexie changent bien moins souvent que l'app : les isoler
        // évite de refaire télécharger 300 ko à chaque mise à jour, ce qui
        // compte quand la mise à jour se fait sur le parking, en 4G.
        manualChunks: (id: string) => {
          if (id.includes('node_modules/luxon')) {
            return 'luxon'
          }
          if (id.includes('node_modules/dexie')) {
            return 'dexie'
          }
          return undefined
        },
      },
    },
  },

  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
