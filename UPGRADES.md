# Tempo Fly upgrades: effects folders + artist support links

The extension source isn't in this repo yet, so these are standalone ES modules
to wire into the existing popup / content script.

## 1. Themed effects (`src/effects/`)

- `catalog.js` holds the `EFFECT_FOLDERS` themes: Oops & Apologies, Crowd Hype,
  Reactions, Vibes and DJ Tools. `availableFolders()` returns only the effects
  that can actually play.
- `synth.js` provides `playSynth(id, audioCtx, destNode)`. The DJ Tools effects
  (air horn, dub siren, riser, rewind, laser, sub drop) are generated with Web
  Audio, so they need no audio files or licensing.
- Voice clips (the TikTok phrases) load from `assets/effects/<id>.mp3`. See
  `assets/effects/README.md` for how to get permission from creators.

Wiring:
- manifest: add `"assets/effects/*.mp3"` to `web_accessible_resources` for
  `https://music.youtube.com/*` if the clips play from the content script.
- popup: render each folder as a collapsible group, with one button per effect.
  For a `clip`, play `clipUrl(effect)` through the existing effects-volume gain
  node. For a `synth`, call `playSynth(effect.id, ctx, effectsGain)`.
- Replace the old effects list with this catalog.

## 2. Support the artist (`src/support/artistLinks.js`)

`supportLinks({ title, artists })` returns:
- one **Bandcamp artist search** link per credited artist, and
- track links in priority order: **Bandcamp** first, then the DJ download
  stores **Beatport**, **Juno Download** and **Qobuz**.

Free streaming platforms are left out on purpose.

Wiring:
- content script: read the artist names from the player bar's byline links
  (`ytmusic-player-bar .byline a`). Each artist is a separate `<a>`, which is
  more accurate than splitting the text. Send `{ title, artists }` to the
  popup with the track info that already goes there.
- popup: add a "Support the artist" section under the now-playing title. Make
  Bandcamp the prominent button and put the other stores in a smaller row.
  Open links with `target="_blank" rel="noopener"`.

Privacy: these are plain outbound links. Nothing is fetched and no new
permissions are needed, so the privacy policy stays accurate.

### Later (optional)
Resolve the exact Bandcamp artist page (not only a search) by fetching
`bandcamp.com/search` in the background. That needs a `https://bandcamp.com/*`
host permission and a privacy-policy update, because the extension would
then contact an external server.
