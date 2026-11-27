import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: [],
    manifest: {
      name: 'Horus Leaders', short_name: 'Horus', description: 'مجموعة حورس البحرية – قطاع إعداد قادة',
      theme_color: '#101d35', background_color: '#f5f7fb', display: 'standalone',
      start_url: '/', lang: 'ar', dir: 'rtl',
      icons: [
        { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }
      ]
    }
  })]
})
