import { describe, expect, it } from 'vitest';
import { cleanTitle, groupTracks, matchTracks, normalizeArtist, normalizeTitle, type SourceTrack } from '../src';

const spotify = (id: string, title: string, artists: string[], durationMs?: number, isrc?: string): SourceTrack => ({
  platform: 'spotify', id, title, artists, durationMs, isrc,
});
const ytm = (id: string, title: string, artists: string[], durationMs?: number): SourceTrack => ({
  platform: 'ytm', id, title, artists, durationMs,
});
const sc = (id: string, title: string, artists: string[], durationMs?: number, isrc?: string): SourceTrack => ({
  platform: 'soundcloud', id, title, artists, durationMs, isrc,
});

describe('normalize', () => {
  it('strips upload decoration and an embedded artist prefix', () => {
    expect(normalizeTitle('M83 - Midnight City (Official Video)', ['M83VEVO'])).toBe('midnight city');
    expect(normalizeTitle('Midnight City [Free DL]', ['m83'])).toBe('midnight city');
    expect(normalizeTitle('Heroes - 2017 Remaster', ['David Bowie'])).toBe('heroes');
    expect(normalizeTitle('Get Lucky (feat. Pharrell Williams)', ['Daft Punk'])).toBe('get lucky');
  });

  it('cleans display titles without changing case', () => {
    expect(cleanTitle('Get Lucky (Official Audio)')).toBe('Get Lucky');
    expect(cleanTitle('Midnight City [Free DL]')).toBe('Midnight City');
    expect(cleanTitle('Song (Remix)')).toBe('Song (Remix)');
  });

  it('keeps a dash that is part of the title', () => {
    expect(normalizeTitle('Love - Hate', ['Someone Else'])).toBe('love hate');
  });

  it('cleans channel-style artist names', () => {
    expect(normalizeArtist('M83 - Topic')).toBe('m83');
    expect(normalizeArtist('M83VEVO')).toBe('m83');
    expect(normalizeArtist('The Beatles')).toBe('beatles');
    expect(normalizeArtist('Beyoncé')).toBe('beyonce');
  });
});

describe('matchTracks', () => {
  it('is certain on equal ISRC', () => {
    const m = matchTracks(spotify('a', 'X', ['A'], 1000, 'GBAYE0601498'), sc('b', 'Totally different', ['B'], 99999, 'gbaye0601498'));
    expect(m?.confidence).toBe('certain');
  });

  it('is confident on equal normalized title and artist', () => {
    const m = matchTracks(spotify('a', 'Midnight City', ['M83'], 243_000), ytm('b', 'M83 - Midnight City (Official Video)', ['M83VEVO'], 244_500));
    expect(m?.confidence).toBe('confident');
  });

  it('rejects when durations differ a lot', () => {
    expect(matchTracks(spotify('a', 'Midnight City', ['M83'], 243_000), ytm('b', 'Midnight City', ['M83'], 300_000))).toBeNull();
  });

  it('never merges a remix with the original', () => {
    expect(matchTracks(spotify('a', 'Midnight City', ['M83']), sc('b', 'Midnight City (Eric Prydz Remix)', ['M83']))).toBeNull();
  });

  it('returns probable for close but not identical titles', () => {
    const m = matchTracks(spotify('a', "Don't Stop Me Now", ['Queen']), ytm('b', 'Dont Stop Me Now', ['Queen']));
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThan(0.82);
  });
});

describe('groupTracks', () => {
  it('groups one recording across three platforms and leaves others alone', () => {
    const groups = groupTracks([
      spotify('s1', 'Midnight City', ['M83'], 243_000),
      ytm('y1', 'M83 - Midnight City (Official Video)', ['M83VEVO'], 244_000),
      sc('c1', 'Midnight City', ['m83'], 243_500),
      sc('c2', 'Midnight City (Remix)', ['someone'], 200_000),
      spotify('s2', 'Wait', ['M83'], 343_000),
    ]);
    const big = groups.find((g) => g.members.length === 3);
    expect(big?.members.map((t) => t.id).sort()).toEqual(['c1', 's1', 'y1']);
    expect(big?.confidence).toBe('confident');
    expect(groups).toHaveLength(3);
  });

  it('does not put two tracks from one platform in a group', () => {
    const groups = groupTracks([
      spotify('s1', 'Song', ['Artist']),
      spotify('s2', 'Song', ['Artist']),
      ytm('y1', 'Song', ['Artist']),
    ]);
    for (const g of groups) {
      expect(new Set(g.members.map((t) => t.platform)).size).toBe(g.members.length);
    }
  });
});
