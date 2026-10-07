# hovering.today

Your likes and playlists from **YouTube Music**, **Spotify** and **SoundCloud**, in one place.

`privacy.html` at the repo root is the privacy policy for the **Tempo Fly** extension and is unrelated to
hovering.today. It's left where it is so any existing link to it keeps working.

## Layout

| Path | What it is |
|---|---|
| `apps/web` | The hovering.today site. Static (Vite + TypeScript); reads libraries and stores everything in the browser (IndexedDB). |
| `packages/core` | Shared code: data model, title/artist normalization, cross-platform matcher. |
| `docs/ARCHITECTURE.md` | Why it's built this way, and what's next. |
| `docs/DEPLOY.md` | Cloudflare deploy and Google sign-in setup. |

## Develop

```sh
npm install
npm test            # unit tests (matcher, YouTube and Spotify importers)
npm run typecheck

cp apps/web/.env.example apps/web/.env.local   # add VITE_GOOGLE_CLIENT_ID for YouTube Music sign-in
npm run dev                                    # http://localhost:5173
```

## Deploy

Pushes to `main` deploy to https://hovering.today on Cloudflare; PRs get a preview URL. One-time setup
(domain, API token, GitHub secrets, Google client) is in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Platform status

| Platform | How | Status |
|---|---|---|
| YouTube Music | Sign in with Google, YouTube Data API v3 (read-only), from the browser | Read: liked music + playlists |
| Spotify | Upload of Spotify's own "Account data" export | Read: liked songs + playlists |
| SoundCloud | Official API, OAuth 2.1 + PKCE | Not started (needs an app registration) |
