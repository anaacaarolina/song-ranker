/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID?: string
  readonly VITE_SPOTIFY_REDIRECT_URL?: string
  readonly VITE_SCOPES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
