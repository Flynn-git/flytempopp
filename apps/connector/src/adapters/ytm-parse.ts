/**
 * Parsers for YouTube Music's internal "browse" responses.
 *
 * These responses are deeply nested and their layout shifts over time, so
 * rather than hard-coding one path we walk the tree and pick out the renderer
 * objects we care about wherever they sit. When YouTube Music changes shape,
 * this is the file to fix.
 */

import type { Collection, SourceTrack } from '@hovering/core';

type Json = unknown;
type Obj = Record<string, unknown>;

const isObj = (v: Json): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Depth-first search for every object stored under `key`, without descending
 * into matches. Array elements come out in document order.
 */
export function findAll(root: Json, key: string): Obj[] {
  const out: Obj[] = [];
  const stack: Json[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) stack.push(v[i]);
    } else if (isObj(v)) {
      for (const [k, child] of Object.entries(v)) {
        if (k === key && isObj(child)) out.push(child);
        else stack.push(child);
      }
    }
  }
  return out;
}

function first(root: Json, key: string): Obj | undefined {
  return findAll(root, key)[0];
}

function runsText(v: Json): string {
  if (!isObj(v)) return '';
  if (typeof v.simpleText === 'string') return v.simpleText;
  if (Array.isArray(v.runs)) return v.runs.map((r) => (isObj(r) && typeof r.text === 'string' ? r.text : '')).join('');
  return '';
}

function pageType(run: Obj): string | undefined {
  const be = first(run, 'browseEndpoint');
  const cfg = be && first(be, 'browseEndpointContextMusicConfig');
  return typeof cfg?.pageType === 'string' ? cfg.pageType : undefined;
}

export function parseDuration(text: string): number | undefined {
  if (!/^\d+(?::\d{1,2}){1,2}$/.test(text.trim())) return undefined;
  return text.trim().split(':').reduce((acc, part) => acc * 60 + Number(part), 0) * 1000;
}

function flexColumnRuns(item: Obj, index: number): Obj[] {
  const cols = Array.isArray(item.flexColumns) ? item.flexColumns : [];
  const col = cols[index];
  const r = isObj(col) ? (col.musicResponsiveListItemFlexColumnRenderer as Obj | undefined) : undefined;
  const text = r && isObj(r.text) ? r.text : undefined;
  return Array.isArray(text?.runs) ? (text.runs.filter(isObj) as Obj[]) : [];
}

/** Turns one `musicResponsiveListItemRenderer` (a row in a playlist) into a track. */
export function parseListItem(item: Obj): SourceTrack | null {
  const videoId =
    (isObj(item.playlistItemData) && typeof item.playlistItemData.videoId === 'string'
      ? item.playlistItemData.videoId
      : undefined) ?? (first(item, 'watchEndpoint')?.videoId as string | undefined);
  if (!videoId) return null; // greyed-out / unavailable rows have no playable ID

  const titleRuns = flexColumnRuns(item, 0);
  const title = titleRuns.map((r) => r.text).join('');
  if (!title) return null;

  // Column 1 holds "Artist • Album • 3:21" style runs; prefer typed links.
  const meta = [...flexColumnRuns(item, 1), ...flexColumnRuns(item, 2)];
  let artists = meta.filter((r) => pageType(r) === 'MUSIC_PAGE_TYPE_ARTIST').map((r) => String(r.text));
  const album = meta.find((r) => pageType(r) === 'MUSIC_PAGE_TYPE_ALBUM')?.text as string | undefined;
  if (artists.length === 0) {
    // Videos uploaded by channels have untyped artist text: "Channel • 1.2M views"
    const firstSegment = flexColumnRuns(item, 1).map((r) => r.text).join('').split(' • ')[0] ?? '';
    artists = firstSegment.split(/\s*(?:,|&)\s*/).filter(Boolean);
  }

  const fixed = Array.isArray(item.fixedColumns) ? item.fixedColumns[0] : undefined;
  const fixedR = isObj(fixed) ? fixed.musicResponsiveListItemFixedColumnRenderer : undefined;
  const durationMs = parseDuration(isObj(fixedR) ? runsText(fixedR.text) : '');

  return {
    platform: 'ytm',
    id: videoId,
    title,
    artists,
    album,
    durationMs,
    url: `https://music.youtube.com/watch?v=${videoId}`,
  };
}

export function parseTracks(response: Json): SourceTrack[] {
  const out: SourceTrack[] = [];
  for (const item of findAll(response, 'musicResponsiveListItemRenderer')) {
    const t = parseListItem(item);
    if (t) out.push(t);
  }
  return out;
}

/** Continuation token for the next page, in either the current or the legacy format. */
export function parseContinuation(response: Json): string | undefined {
  const cmd = first(response, 'continuationCommand');
  if (typeof cmd?.token === 'string') return cmd.token;
  const legacy = first(response, 'nextContinuationData');
  if (typeof legacy?.continuation === 'string') return legacy.continuation;
  return undefined;
}

/** Playlists shown in the user's library ("FEmusic_liked_playlists"). */
export function parsePlaylists(response: Json): Collection[] {
  const out: Collection[] = [];
  const seen = new Set<string>();
  for (const item of findAll(response, 'musicTwoRowItemRenderer')) {
    const browseId = first(item.navigationEndpoint, 'browseEndpoint')?.browseId;
    if (typeof browseId !== 'string' || !browseId.startsWith('VL')) continue;
    const id = browseId.slice(2);
    if (id === 'LM' || id === 'SE' || seen.has(id)) continue; // liked music is listed separately; SE = saved episodes
    seen.add(id);
    const subtitle = runsText(item.subtitle);
    const count = subtitle.match(/([\d,.]+)\s+(?:songs?|tracks?)/i)?.[1];
    out.push({
      platform: 'ytm',
      id,
      kind: 'playlist',
      name: runsText(item.title) || id,
      trackCount: count ? Number(count.replace(/[,.]/g, '')) : undefined,
      url: `https://music.youtube.com/playlist?list=${id}`,
    });
  }
  return out;
}
