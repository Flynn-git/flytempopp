# Architecture

## The constraint that shapes everything

Platform APIs limit how many people one app can serve:

- **Spotify**: apps in development mode need the owner to have Premium and are capped at **5 users**.
  Lifting the cap ("extended quota") is only open to registered businesses with **≥250k monthly active users**.
  So hovering.today imports Spotify's own data export instead.
- **YouTube**: the official YouTube Data API v3 reads a signed-in user's likes and playlists. Reads are cheap
  (1 quota unit per 50 items; a 5,000-song library is ~100 of the default 10,000 units/day per project), and
  quota increases are free to request. Writes (adding to a playlist) cost 50 units each, so copying playlists
  into YouTube will need a quota increase.
- **SoundCloud**: usable official API (OAuth 2.1 + PKCE), but registering an app needs an Artist Pro subscription.

## Pieces

```
hovering.today (apps/web, static on Cloudflare)
├─ UI: platform cards, unified library, "not on X" filter
├─ importers/youtube.ts ── Google Identity Services token (read-only, in memory)
│                         └─► googleapis.com/youtube/v3  (videos?myRating=like, playlists, playlistItems)
├─ importers/spotify-export.ts ── user-uploaded zip, parsed in the browser
├─ matcher (packages/core)
└─ IndexedDB storage
```

Everything runs in the visitor's browser. There's no backend and no stored credentials: the Google access token
lives in memory for one sync and expires within the hour.

**YouTube Music specifics.** YouTube Music likes and playlists are ordinary YouTube likes and playlists.
`videos.list?myRating=like` returns liked videos; only YouTube category 10 (Music) is kept, so non-music likes
are skipped. Playlists with no music in them are skipped too. Songs from YouTube Music's catalogue come from
"Artist - Topic" channels with clean titles; other uploads are usually "Artist - Song (Official Video)" and get
split and cleaned.

An earlier version used a Chrome extension that read music.youtube.com's internal API with the user's session.
It was dropped because it needed an install, didn't work on phones, and relied on unofficial endpoints. It's in
git history if it's ever needed (e.g. for Spotify live sync).

## Matching (`packages/core/src/match.ts`)

1. Same ISRC → certain.
2. Same normalized title + overlapping artist, durations within 3 s → confident.
3. Bigram similarity ≥ 0.82 → probable (shown with a "?" in the UI).

Normalization strips upload decoration (`(Official Video)`, `[Free DL]`, `- 2011 Remaster`, `feat. …`,
`Artist - ` prefixes, `VEVO`/`- Topic` channel names). Version words (remix, live, edit, acoustic, …)
must agree, so a remix never merges with the original. A group never holds two tracks from the same platform.

## Google verification

`youtube.readonly` is a *sensitive* scope. Until the OAuth app is verified, sign-in shows an "unverified app"
warning and is limited to test users (100 accounts in total). Verification is free: it needs the homepage,
privacy policy (`apps/web/public/privacy.html`, which includes the Limited Use statement), domain ownership in
Google Search Console, and a short video of the sign-in flow.

## Next steps

1. **Google verification**, to open YouTube Music sign-in to everyone.
2. **SoundCloud.** Register an app, then OAuth 2.1 + PKCE. The token exchange needs the client secret, so add
   it as a small route on the same Cloudflare Worker (`main` in `wrangler.jsonc`, secret via `wrangler secret put`).
3. **Copy playlists between platforms**: search on the target platform + the matcher + an add-to-playlist call,
   with a review step before anything is written.
4. **Accounts and sync** (optional). Only then does hovering.today need a backend. Consider a shared, anonymous
   match cache (platform track ID → canonical track) so every confirmed match helps everyone.
