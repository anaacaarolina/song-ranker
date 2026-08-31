# Song Ranker

Rank your Spotify playlist by pitting songs against each other in head-to-head **duels**. Click the song you like more, repeat, and get a mathematically perfect ranking at the end — plus the option to **save that ranking back to Spotify**.

Built with React + Vite + TypeScript. Runs 100% locally in your browser (plus a tiny dev-server middleware for audio previews).

---

## Features

- **Duel-based ranking** — songs are compared two at a time (Song A vs Song B). The app runs an *interactive merge sort* behind the scenes, so you only make ~`n·⌈log₂n⌉` comparisons and the final order is **exactly** consistent with every choice you made (not a heuristic).
- **Preview clips** — listen to a 30-second snippet before voting. Uses Spotify's official `preview_url` when present, and falls back to a server-side scraper (`spotify-preview-finder`) for tracks whose previews Spotify no longer exposes via the API.
- **Progress + undo** — a progress bar shows how many duels remain, you can undo the last choice, and you can flip a coin when you genuinely can't decide.
- **Session persistence** — refresh the page mid-ranking and it resumes exactly where you left off.
- **Battle history** — a full log of every duel with its winner, exportable as **CSV** and **JSON**.
- **Save to Spotify** — reorder the real playlist to match your ranking (one atomic replace for ≤100 tracks).
- **Keyboard friendly** — `←`/`→` (or `1`/`2`) to pick, `T` for tie, `U` to undo.

---

## How ranking works

The app converts **merge sort** into an interactive, click-driven state machine:

1. Every song starts as its own sorted "run": `[[SongA], [SongB], [SongC], ...]`.
2. The two front runs are picked up and merged **one comparison at a time** — each click moves the chosen head into the merged result.
3. When one run empties, the rest of the other run is appended and the completed run goes to the back of the queue.
4. When only one run remains, it *is* the full ranking.

Because songs only ever merge into bigger runs and are never split apart again, **no two songs are ever compared twice** in a single ranking session.

---

## Prerequisites

- **Node.js** ≥ 20.19 or ≥ 22.12 (for Vite 8)
- A **Spotify account** (free works; some features need Premium — see [Audio previews](#-audio-previews))
- A Spotify Developer App (created below — takes ~2 minutes)

---

## Getting started

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create App**, give it a name (e.g. *Song Ranker*) and description.
3. Add the **Redirect URI**:
   ```
   http://127.0.0.1:8000/callback
   ```
   > Spotify **rejects** `http://localhost:...`. It only allows HTTPS URLs or loopback IPs (`127.0.0.1` / `[::1]`) **with a port**.
4. In **User Management**, add your own account as a test user (required while the app is in Development Mode).
5. Copy the **Client ID** (and the **Client Secret** from *Settings*).

### 2. Configure environment

```bash
cd song-ranker
cp .env.example .env
```

Then edit `.env`:

| Variable | Where to find it | Purpose |
|---|---|---|
| `VITE_SPOTIFY_CLIENT_ID` | Dashboard → app → Client ID | Browser-side PKCE auth |
| `VITE_SPOTIFY_REDIRECT_URL` | Must match what you registered | OAuth redirect |
| `VITE_SCOPES` | — | Permissions requested at login |
| `SPOTIFY_CLIENT_ID` | Same Client ID | **Server-side only** (preview scraper) |
| `SPOTIFY_CLIENT_SECRET` | Dashboard → app → Settings | **Server-side only** (preview scraper) |

> The `SPOTIFY_CLIENT_SECRET` is used exclusively by the local Node middleware and is **never** shipped to the browser. `.env` is git-ignored.

### 3. Install & run

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:8000** (not `localhost`), click **Connect to Spotify**, approve the permissions, paste a playlist link, and start dueling!

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server on `http://127.0.0.1:8000` |
| `npm run build` | Type-check + build for production (`dist/`) |
| `npm run preview` | Serve the production build locally (also on port 8000) |
| `npm test` | Run the unit tests (ranking engine, parser) |
| `npm run lint` | Run ESLint |

---

## Project structure

```
song-ranker/
├── vite.config.ts            # Vite config + registers the preview middleware plugin
├── vite-plugin-preview.ts    # Dev-server middleware → /api/preview (runs spotify-preview-finder)
└── src/
    ├── App.tsx               # Auth gate, view routing (/ → /duels → /results), session wiring
    ├── types.ts              # Track, PlaylistMeta, User
    ├── lib/
    │   ├── auth.ts           # Spotify PKCE flow + silent token refresh
    │   ├── spotify.ts        # Spotify API client (playlists, tracks, write-back, preview backfill)
    │   ├── ranking.ts        # Pure reducer: interactive merge sort, battle log, undo
    │   ├── persist.ts        # localStorage (auth, session, preview cache)
    │   └── parsePlaylistInput.ts
    ├── hooks/
    │   └── useRankingSession.ts  # Bridges the ranking reducer to React
    └── components/
        ├── LoginView.tsx     # "Connect to Spotify"
        ├── SetupView.tsx     # Paste playlist link
        ├── DuelView.tsx      # Two song cards + progress + audio
        ├── SongCard.tsx      # Cover, name, artist, preview button
        └── ResultsView.tsx   # Ranking, win tallies, battle history + exports
```

---

## Authentication

The app uses Spotify's **Authorization Code with PKCE** flow — the only browser flow Spotify still supports (the old *Implicit Grant* flow was removed). It's fully client-side, needs no backend for auth, and supports **silent token refresh** (tokens last 1 hour).

**Scopes requested:** `playlist-read-private`, `playlist-modify-public`, `playlist-modify-private` (the modify scopes enable "Save ranking to Spotify").

> Note: if you connect before approving a scope change, re-sign in (Sign out → Connect) to re-request permissions.

---

## Audio previews

Previews are filled in **three layers**, in order of cost:

1. **Official API** — `preview_url` from the playlist/track endpoints (Spotify has deprecated this field; it's often `null`).
2. **Per-track lookups** — `GET /tracks/{id}` sometimes returns a preview the playlist endpoint didn't.
3. **Server-side scraper** — for anything still missing, the app calls `/api/preview` (a local Vite middleware that uses [`spotify-preview-finder`](https://www.npmjs.com/package/spotify-preview-finder) to scrape `p.scdn.co` links from the track's public page). Results are cached in localStorage so repeat loads are instant.

Songs with no preview anywhere show a disabled **No preview** button. The setup screen reports how many songs ended up without one.

---

## Known limitations

- **Playlist access** — Spotify now only lets apps read playlists you **own or collaborate on**. Public playlists you don't own will return `403 Forbidden`.
- **Save to Spotify replaces the playlist** — the write-back uses the atomic *replace* operation, which rewrites the entire playlist order and **removes duplicate tracks** (the app asks for confirmation first).
- **Local files & podcast episodes** are filtered out before ranking (they can't be re-added via the API).
- **Web Playback SDK** — playing *full* songs (not just 30s previews) requires a Spotify Premium account and the Web Playback SDK, which the app currently doesn't use.

---

## Testing

```bash
npm test
```

The test suite covers the ranking engine (exactness vs. a reference sort on random inputs, undo correctness, battle log) and the playlist-input parser.

---

## License

MIT
