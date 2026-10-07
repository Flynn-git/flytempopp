# Architecture

## The constraint that shapes everything

Platform developer APIs don't scale to "anyone can use this":

- **Spotify** — apps in development mode need the owner to have Premium and are capped at **5 users**.
  Lifting the cap ("extended quota") is only open to registered businesses with **≥250k monthly active users**.
- **YouTube Music** — no library API. The YouTube Data API's default quota is 10,000 units/day **per project,
  shared by every user**; adding a playlist item costs 50, so ~200 additions a day for the whole service.
- **SoundCloud** — usable official API (OAuth 2.1 + PKCE), but registering an app needs an Artist Pro subscription.

So hovering.today doesn't route everyone through one developer app. Each user's library is read
**from their own browser, with their own session**, and nothing about it touches a shared quota.

## Pieces

```
hovering.today (apps/web)                       connector extension (apps/connector)
├─ UI, library view, filters                    ├─ ytm adapter → music.youtube.com tab
├─ matcher (packages/core)                      └─ (spotify session adapter: later)
├─ IndexedDB storage
├─ Spotify export import
├─ SoundCloud OAuth (next)
└─ chrome.runtime.sendMessage(CONNECTOR_ID, …) ──► onMessageExternal
                    ◄──────────── BridgeResponse ──┘
```

- **The site is the product.** All UI, storage and matching live there, so most changes ship by deploying
  the site, without a Web Store review.
- **The extension is a thin fetcher.** It answers five messages (`hello`, `status`, `connect`,
  `listCollections`, `listTracks`, see `packages/core/src/protocol.ts`), validates every payload, and only
  accepts messages from hovering.today origins (`externally_connectable` + an origin check).
- **Permissions are per platform and optional.** Host access to e.g. `music.youtube.com` is requested
  from the extension's own `connect.html` page when the user clicks Connect on the site (Chrome only
  shows permission prompts from extension pages).
- **The YouTube Music adapter** runs `youtubei/v1/browse` inside a music.youtube.com tab (reusing an open one,
  or opening a background tab it closes when idle), signed the same way the site signs its own requests.
  Response parsing (`ytm-parse.ts`) walks the JSON for known renderer objects, not fixed paths, so small
  layout changes don't break it. When YouTube Music changes, that file is where to fix it.

## Matching (`packages/core/src/match.ts`)

1. Same ISRC → certain.
2. Same normalized title + overlapping artist, durations within 3 s → confident.
3. Bigram similarity ≥ 0.82 → probable (shown with a "?" in the UI).

Normalization strips upload decoration (`(Official Video)`, `[Free DL]`, `- 2011 Remaster`, `feat. …`,
`Artist - ` prefixes, `VEVO`/`- Topic` channel names). Version words (remix, live, edit, acoustic, …)
must agree, so a remix never merges with the original. A group never holds two tracks from the same platform.

## Risks

- **Internal endpoints change without notice.** Keep adapters thin and parsing in one place per platform.
- **Terms of service.** Reading your own library via your own session is a grey area under platform terms.
  Keep it user-initiated, sequential and rate-limited (the YTM adapter waits between pages). Be more
  conservative with writes (copying playlists) than with reads.
- **Chrome Web Store review.** Reviewers look closely at host permissions; the narrow, optional,
  per-platform requests and the privacy page (`apps/web/public/privacy.html`) are there for that.

## Next steps

1. **Deploy the site.** Cloudflare Workers + static assets, via GitHub Actions; see `DEPLOY.md`.
2. **Publish the connector** to the Chrome Web Store (unlisted is fine to start). Set its ID as the
   `CONNECTOR_ID` repo variable so production builds can find it.
3. **SoundCloud.** Register an app, then add OAuth 2.1 + PKCE on the site. The token exchange needs the
   client secret, so add it as a small route on the same Cloudflare Worker (`main` in `wrangler.jsonc`,
   secret via `wrangler secret put`).
4. **Spotify live sync.** Either a session adapter in the connector (like YTM), or "bring your own client
   ID" for power users. The export import works for everyone meanwhile.
5. **Writes.** "Copy this playlist to platform X": search on the target platform + the matcher + an
   add-to-playlist call, with a review step before anything is written.
6. **Accounts and sync** (optional). Only then does hovering.today need a backend. Keep platform sessions
   in the browser, and consider a shared, anonymous match cache (platform track ID → canonical track) so
   every confirmed match helps everyone.
