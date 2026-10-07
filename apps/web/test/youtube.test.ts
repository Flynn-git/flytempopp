import { describe, expect, it } from 'vitest';
import { YouTubeError, parseIsoDuration, syncYouTube, videoToTrack } from '../src/importers/youtube';

const video = (id: string, title: string, channelTitle: string, categoryId = '10', duration = 'PT3M30S') => ({
  id,
  snippet: { title, channelTitle, categoryId },
  contentDetails: { duration },
});

/** Minimal fake of the three YouTube Data API endpoints we call. */
function fakeApi(data: {
  liked: ReturnType<typeof video>[][];
  playlists: { id: string; snippet: { title: string } }[];
  items: Record<string, string[]>;
  videos: Record<string, ReturnType<typeof video>>;
}) {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname.split('/').pop()}?${url.searchParams}`);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const page = Number(url.searchParams.get('pageToken') ?? 0);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    switch (url.pathname) {
      case '/youtube/v3/videos':
        if (url.searchParams.get('myRating') === 'like') {
          return json({ items: data.liked[page], nextPageToken: page + 1 < data.liked.length ? String(page + 1) : undefined });
        }
        return json({ items: url.searchParams.get('id')!.split(',').map((id) => data.videos[id]).filter(Boolean) });
      case '/youtube/v3/playlists':
        return json({ items: data.playlists });
      case '/youtube/v3/playlistItems':
        return json({ items: (data.items[url.searchParams.get('playlistId')!] ?? []).map((videoId) => ({ contentDetails: { videoId } })) });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe('videoToTrack', () => {
  it('uses Topic channel titles as-is', () => {
    expect(videoToTrack(video('a', 'Midnight City', 'M83 - Topic'))).toMatchObject({
      id: 'a', title: 'Midnight City', artists: ['M83'], durationMs: 210_000, url: 'https://music.youtube.com/watch?v=a',
    });
  });

  it('splits "Artist - Song" uploads', () => {
    expect(videoToTrack(video('b', 'M83 - Midnight City (Official Video)', 'M83VEVO'))).toMatchObject({
      title: 'Midnight City', artists: ['M83'],
    });
    expect(videoToTrack(video('c', 'Calvin Harris & Dua Lipa - One Kiss', 'Calvin Harris'))!.artists).toEqual(['Calvin Harris', 'Dua Lipa']);
  });

  it('does not split version notes', () => {
    expect(videoToTrack(video('d', 'Heroes - 2017 Remaster', 'David Bowie'))).toMatchObject({ title: 'Heroes - 2017 Remaster', artists: ['David Bowie'] });
  });

  it('drops deleted and private videos', () => {
    expect(videoToTrack(video('e', 'Deleted video', ''))).toBeNull();
    expect(videoToTrack(video('f', 'Private video', ''))).toBeNull();
  });

  it('parses ISO durations', () => {
    expect(parseIsoDuration('PT4M3S')).toBe(243_000);
    expect(parseIsoDuration('PT1H')).toBe(3_600_000);
    expect(parseIsoDuration('P0D')).toBe(0);
    expect(parseIsoDuration(undefined)).toBeUndefined();
  });
});

describe('syncYouTube', () => {
  it('reads paged likes (music only) and playlists, skipping non-music playlists', async () => {
    const { fetchFn, calls } = fakeApi({
      liked: [
        [video('l1', 'Midnight City', 'M83 - Topic'), video('cat', 'Funny cat', 'Cats', '15')],
        [video('l2', 'Get Lucky', 'Daft Punk - Topic')],
      ],
      playlists: [
        { id: 'PLmusic', snippet: { title: 'Road trip' } },
        { id: 'PLtalks', snippet: { title: 'Talks' } },
      ],
      items: { PLmusic: ['l2', 'gone', 'l1'], PLtalks: ['t1'] },
      videos: {
        l1: video('l1', 'Midnight City', 'M83 - Topic'),
        l2: video('l2', 'Get Lucky', 'Daft Punk - Topic'),
        t1: video('t1', 'A talk', 'Conf', '28'),
      },
    });
    const progress: string[] = [];
    const snaps = await syncYouTube({ token: 'tok', fetchFn, onProgress: (m) => progress.push(m) });

    expect(snaps.map((s) => [s.collection.id, s.collection.kind, s.tracks.map((t) => t.id)])).toEqual([
      ['LM', 'likes', ['l1', 'l2']],
      ['PLmusic', 'playlist', ['l2', 'l1']], // playlist order kept; unavailable video dropped
    ]);
    expect(calls.some((c) => c.includes('pageToken=1'))).toBe(true);
    expect(progress.at(-1)).toContain('Talks');
  });

  it('turns API errors into readable ones', async () => {
    const fail = (status: number, reason: string) =>
      (async () => new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status })) as typeof fetch;
    await expect(syncYouTube({ token: 'tok', fetchFn: fail(403, 'quotaExceeded') })).rejects.toMatchObject({ code: 'quota' });
    await expect(syncYouTube({ token: 'tok', fetchFn: fail(401, 'authError') })).rejects.toMatchObject({ code: 'auth' });
    await expect(syncYouTube({ token: 'tok', fetchFn: fail(403, 'youtubeSignupRequired') })).rejects.toBeInstanceOf(YouTubeError);
  });
});
