import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { importSpotifyExport, parseExportJson } from '../src/importers/spotify-export';

const library = {
  tracks: [
    { artist: 'M83', album: "Hurry Up, We're Dreaming", track: 'Midnight City', uri: 'spotify:track:1eyzqe2QqGZUmfcPZtrIyt' },
    { artist: 'Some Podcast', album: '', track: 'Episode', uri: 'spotify:episode:abc' },
  ],
  albums: [],
};
const playlists = {
  playlists: [
    {
      name: 'Road trip',
      items: [
        { track: { trackName: 'Get Lucky', artistName: 'Daft Punk', albumName: 'RAM', trackUri: 'spotify:track:69kOkLUCkxIZYexIgSG8rq' } },
        { track: null, episode: { episodeName: 'x' } },
      ],
    },
    { name: 'Road trip', items: [] },
  ],
};

describe('spotify export import', () => {
  it('reads liked songs and skips non-tracks', () => {
    const [snap] = parseExportJson('YourLibrary.json', JSON.stringify(library), 'now');
    expect(snap?.collection).toMatchObject({ platform: 'spotify', id: 'liked', kind: 'likes', trackCount: 1 });
    expect(snap?.tracks[0]).toMatchObject({ id: '1eyzqe2QqGZUmfcPZtrIyt', title: 'Midnight City', artists: ['M83'] });
  });

  it('reads playlists and gives same-named ones distinct IDs', () => {
    const snaps = parseExportJson('Playlist1.json', JSON.stringify(playlists), 'now');
    expect(snaps.map((s) => s.collection.id)).toEqual(['export-road-trip', 'export-road-trip-2']);
    expect(snaps[0]!.tracks).toHaveLength(1);
  });

  it('ignores unrelated files', () => {
    expect(parseExportJson('StreamingHistory0.json', '[]', 'now')).toEqual([]);
  });

  it('reads the export zip', async () => {
    const zip = zipSync({
      'Spotify Account Data/YourLibrary.json': strToU8(JSON.stringify(library)),
      'Spotify Account Data/Playlist1.json': strToU8(JSON.stringify(playlists)),
      'Spotify Account Data/Userdata.json': strToU8('{"email":"secret"}'),
    });
    const file = new File([zip], 'my_spotify_data.zip');
    const snaps = await importSpotifyExport([file]);
    expect(snaps.map((s) => s.collection.kind).sort()).toEqual(['likes', 'playlist', 'playlist']);
  });
});
