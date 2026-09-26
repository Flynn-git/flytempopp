# Voice-clip effects

Put each clip here as `<id>.mp3`, using the `id` from `src/effects/catalog.js`
(e.g. `sorryyy.mp3`, `waheyy.mp3`). Clips without a file are hidden in the
popup, so the extension can ship with only some of them.

## Get permission before shipping a clip

These phrases are the creators' own voices. Ripping them from TikTok and
shipping them in a Web Store extension risks a takedown or removal of the
listing. It also works against Tempo Fly's aim of supporting artists.

For each clip:

1. DM the creator (e.g. @justbusyent, @gymskin) and ask to include the clip,
   credited, in a free extension.
2. Keep their written OK. Record it in the table below.
3. Keep the credit in `catalog.js`. The popup shows it on hover and links to
   their profile.

| id       | creator      | permission | date |
|----------|--------------|------------|------|
| sorryyy  | @justbusyent | pending    |      |
| waheyy   | @gymskin     | pending    |      |

Clip specs: mono MP3, 44.1 kHz, 128 kbps, trimmed tight, peak around -1 dBFS,
under 3 seconds.
