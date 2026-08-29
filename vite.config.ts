import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import previewMiddleware from './vite-plugin-preview.ts'

// https://vite.dev/config/
// Bound to 127.0.0.1:8000 because Spotify only allows loopback IP redirect URIs
// (localhost and non-loopback hosts are rejected). Must match VITE_SPOTIFY_REDIRECT_URL.
export default defineConfig({
  plugins: [react(), previewMiddleware()],
  server: {
    host: '127.0.0.1',
    port: 8000,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 8000,
    strictPort: true,
  },
})
