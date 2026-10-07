/**
 * YouTube Music via the official YouTube Data API v3, signed in with Google.
 *
 * Everything runs in the browser: Google Identity Services hands us a
 * short-lived, read-only access token (kept in memory only), and we call
 * googleapis.com directly. YouTube Music likes and playlists are ordinary
 * YouTube likes and playlists, so the Data API sees them.
 *
 * Quota: every call here costs 1 unit per page of 50, so a 5,000-song
 * library is ~100 units of the project's 10,000/day.
 */

import { cleanArtist, cleanTitle, type Collection, type CollectionSnapshot, type SourceTrack } from '@hovering/core';

export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const API = 'https://www.googleapis.com/youtube/v3';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
/** YouTube's "Music" video category. */
const MUSIC_CATEGORY = '10';
const MAX_PAGES = 200;

export class YouTubeError extends Error {
  constructor(
    readonly code: 'not_configured' | 'cancelled' | 'auth' | 'quota' | 'no_channel' | 'http',
    message: string,
  ) {
    super(message);
  }
}

// ---------- sign-in ----------

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}
interface GoogleOAuth2 {
  initTokenClient(cfg: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string; message?: string }) => void;
  }): TokenClient;
}

let gisPromise: Promise<GoogleOAuth2> | undefined;

/** Loads Google Identity Services once. Call early so the click handler can open the popup synchronously. */
export function loadGoogle(): Promise<GoogleOAuth2> {
  gisPromise ??= new Promise((resolve, reject) => {
    const ready = () => {
      const oauth2 = (globalThis as { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }).google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new YouTubeError('http', 'Google sign-in failed to load'));
    };
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = ready;
    s.onerror = () => {
      gisPromise = undefined;
      reject(new YouTubeError('http', 'Could not reach Google sign-in. Check your connection or ad blocker.'));
    };
    document.head.append(s);
  });
  return gisPromise;
}

/**
 * Asks Google for a read-only token. Must be called from a click handler,
 * with `loadGoogle()` already resolved, or the browser blocks the popup.
 */
export function requestToken(oauth2: GoogleOAuth2): Promise<string> {
  if (!GOOGLE_CLIENT_ID) return Promise.reject(new YouTubeError('not_configured', 'Google sign-in is not configured yet'));
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.access_token) resolve(r.access_token);
        else reject(new YouTubeError(r.error === 'access_denied' ? 'cancelled' : 'auth', r.error_description || r.error || 'Sign-in failed'));
      },
      error_callback: (e) =>
        reject(new YouTubeError(e.type === 'popup_closed' ? 'cancelled' : 'auth', e.message || 'Sign-in was closed')),
    });
    client.requestAccessToken();
  });
}

// ---------- API ----------

type Fetch = typeof fetch;

interface Page<T> {
  items?: T[];
  nextPageToken?: string;
}

interface VideoResource {
  id: string;
  snippet?: { title?: string; channelTitle?: string; categoryId?: string };
  contentDetails?: { duration?: string };
}

interface PlaylistResource {
  id: string;
  snippet?: { title?: string };
  contentDetails?: { itemCount?: number };
}

interface PlaylistItemResource {
  contentDetails?: { videoId?: string };
}

async function get<T>(fetchFn: Fetch, token: string, path: string, params: Record<string, string>): Promise<Page<T>> {
  const url = `${API}/${path}?${new URLSearchParams(params)}`;
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return (await res.json()) as Page<T>;
  let reason = '';
  try {
    const body = (await res.json()) as { error?: { errors?: { reason?: string }[]; message?: string } };
    reason = body.error?.errors?.[0]?.reason ?? '';
  } catch {
    /* non-JSON error */
  }
  if (res.status === 401) throw new YouTubeError('auth', 'Your Google sign-in expired. Sign in again.');
  if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded')
    throw new YouTubeError('quota', 'hovering.today has hit its daily YouTube limit. Try again tomorrow.');
  if (reason === 'youtubeSignupRequired' || reason === 'channelNotFound')
    throw new YouTubeError('no_channel', 'This Google account has no YouTube channel, so it has no likes or playlists to read.');
  throw new YouTubeError('http', `YouTube returned ${res.status}${reason ? ` (${reason})` : ''}`);
}

async function* pages<T>(fetchFn: Fetch, token: string, path: string, params: Record<string, string>): AsyncGenerator<T[]> {
  let pageToken: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await get<T>(fetchFn, token, path, { ...params, maxResults: '50', ...(pageToken ? { pageToken } : {}) });
    yield page.items ?? [];
    pageToken = page.nextPageToken;
    if (!pageToken) return;
  }
}

