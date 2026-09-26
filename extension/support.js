// "Support the artist" links for the playing track. Bandcamp comes first, then
// paid download stores that DJs buy from. Free streaming platforms are left out on
// purpose: the aim is to send listeners where their money reaches the artist.
//
// These are plain links built from the title/artist already shown in the popup.
// Nothing is fetched. The artist/title only leave the browser if the user
// clicks a link, as the search query on that store's site.

const Support = (() => {
  const q = encodeURIComponent;

  // Splits a byline into artists on commas and "feat."/"ft." only. Never on "&"
  // or "x", which would break names like "Chase & Status". Drops any
  // "• Album • 2024" tail.
  function splitArtists(byline) {
    if (!byline) return [];
    const main = String(byline).split("•")[0];
    return [
      ...new Set(
        main
          .split(/\s*(?:,|\bfeat\.|\bft\.|\bfeaturing\b)\s*/i)
          .map((name) => name.trim())
          .filter(Boolean)
      ),
    ];
  }

  // Strips "(Official Video)", "[feat. X]" etc. that hurt store searches.
  function cleanTitle(title) {
    return String(title || "")
      .replace(/\s*[([](?:official|lyric|audio|video|visuali[sz]er|hd|4k|explicit)[^)\]]*[)\]]/gi, "")
      .replace(/\s*[([](?:feat|ft)\.?[^)\]]*[)\]]/gi, "")
      .trim();
  }

  function links({ title, artist }) {
    const artists = splitArtists(artist);
    const query = `${artists[0] || ""} ${cleanTitle(title)}`.trim();
    return {
      artists: artists.map((name) => ({
        name,
        url: `https://bandcamp.com/search?q=${q(name)}&item_type=b`,
      })),
      track: query
        ? [
            { store: "Bandcamp", url: `https://bandcamp.com/search?q=${q(query)}&item_type=t` },
            { store: "Beatport", url: `https://www.beatport.com/search?q=${q(query)}` },
            { store: "Juno", url: `https://www.junodownload.com/search/?q%5Ball%5D%5B%5D=${q(query)}` },
            { store: "Qobuz", url: `https://www.qobuz.com/gb-en/search?q=${q(query)}` },
          ]
        : [],
    };
  }

  return { splitArtists, cleanTitle, links };
})();
