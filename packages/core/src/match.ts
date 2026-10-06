/**
 * Cross-platform track matching.
 *
 * Order of evidence, strongest first:
 *   1. Same ISRC                                  -> certain
 *   2. Same normalized title + overlapping artist,
 *      durations within tolerance                 -> confident
 *   3. Fuzzy title/artist similarity              -> probable (user confirms)
 * Different version tags ("remix", "live", ...) never match.
 */

import { type SourceTrack, sourceKey } from './model';
import { normalizeArtist, normalizeTitle, versionTags } from './normalize';

export type MatchConfidence = 'certain' | 'confident' | 'probable';

export interface MatchResult {
  confidence: MatchConfidence;
  score: number;
  reason: string;
}

const DURATION_TOLERANCE_MS = 3000;
const PROBABLE_THRESHOLD = 0.82;

interface Prepared {
  track: SourceTrack;
  title: string;
  artists: string[];
  versions: string;
}

function prepare(t: SourceTrack): Prepared {
  return {
    track: t,
    title: normalizeTitle(t.title, t.artists),
    artists: t.artists.map(normalizeArtist).filter(Boolean),
    versions: versionTags(t.title).join(','),
  };
}

function durationsCompatible(a?: number, b?: number): boolean {
  if (a === undefined || b === undefined) return true;
  return Math.abs(a - b) <= DURATION_TOLERANCE_MS;
}

function artistsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return a.some((x) => b.some((y) => x === y || x.includes(y) || y.includes(x)));
}

/** Dice coefficient over character bigrams, 0..1. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      grams.set(g, n - 1);
      hits++;
    }
  }
  return (2 * hits) / (a.length + b.length - 2);
}

function compare(a: Prepared, b: Prepared): MatchResult | null {
  // Differing ISRCs are not proof of a different recording: singles and album
  // releases of the same master often carry separate codes. Fall through.
  if (a.track.isrc && b.track.isrc && a.track.isrc.toUpperCase() === b.track.isrc.toUpperCase()) {
    return { confidence: 'certain', score: 1, reason: 'Same ISRC' };
  }
  if (a.versions !== b.versions) return null;
  if (!durationsCompatible(a.track.durationMs, b.track.durationMs)) return null;

  const overlap = artistsOverlap(a.artists, b.artists);
  if (overlap && a.title === b.title) {
    return { confidence: 'confident', score: 0.95, reason: 'Same title and artist' };
  }

  const titleSim = similarity(a.title, b.title);
  const artistSim = overlap ? 1 : similarity(a.artists.join(' '), b.artists.join(' '));
  const score = 0.65 * titleSim + 0.35 * artistSim;
  if (score >= PROBABLE_THRESHOLD) {
    return { confidence: 'probable', score, reason: `Similar title and artist (${Math.round(score * 100)}%)` };
  }
  return null;
}

export function matchTracks(a: SourceTrack, b: SourceTrack): MatchResult | null {
  return compare(prepare(a), prepare(b));
}

export interface TrackGroup {
  /** Source tracks judged to be the same recording, at most one per platform+id. */
  members: SourceTrack[];
  /** Weakest link that joined this group; 'certain' for singletons. */
  confidence: MatchConfidence;
}

const RANK: Record<MatchConfidence, number> = { certain: 2, confident: 1, probable: 0 };

/**
 * Group tracks from any number of platforms into same-recording groups.
 *
 * Tracks are bucketed by ISRC and by normalized title so we only compare
 * plausible pairs, then joined greedily, best match first. A group never
 * holds two tracks from the same platform, since one platform's duplicates
 * are separate uploads the user chose to keep.
 */
export function groupTracks(tracks: SourceTrack[]): TrackGroup[] {
  const unique = new Map<string, Prepared>();
  for (const t of tracks) if (!unique.has(sourceKey(t))) unique.set(sourceKey(t), prepare(t));
  const items = [...unique.values()];

  const buckets = new Map<string, number[]>();
  const add = (key: string, i: number) => {
    const b = buckets.get(key);
    if (b) b.push(i);
    else buckets.set(key, [i]);
  };
  items.forEach((p, i) => {
    if (p.track.isrc) add(`isrc:${p.track.isrc.toUpperCase()}`, i);
    if (p.title) add(`title:${p.title}`, i);
    for (const a of p.artists) add(`artist:${a}`, i);
  });

  const seen = new Set<string>();
  const edges: { i: number; j: number; m: MatchResult }[] = [];
  for (const idx of buckets.values()) {
    if (idx.length > 500) continue; // a giant bucket (e.g. "various artists") is not useful evidence
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const i = idx[x]!;
        const j = idx[y]!;
        if (items[i]!.track.platform === items[j]!.track.platform) continue;
        const pair = i < j ? `${i},${j}` : `${j},${i}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        const m = compare(items[i]!, items[j]!);
        if (m) edges.push({ i, j, m });
      }
    }
  }
  edges.sort((e, f) => f.m.score - e.m.score);

  const groupOf = items.map((_, i) => i);
  const groups = new Map<number, { members: number[]; platforms: Set<string>; confidence: MatchConfidence }>(
    items.map((p, i) => [i, { members: [i], platforms: new Set([p.track.platform]), confidence: 'certain' }]),
  );
  for (const { i, j, m } of edges) {
    const gi = groupOf[i]!;
    const gj = groupOf[j]!;
    if (gi === gj) continue;
    const A = groups.get(gi)!;
    const B = groups.get(gj)!;
    if ([...B.platforms].some((p) => A.platforms.has(p))) continue;
    for (const k of B.members) groupOf[k] = gi;
    A.members.push(...B.members);
    B.platforms.forEach((p) => A.platforms.add(p));
    if (RANK[m.confidence] < RANK[A.confidence]) A.confidence = m.confidence;
    if (RANK[B.confidence] < RANK[A.confidence]) A.confidence = B.confidence;
    groups.delete(gj);
  }

  return [...groups.values()].map((g) => ({
    members: g.members.map((k) => items[k]!.track),
    confidence: g.confidence,
  }));
}