/** ISO 8601 duration ("PT1H2M3S") to milliseconds. */
export function parseIsoDuration(d: string | undefined): number | undefined {
  const m = d?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  const [, days = '0', h = '0', min = '0', s = '0'] = m;
  return (((Number(days) * 24 + Number(h)) * 60 + Number(min)) * 60 + Number(s)) * 1000;
}

/**
 * Turns a YouTube video into a track. Songs from YouTube Music's catalogue
 * come from "Artist - Topic" channels with clean titles; other uploads are
 * usually titled "Artist - Song (Official Video)", so split that.
 */
export function videoToTrack(v: VideoResource): SourceTrack | null {
  const rawTitle = v.snippet?.title;
  if (!rawTitle || rawTitle === 'Deleted video' || rawTitle === 'Private video') return null;
  const channel = v.snippet?.channelTitle ?? '';
  let title = rawTitle;
  let artists = channel ? [cleanArtist(channel)] : [];
  if (!/\s-\s*topic$/i.test(channel)) {
    const dash = rawTitle.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    // "Heroes - 2017 Remaster" is a song with a version note, not "Artist - Song".
    if (dash && !/^(?:\d{4}\s+)?(?:remaster|live\b|radio edit|single version|mono|stereo)/i.test(dash[2]!)) {
      artists = dash[1]!.split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?)\s*/i).filter(Boolean);
      title = dash[2]!;
    }
  }
  return {
    platform: 'ytm',
    id: v.id,
    title: cleanTitle(title),
    artists,
    durationMs: parseIsoDuration(v.contentDetails?.duration),
    url: `https://music.youtube.com/watch?v=${v.id}`,
  };
}

const isMusic = (v: VideoResource) => v.snippet?.categoryId === MUSIC_CATEGORY;

async function videosById(fetchFn: Fetch, token: string, ids: string[]): Promise<VideoResource[]> {
  const out: VideoResource[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const page = await get<VideoResource>(fetchFn, token, 'videos', {
      part: 'snippet,contentDetails',
      id: ids.slice(i, i + 50).join(','),
      maxResults: '50',
    });
    out.push(...(page.items ?? []));
  }
  return out;
}

export interface SyncOptions {
  token: string;
  onProgress?: (message: string) => void;
  fetchFn?: Fetch;
}

/**
 * Reads the signed-in user's liked songs and playlists.
 * Liked videos that aren't music (YouTube category 10) are left out; so are
 * playlists with no music in them.
 */
export async function syncYouTube({ token, onProgress, fetchFn = fetch.bind(globalThis) }: SyncOptions): Promise<CollectionSnapshot[]> {
  const fetchedAt = new Date().toISOString();
  const snapshots: CollectionSnapshot[] = [];

  onProgress?.('Reading your liked songs…');
  const liked: SourceTrack[] = [];
  for await (const items of pages<VideoResource>(fetchFn, token, 'videos', { part: 'snippet,contentDetails', myRating: 'like' })) {
    for (const v of items) {
      const t = isMusic(v) ? videoToTrack(v) : null;
      if (t) liked.push(t);
    }
    onProgress?.(`Reading your liked songs… ${liked.length}`);
  }
  snapshots.push({
    collection: { platform: 'ytm', id: 'LM', kind: 'likes', name: 'Liked music', trackCount: liked.length, url: 'https://music.youtube.com/playlist?list=LM' },
    tracks: liked,
    fetchedAt,
  });

  onProgress?.('Finding your playlists…');
  const playlists: PlaylistResource[] = [];
  for await (const items of pages<PlaylistResource>(fetchFn, token, 'playlists', { part: 'snippet,contentDetails', mine: 'true' })) {
    playlists.push(...items);
  }

  for (const [i, p] of playlists.entries()) {
    const name = p.snippet?.title || 'Untitled playlist';
    onProgress?.(`Reading “${name}” (${i + 1} of ${playlists.length})…`);
    const ids: string[] = [];
    for await (const items of pages<PlaylistItemResource>(fetchFn, token, 'playlistItems', { part: 'contentDetails', playlistId: p.id })) {
      for (const it of items) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    }
    const videos = await videosById(fetchFn, token, ids);
    if (videos.length > 0 && !videos.some(isMusic)) continue; // e.g. a "Watch later"-style video playlist
    const byId = new Map(videos.map((v) => [v.id, v]));
    const tracks = ids.map((id) => byId.get(id)).flatMap((v) => (v ? [videoToTrack(v)] : [])).filter((t): t is SourceTrack => !!t);
    const collection: Collection = {
      platform: 'ytm',
      id: p.id,
      kind: 'playlist',
      name,
      trackCount: tracks.length,
      url: `https://music.youtube.com/playlist?list=${p.id}`,
    };
    snapshots.push({ collection, tracks, fetchedAt });
  }
  return snapshots;
}
