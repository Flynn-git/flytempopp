# Tempo Fly v1.1: files to merge

This folder holds the changed files for v1.1. It doesn't contain `manifest.json`,
the tempo content script, `background.js`, `offscreen.html` or `effects.js`
(they weren't uploaded to the repo). Those stay as they are.

## Steps

1. Copy these files over your local extension folder:
   - `popup.html`, `popup.js`: modified
   - `audiofx.js`, `support.js`: new
   - `offscreen.js`, `icons/`: unchanged, included for reference

2. In `manifest.json`, add `audiofx.js` to the existing YouTube Music content
   script and bump the version:

   ```json
   "version": "1.1.0",
   "content_scripts": [
     {
       "matches": ["https://music.youtube.com/*"],
       "js": ["<your existing content script>.js", "audiofx.js"]
     }
   ]
   ```

   No new permissions are needed.

3. Reload the unpacked extension in `chrome://extensions`, reload the YouTube
   Music tab, and check:
   - Reverb, Echo, Flanger, Phaser and Filter change the sound, and "All off"
     restores it.
   - Tempo, preserve-pitch and BPM detection still work with an effect on.
   - The "Support the artist" links appear under the track name.

4. Zip the folder and upload it in the developer console. Then follow the
   checklist in `../STORE_LISTING.md`.

## Notes

- **One-time click:** Chrome only allows audio processing on a page after
  the user has clicked on it. If an effect fails, the popup says "Click
  anywhere on the YouTube Music page, then try again."
- **Routing is one-way:** once an effect has been used, the player's audio
  flows through the effects chain until the tab is reloaded. With everything
  off, the chain passes the audio through unchanged.
- **Artist names come from the byline text.** Names are split on commas and
  "feat." only, so "Chase & Status" stays one artist, but "Irah & Flowdan"
  also stays as one. For exact names, the content script could send
  `artists: [...]`, one per link in the player bar's byline.
- **Message handler:** if the existing content script's `onMessage` handler
  replies to every message type, not only its own, it may answer the
  `ytm-fx-*` messages before `audiofx.js` does. Make sure it ignores types it
  doesn't handle.
