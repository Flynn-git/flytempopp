/**
 * Text normalization for cross-platform matching.
 *
 * The same recording is titled differently everywhere:
 *   Spotify:  "Midnight City"            by "M83"
 *   YTM:      "M83 - Midnight City (Official Video)" by "M83VEVO"
 *   SC:       "Midnight City [Free DL]"  by "m83"
 * These helpers strip the decoration so the matcher compares like with like.
 */

/** Bracketed suffixes that describe the upload, not the recording. */
const NOISE_TAGS =
  /\s*[([](?:official(?:\s+(?:music|lyric|audio|hd))?\s*(?:video|audio|visualizer)?|lyrics?(?:\s+video)?|audio|visuali[sz]er|hd|hq|4k|free\s+(?:dl|download)|explicit|clean|out\s+now|premiere)[)\]]/gi;

/** "feat. X", "ft. X", "featuring X", with or without brackets. */
const FEATURING = /\s*[([]?\s*\b(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?/gi;

/** "- Remastered 2011", "- 2011 Remaster", "(Remastered)", "- Radio Edit" kept; remasters dropped. */
const REMASTER = /\s*(?:-\s*|[([])\s*(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?\s*[)\]]?/gi;

const VERSION_WORDS = ['remix', 'mix', 'edit', 'live', 'acoustic', 'instrumental', 'cover', 'bootleg', 'flip', 'vip', 'rework', 'sped up', 'slowed'];

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Artist channel names: "M83VEVO", "M83 - Topic", "M83 Official". */
export function cleanArtist(name: string): string {
  return name
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .replace(/\s+official$/i, '')
    .trim();
}

export function normalizeArtist(name: string): string {
  return fold(cleanArtist(name)).replace(/^the /, '');
}

/**
 * Normalize a title. If the title embeds "Artist - Title" (common on YouTube
 * and SoundCloud) and the prefix matches one of the given artists, drop it.
 */
export function normalizeTitle(title: string, artists: string[] = []): string {
  let t = title.replace(NOISE_TAGS, '').replace(REMASTER, '').replace(FEATURING, '');
  const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) {
    const prefix = normalizeArtist(dash[1]!);
    const known = artists.map(normalizeArtist);
    if (known.some((a) => a && (prefix === a || prefix.includes(a) || a.includes(prefix)))) t = dash[2]!;
  }
  return fold(t);
}

/**
 * Words that mark a different *version* of a song. "Song" and "Song (Remix)"
 * must not be merged, so the matcher requires these to agree.
 */
export function versionTags(title: string): string[] {
  const f = fold(title);
  return VERSION_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(f)).sort();
}
