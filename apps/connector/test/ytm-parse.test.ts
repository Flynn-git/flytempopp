import { describe, expect, it } from 'vitest';
import { parseContinuation, parseDuration, parsePlaylists, parseTracks } from '../src/adapters/ytm-parse';

// Trimmed to the fields the parser reads, in the shape music.youtube.com returns.
const artistRun = (text: string) => ({
  text,
  navigationEndpoint: { browseEndpoint: { browseId: 'UC1', browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } },
});
const albumRun = (text: string) => ({
  text,
  navigationEndpoint: { browseEndpoint: { browseId: 'MPRE1', browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ALBUM' } } } },
});
const row = (videoId: string | null, title: string, meta: object[], album: object[], duration: string) => ({
  musicResponsiveListItemRenderer: {
    ...(videoId ? { playlistItemData: { videoId } } : {}),
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: meta } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: album } } },
    ],
    fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: duration }] } } }],
  },
});

const playlistPage = {
  contents: {
    twoColumnBrowseResultsRenderer: {
      secondaryContents: {
        sectionListRenderer: {
          contents: [
            {
              musicPlaylistShelfRenderer: {
                contents: [
                  row('abc123', 'Midnight City', [artistRun('M83')], [albumRun('Hurry Up, We\'re Dreaming')], '4:04'),
                  row('def456', 'Get Lucky', [artistRun('Daft Punk'), { text: ' & ' }, artistRun('Pharrell Williams')], [], '6:09'),
                  row(null, 'Unavailable song', [artistRun('Gone')], [], '3:00'),
                  row('ghi789', 'Some upload', [{ text: 'Cool Channel' }, { text: ' • ' }, { text: '1.2M views' }], [], '1:02:03'),
                  { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'NEXT_TOKEN' } } } },
                ],
              },
            },
          ],
        },
      },
    },
  },
};

describe('ytm parsers', () => {
  it('parses playlist rows, skipping unavailable ones', () => {
    const tracks = parseTracks(playlistPage);
    expect(tracks.map((t) => t.id)).toEqual(['abc123', 'def456', 'ghi789']);
    expect(tracks[0]).toMatchObject({ title: 'Midnight City', artists: ['M83'], album: "Hurry Up, We're Dreaming", durationMs: 244_000 });
    expect(tracks[1]!.artists).toEqual(['Daft Punk', 'Pharrell Williams']);
    expect(tracks[2]).toMatchObject({ artists: ['Cool Channel'], durationMs: 3_723_000 });
  });

  it('finds the continuation token', () => {
    expect(parseContinuation(playlistPage)).toBe('NEXT_TOKEN');
    expect(parseContinuation({ continuationContents: { nextContinuationData: { continuation: 'OLD' } } })).toBe('OLD');
    expect(parseContinuation({})).toBeUndefined();
  });

  it('parses library playlists and skips liked music', () => {
    const tile = (browseId: string, title: string, subtitle: string) => ({
      musicTwoRowItemRenderer: {
        title: { runs: [{ text: title }] },
        subtitle: { runs: [{ text: subtitle }] },
        navigationEndpoint: { browseEndpoint: { browseId } },
      },
    });
    const page = { items: [tile('VLLM', 'Liked Music', 'Auto playlist'), tile('VLPL1', 'Road trip', 'Playlist • You • 1,204 songs'), tile('MPREx', 'An album', 'Album')] };
    expect(parsePlaylists(page)).toEqual([
      { platform: 'ytm', id: 'PL1', kind: 'playlist', name: 'Road trip', trackCount: 1204, url: 'https://music.youtube.com/playlist?list=PL1' },
    ]);
  });

  it('parses durations', () => {
    expect(parseDuration('3:21')).toBe(201_000);
    expect(parseDuration('1:00:00')).toBe(3_600_000);
    expect(parseDuration('Live')).toBeUndefined();
  });
});
