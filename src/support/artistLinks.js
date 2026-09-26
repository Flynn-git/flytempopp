// "Support the artist" links for the track that's playing.
//
// Goal: send listeners to the places where their money reaches the artist —
// Bandcamp first, then paid download stores DJs actually buy from. Streaming
// platforms (Spotify, Apple Music, YouTube, SoundCloud, etc.) are deliberately
// excluded.
//
// These are plain outbound links built from the title/artist already read from
// the YouTube Music page. Nothing is fetched, so the privacy policy's
// "does not contact any external server" stays true, and no new permissions
// are needed.

const q = encodeURIComponent;

// Fallback for when only the byline text is available. Prefer passing the
// artist names directly: YTM renders each artist in the player bar as its own
// <a> link, which is exact. Splits on commas and "feat."/"ft." only — never on
// "&" or "x", which would break names like "Chase & Status".
// Drops the "• Album • 2024" tail YTM appends.
export function splitArtists(byline) {
  if (!byline) return [];
  const main = byline.split("•")[0];
  return [
    ...new Set(
      main
        .split(/\s*(?:,|\bfeat\.|\bft\.|\bfeaturing\b)\s*/i)
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ];
}

// Removes decorations YTM/YouTube titles carry that hurt store searches.
export function cleanTitle(title) {
  return (title || "")
    .replace(/\s*[([](?:official|lyric|audio|video|visuali[sz]er|hd|4k|explicit)[^)\]]*[)\]]/gi, "")
    .replace(/\s*[([](?:feat|ft)\.?[^)\]]*[)\]]/gi, "")
    .trim();
}

// Links for one artist, in priority order.
export function artistLinks(artist) {
  return [
    {
      store: "Bandcamp",
      primary: true,
      label: `${artist} on Bandcamp`,
      url: `https://bandcamp.com/search?q=${q(artist)}&item_type=b`,
    },
  ];
}

// Links for the track itself, in priority order. Bandcamp first, then DJ
// download stores (sales pay the label/artist per copy).
export function trackLinks(title, artists) {
  // Lead artist + title searches better than the full credit list.
  const query = `${artists[0] || ""} ${cleanTitle(title)}`.trim();
  return [
    { store: "Bandcamp", primary: true, url: `https://bandcamp.com/search?q=${q(query)}&item_type=t` },
    { store: "Beatport", url: `https://www.beatport.com/search?q=${q(query)}` },
    { store: "Juno Download", url: `https://www.junodownload.com/search/?q%5Ball%5D%5B%5D=${q(query)}` },
    { store: "Qobuz", url: `https://www.qobuz.com/gb-en/search?q=${q(query)}` },
  ];
}

// `artists`: array of names (preferred). `artist`: raw byline text (fallback).
export function supportLinks({ title, artists, artist }) {
  artists = artists?.length ? artists : splitArtists(artist);
  return {
    artists: artists.map((name) => ({ name, links: artistLinks(name) })),
    track: title ? trackLinks(title, artists) : [],
  };
}
