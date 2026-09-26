# Tempo Fly — Chrome Web Store listing copy

Paste-ready text for the developer console, rewritten after the first-submission rejection ("Red Potassium — Inaccurate Description / Irrelevant info").

**What went wrong last time:** the reviewer wrote "the screenshot media is not enough to understand the functionality." Nothing to fix in the code — the extension itself passed. The rejection is entirely about how the listing communicates what the extension does. Everything below is designed to make the mapping between screenshots ↔ description ↔ actual behaviour unmistakable.

**No code changes required.** You do not need to re-zip. Just update the listing metadata and screenshots in the dev console and resubmit.

---

## Name (max 75 chars)

```
Tempo Fly — Speed, Pitch, BPM & Key Tools for YouTube Music
```
(58 chars)

## Short description (max 132 chars)

```
Change the tempo and pitch of YouTube Music tracks in semitones. Detect BPM and key. Play sound effects over playback.
```
(120 chars — direct, verbs-forward, one clause per feature)

## Category

**Productivity** (primary). Do not pick Entertainment — Productivity is easier to defend when a reviewer questions single-purpose.

## Language

English

---

## Detailed description

Paste this verbatim. It's structured feature-by-feature with concrete verbs, matches the UI element names shown in the screenshots, and avoids the "turntable" style metaphor that likely confused the previous reviewer.

```
Tempo Fly is a playback controller for YouTube Music. It adds a browser-toolbar popup that adjusts the tempo, pitch, and effects of the track currently playing on music.youtube.com.

WHAT IT DOES

1) Change tempo and pitch in semitones
Open the popup while a track is playing on music.youtube.com. A slider — snapped to whole semitones — lets you shift the playback rate between 0.25× (−2 octaves) and 2× (+1 octave). Preset buttons jump by ±1 semitone or ±1 octave. A "Preserve pitch" checkbox is on by default so tempo changes do not alter pitch (useful for practising or slowing songs down without the pitch dropping). Turn it off to transpose the actual pitch along with the tempo.

2) Detect the BPM and musical key
Click "Detect BPM & key" in the popup. Tempo Fly captures about 12 seconds of the current track's audio and analyses it locally in your browser using the Web Audio API. It then shows the original tempo in beats-per-minute and the estimated musical key (for example "F# min" or "C maj"). If you have already changed the tempo, it also shows the adjusted BPM and key that your current setting will produce.

3) Play sound effects over the music
Six built-in synthesized effects can be triggered on top of the music from a grid of buttons in the popup: Air horn, Siren, Vuvuzela, Bass boom, Riser, and DJ scratch. Each is generated on demand using the Web Audio API — no audio files are shipped. A volume slider in the panel header adjusts effect loudness independently of the music.

HOW TO USE IT

- Open music.youtube.com in a tab and start playing any track.
- Click the Tempo Fly icon in the Chrome toolbar.
- Drag the tempo slider or press a preset button to change tempo/pitch — playback updates instantly.
- Click "Detect BPM & key" to see the current track's tempo and key. First use only, Chrome will ask permission for audio capture; grant it once and it stays granted.
- Click any effect button to play a sound over the music. Adjust the "vol" slider in the effects panel to taste.

PRIVACY

Tempo Fly runs entirely inside your browser. It makes no network requests. Audio captured during BPM/key detection is analysed locally in a Web Audio pipeline and immediately released — never uploaded, saved, or shared. No analytics, no tracking, no accounts, no third-party services. See the linked privacy policy for full details.

PERMISSIONS

Granted at install:
- storage: saves your preferences (tempo offset, pitch toggle, effects volume, last detection) on your device using chrome.storage.local.
- Host access to https://music.youtube.com only: the extension operates on this one origin and nothing else.

Requested only if you click "Detect BPM & key":
- tabCapture: a single ~12-second audio sample of the current YouTube Music tab, for local BPM/key analysis. Released the moment analysis completes.
- offscreen: hosts the analysis pipeline in an offscreen document, off the service worker thread.

You can revoke the optional permissions at any time from Chrome's extension settings without uninstalling. Tempo, pitch, and effects will keep working; only detection will pause until you re-grant them.

DISCLAIMER

Tempo Fly is an independent, third-party extension. It is not affiliated with, endorsed by, or sponsored by YouTube, YouTube Music, Google, or Alphabet.
```

