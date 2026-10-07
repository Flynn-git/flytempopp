/**
 * Import from Spotify's own "Download your data" export (Account data).
 *
 * Spotify's developer API caps unreviewed apps at 5 users, so the export is
 * how anyone can bring a Spotify library in: request it at
 * https://www.spotify.com/account/privacy/ and drop the zip (or the JSON
 * files inside it) here. It has no durations or ISRCs, so matching leans on
 * title and artist.
 */

import { unzipSync, strFromU8 } from 'fflate';
import type { CollectionSnapshot, SourceTrack } from '@hovering/core';

interface ExportTrack {
  artist?: string;
  album?: string;
  track?: string;
  uri?: string;
}

interface ExportPlaylistItem {
  track?: { trackName?: string; artistName?: string; albumName?: string; trackUri?: string } | null;
}

interface ExportPlaylist {
  name?: string;
  items?: ExportPlaylistItem[];
}

function trackId(uri: string | undefined): string | undefined {
  const m = uri?.match(/^spotify:track:([A-Za-z0-9]+)$/);
  return m?.[1];
}

function toTrack(id: string, title: string, artist: string | undefined, album: string | undefined): SourceTrack {
  return {
    platform: 'spotify',
    id,
    title,
    // The export gives one artist string; split "A, B" collaborations.
    artists: (artist ?? '').split(/\s*,\s*/).filter(Boolean),
    album: album || undefined,
    url: `https://open.spotify.com/track/${id}`,
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'playlist';
}

export function parseLibrary(json: { tracks?: ExportTrack[] }, fetchedAt: string): CollectionSnapshot | null {
  if (!Array.isArray(json.tracks)) return null;
  const tracks: SourceTrack[] = [];
  for (const t of json.tracks) {
    const id = trackId(t.uri);
    if (id && t.track) tracks.push(toTrack(id, t.track, t.artist, t.album));
  }
  return {
    collection: { platform: 'spotify', id: 'liked', kind: 'likes', name: 'Liked Songs', trackCount: tracks.length },
    tracks,
    fetchedAt,
  };
}

export function parsePlaylists(json: { playlists?: ExportPlaylist[] }, fetchedAt: string): CollectionSnapshot[] {
  if (!Array.isArray(json.playlists)) return [];
  const used = new Map<string, number>();
  return json.playlists.map((p) => {
    const name = p.name || 'Untitled playlist';
    // The export carries no playlist IDs; derive a stable one from the name.
    const base = `export-${slug(name)}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const tracks: SourceTrack[] = [];
    for (const item of p.items ?? []) {
      const t = item.track;
      const id = trackId(t?.trackUri);
      if (t && id && t.trackName) tracks.push(toTrack(id, t.trackName, t.artistName, t.albumName));
    }
    return {
      collection: {
        platform: 'spotify',
        id: n === 1 ? base : `${base}-${n}`,
        kind: 'playlist',
        name,
        trackCount: tracks.length,
      },
      tracks,
      fetchedAt,
    } satisfies CollectionSnapshot;
  });
}

/** Parse one JSON document from the export; unrelated files yield nothing. */
export function parseExportJson(name: string, text: string, fetchedAt: string): CollectionSnapshot[] {
  const base = name.split('/').pop() ?? name;
  if (!/^(YourLibrary|Playlist\d*)\.json$/i.test(base)) return [];
  const json = JSON.parse(text);
  if (/^YourLibrary/i.test(base)) {
    const lib = parseLibrary(json, fetchedAt);
    return lib ? [lib] : [];
  }
  return parsePlaylists(json, fetchedAt);
}

/** Accepts the export zip and/or the individual JSON files from it. */
export async function importSpotifyExport(files: File[]): Promise<CollectionSnapshot[]> {
  const fetchedAt = new Date().toISOString();
  const out: CollectionSnapshot[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: (f) => /(?:^|\/)(?:YourLibrary|Playlist\d*)\.json$/i.test(f.name),
      });
      for (const [name, data] of Object.entries(entries)) out.push(...parseExportJson(name, strFromU8(data), fetchedAt));
    } else {
      out.push(...parseExportJson(file.name, await file.text(), fetchedAt));
    }
  }
  return out;
}
