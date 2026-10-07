/**
 * Canonical data model for hovering.today.
 *
 * Platforms hand us `SourceTrack`s (their view of a song). The matcher links
 * the ones that are the same recording to a single canonical `Track`, so a
 * song liked on Spotify and saved on YouTube Music shows up once.
 */

export type Platform = 'ytm' | 'spotify' | 'soundcloud';

export const PLATFORMS: readonly Platform[] = ['ytm', 'spotify', 'soundcloud'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  ytm: 'YouTube Music',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
};

/** A track as one platform describes it. */
export interface SourceTrack {
  platform: Platform;
  /** The platform's own ID (YouTube videoId, Spotify track ID, SoundCloud track ID). */
  id: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  /** International Standard Recording Code, when the platform exposes it. */
  isrc?: string;
  url?: string;
}

export type CollectionKind = 'likes' | 'playlist';

/** A list of tracks on one platform: the liked-songs list or a playlist. */
export interface Collection {
  platform: Platform;
  id: string;
  kind: CollectionKind;
  name: string;
  trackCount?: number;
  url?: string;
}

/** A collection together with its tracks, in order. */
export interface CollectionSnapshot {
  collection: Collection;
  tracks: SourceTrack[];
  fetchedAt: string;
}

/** Stable key for a source track, e.g. `spotify:4uLU6hMCjMI75M1A2tKUQC`. */
export function sourceKey(t: Pick<SourceTrack, 'platform' | 'id'>): string {
  return `${t.platform}:${t.id}`;
}

/** Stable key for a collection, e.g. `ytm:LM`. */
export function collectionKey(c: Pick<Collection, 'platform' | 'id'>): string {
  return `${c.platform}:${c.id}`;
}