---

## Single purpose statement

Paste this in the "Single Purpose" field of the dev console. Ties every feature back to playback control — this heads off any reviewer question about whether the effects are unrelated.

```
Tempo Fly's single purpose is to give the user local control over YouTube Music playback: adjusting tempo, adjusting pitch, showing the tempo and key of the current track, and layering short user-triggered sound effects over playback.
```

---

## Permission justifications

Paste one-by-one into the privacy practices form.

**Required (granted at install):**

- **`storage`** — "Stores user preferences (tempo offset in semitones, pitch-preservation toggle, effects volume) and the most recent local detection result. Uses chrome.storage.local — data stays on the user's device."

- **Host permission `https://music.youtube.com/*`** — "Tempo Fly only operates on YouTube Music. The content script that applies tempo/pitch settings is restricted to this origin. This is also how the popup finds the active YouTube Music tab to message — no broader `tabs` or `activeTab` permission is needed."

**Optional (requested only when the user clicks Detect BPM & key):**

- **`tabCapture`** — "Captures audio from the active YouTube Music tab for a single ~12-second window when the user explicitly clicks 'Detect BPM & key'. The captured audio is analyzed locally in the browser using the Web Audio API and never transmitted or stored. The capture stream is released as soon as detection completes. Users who never use detection are never prompted for this permission."

- **`offscreen`** — "Used together with tabCapture to host the audio analysis pipeline in an offscreen document, off the extension service worker. The offscreen document is created on demand and closed when analysis ends."

---

## Screenshots — the part the reviewer flagged

**Root cause of the previous rejection.** The reviewer could not tell from the screenshots what the extension actually does. Five screenshots, each showing the popup **on top of a real, playing YouTube Music tab**, each with a **clear text overlay** naming the feature demonstrated. That is what will pass.

Format: PNG, 1280×800 exactly. All five below.

### Screenshot 1 — Hero / overview

**On screen:**
- A YouTube Music tab playing a track. Player bar at the bottom clearly visible showing title + artist + progress. Any generic recognisable track is fine (avoid explicit content or anything visually controversial).
- Tempo Fly popup open in the top-right, in default state: tempo shows `1.00×`, `0 st · 0 oct`, "Preserve pitch" checkbox ticked.

**Text overlay (top of image, large):**
```
Tempo Fly — Playback control for YouTube Music
```
**Sub-caption (smaller, under it):**
```
Adjust tempo & pitch • Detect BPM & key • Add effects
```

### Screenshot 2 — Tempo control

**On screen:**
- Same YT Music tab, still playing (or a different track).
- Popup with slider dragged to `−12` — should display `0.50× | −12 st · −1 oct`.
- "Preserve pitch" still ticked.

