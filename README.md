# hovering.today

Your likes and playlists from **YouTube Music**, **Spotify** and **SoundCloud**, in one place.

`privacy.html` at the repo root is the privacy policy for the **Tempo Fly** extension and is unrelated to
hovering.today. It's left where it is so any existing link to it keeps working.

## Layout

| Path | What it is |
|---|---|
| `apps/web` | The hovering.today site. Static (Vite + TypeScript), stores everything in the browser (IndexedDB). |
| `apps/connector` | The companion Chrome extension. Reads a platform library using the user's own signed-in session and hands it to the site. |
| `packages/core` | Shared code: data model, site↔extension message protocol, title/artist normalization, cross-platform matcher. |
| `docs/ARCHITECTURE.md` | Why it's built this way, and what's next. |
| `docs/DEPLOY.md` | Cloudflare deploy: what runs when, and the one-time setup. |

## Develop

```sh
npm install
npm test                                   # unit tests (core, connector parsers, Spotify importer)
npm run typecheck

# 1. Build the connector in dev mode (also lets http://localhost:5173 talk to it)
npm run build -w @hovering/connector -- --dev
#    chrome://extensions → Developer mode → Load unpacked → apps/connector/dist
#    Copy the extension's ID.

# 2. Run the site against it
cp apps/web/.env.example apps/web/.env.local   # paste the ID into VITE_CONNECTOR_ID
npm run dev                                    # http://localhost:5173
```

Production builds: `npm run build` writes `apps/web/dist` (the site) and `apps/connector/dist` (zip it
for the Chrome Web Store). The production connector only accepts messages
from `https://hovering.today` and `https://www.hovering.today` (`apps/connector/origins.json`).

## Deploy

Pushes to `main` deploy to https://hovering.today on Cloudflare; PRs get a preview URL. One-time setup
(domain, API token, GitHub secrets) is in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Platform status

| Platform | How | Status |
|---|---|---|
| YouTube Music | Connector, using the music.youtube.com session | Read: likes + library playlists |
| Spotify | Upload of Spotify's own "Account data" export | Read: liked songs + playlists |
| SoundCloud | Official API, OAuth 2.1 + PKCE, from the site | Not started (needs an app registration) |