**Text overlay:**
```
Slow down or speed up in musical intervals
```
**Sub-caption:**
```
Slider snaps to whole semitones. Presets jump ±1 st or ±1 octave.
```
**Arrow annotations** (use Preview's Markup arrows):
- One arrow from the caption to the tempo slider
- One arrow to the `−1 oct` preset button

### Screenshot 3 — BPM & key detection

**On screen:**
- YT Music tab playing a track with a recognisable name shown (so the reviewer can see title/artist detection working).
- Popup with the Track Analysis panel populated: BPM value visible (e.g. `128 → 128.0`), Key value visible (e.g. `A min → A min`), and the detected track title/artist filled in above the stats.

**Text overlay:**
```
Detect the BPM and key of the current track — locally
```
**Sub-caption:**
```
~12 seconds of audio, analysed inside your browser. Nothing uploaded.
```

### Screenshot 4 — Effects panel

**On screen:**
- YT Music playing.
- Popup scrolled/framed so the "Effects" panel is prominent, showing the 2×3 grid of six buttons (Air horn, Siren, Vuvuzela, Bass boom, Riser, Scratch).
- If possible, one button captured in its active/pressed state (blue background).

**Text overlay:**
```
Play sound effects over the music
```
**Sub-caption:**
```
Air horn, Siren, Vuvuzela, Bass boom, Riser, Scratch — with volume control.
```

### Screenshot 5 — Pitch preservation

**On screen:**
- YT Music playing.
- Popup with tempo set to `−12 st` and "Preserve pitch" **unchecked**. The Track Analysis panel visible showing that the adjusted Key is different from the original (e.g. `A min → A min` becomes `A min → A min` when unchecked at −12 st, one octave lower — still same key name, but you can pick a non-octave offset like `−5 st` to show `A min → E min` which reads more clearly).

Suggested state for this screenshot: tempo `−5 st`, pitch preservation **off**, showing the key shifting.

**Text overlay:**
```
Optional pitch transposition
```
**Sub-caption:**
```
Keep pitch while changing tempo — or turn it off to shift the actual pitch too.
```

---

## How to actually capture these on macOS

1. Open a new Chrome window at exactly 1280×800. Easy way:
   - Bring Chrome to the front
   - Open DevTools (⌘⌥I), then close it — this ensures the window chrome is standard
   - Run this in Terminal to size it precisely:
     ```
     osascript -e 'tell application "Google Chrome" to set bounds of front window to {100, 100, 1380, 900}'
     ```
2. Navigate to music.youtube.com and start playing a track.
3. Click the Tempo Fly icon to open the popup.
4. Set the popup state per the screenshot brief above.
5. Screenshot the whole window: `Cmd-Shift-4`, then Space, then click the Chrome window. This captures the window area only, without desktop clutter.
6. The output PNG lands on your Desktop. Open it in Preview.app.
7. In Preview, `Cmd-Shift-A` opens the Markup toolbar. Use:
   - **T** for text — place the title overlay at the top, use the largest system font at 32–36pt bold
   - **T** again for the sub-caption at 18–20pt
   - Arrow tool for annotations
8. Verify the image is exactly 1280×800: Tools → Adjust Size. If it's not, crop to 1280×800 (the standard aspect ratio is the same; you can crop the outside padding).
9. Save as PNG. Name them `01-overview.png` through `05-pitch.png`.

**Tips that meaningfully increase pass rate:**
- Text overlays must be large enough to read at thumbnail size in the store listing. If you can't read them at 25% zoom in Preview, they're too small.
- Use the same title-overlay position and font on all five, so the set reads as a coherent product tour.
- Do not screenshot in dark mode with a dark browser theme — the reviewer needs to see UI clearly, and mixed dark backgrounds cause thumbnails to look muddy.
- Do not include personal data (bookmarks bar with personal sites, other tabs with private titles, notifications, personal library titles). Use a clean profile if needed.
- Do not use a logged-in avatar in the top-right of YT Music if it's identifiably you.

---

## Promo tile (optional, recommended)

Size: **440×280**. This shows in store carousels. Simple is fine:
- Solid or subtle-gradient blue background matching the extension palette (`#0f172a` background, `#3b82f6` accent)
- "Tempo Fly" wordmark centered, big and bold
- Small tagline: "Playback control for YouTube Music"
- Icon in a corner

You can build this in any tool. Figma, Canva, Preview shape tools, or Keynote all work. Export as PNG.

---

## Resubmission checklist

- [ ] Update the store listing name to the new title above
- [ ] Update the short description
- [ ] Replace the long description with the new feature-by-feature version
- [ ] Update the single purpose statement
- [ ] Update permission justifications
- [ ] Capture and upload the five new screenshots per the brief above
- [ ] (Optional) Upload a promo tile
- [ ] Verify your privacy policy URL loads with real contact info (already updated in `privacy.html`)
- [ ] Click **Submit for review**

No new zip upload is needed unless you also want to bump the version. If you do zip a new package (e.g., because you tweaked anything), bump `manifest.json` version to `1.0.1` first.
