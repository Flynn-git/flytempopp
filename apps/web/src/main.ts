import './style.css';
import {
  PLATFORM_LABELS,
  groupTracks,
  type CollectionSnapshot,
  type Platform,
  type SourceTrack,
  type TrackGroup,
} from '@hovering/core';
import { deletePlatform, loadSnapshots, saveSnapshots } from './db';
import { importSpotifyExport } from './importers/spotify-export';
import { GOOGLE_CLIENT_ID, YouTubeError, loadGoogle, requestToken, syncYouTube } from './importers/youtube';

// ---------- state ----------

interface State {
  snapshots: CollectionSnapshot[];
  groups: TrackGroup[];
  /** Google Identity Services, once loaded; needed synchronously in the sign-in click. */
  google: Awaited<ReturnType<typeof loadGoogle>> | null;
  busy: Partial<Record<Platform, string>>;
  errors: Partial<Record<Platform, string>>;
  filter: 'all' | `missing:${Platform}`;
  query: string;
}

const state: State = {
  snapshots: [],
  groups: [],
  google: null,
  busy: {},
  errors: {},
  filter: 'all',
  query: '',
};

const MAX_ROWS = 500;

// ---------- tiny DOM helper (text is always set as text, never HTML) ----------

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string | boolean | EventListener>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

// ---------- data ----------

function platformsWithData(): Platform[] {
  return [...new Set(state.snapshots.map((s) => s.collection.platform))];
}

function regroup() {
  state.groups = groupTracks(state.snapshots.flatMap((s) => s.tracks));
}

async function reload() {
  state.snapshots = await loadSnapshots();
  regroup();
  render();
}

function describeError(e: unknown): string {
  if (e instanceof YouTubeError && e.code === 'cancelled') return 'Sign-in was cancelled.';
  return e instanceof Error ? e.message : String(e);
}

async function syncYtm() {
  state.errors.ytm = undefined;
  if (!state.google) return;
  // Request the token first, still inside the click, so the popup isn't blocked.
  const tokenPromise = requestToken(state.google);
  state.busy.ytm = 'Waiting for Google sign-in…';
  render();
  try {
    const token = await tokenPromise; // kept only for this sync; it expires within the hour
    const snapshots = await syncYouTube({
      token,
      onProgress: (m) => {
        state.busy.ytm = m;
        render();
      },
    });
    await deletePlatform('ytm');
    await saveSnapshots(snapshots);
  } catch (e) {
    state.errors.ytm = describeError(e);
  } finally {
    state.busy.ytm = undefined;
    await reload();
  }
}

async function importSpotify(files: File[]) {
  state.errors.spotify = undefined;
  state.busy.spotify = 'Importing…';
  render();
  try {
    const snapshots = await importSpotifyExport(files);
    if (snapshots.length === 0) {
      throw new Error('No YourLibrary.json or Playlist*.json found. Use the “Account data” export from Spotify.');
    }
    await deletePlatform('spotify');
    await saveSnapshots(snapshots);
  } catch (e) {
    state.errors.spotify = describeError(e);
  } finally {
    state.busy.spotify = undefined;
    await reload();
  }
}

async function removePlatform(p: Platform) {
  await deletePlatform(p);
  if (state.filter === `missing:${p}`) state.filter = 'all';
  await reload();
}

// ---------- views ----------

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function summary(p: Platform): Child {
  const snaps = state.snapshots.filter((s) => s.collection.platform === p);
  if (snaps.length === 0) return null;
  const tracks = new Set(snaps.flatMap((s) => s.tracks.map((t) => t.id))).size;
  const likes = snaps.find((s) => s.collection.kind === 'likes');
  const playlists = snaps.filter((s) => s.collection.kind === 'playlist').length;
  return h(
    'p',
    { class: 'summary' },
    `${plural(tracks, 'song')} · ${likes ? `${likes.tracks.length.toLocaleString()} liked · ` : ''}${plural(playlists, 'playlist')}`,
    h('button', { class: 'link', onclick: () => removePlatform(p) }, 'Remove'),
  );
}

function status(p: Platform): Child {
  if (state.busy[p]) return h('p', { class: 'busy' }, state.busy[p]!);
  if (state.errors[p]) return h('p', { class: 'error' }, state.errors[p]!);
  return null;
}

function ytmCard(): HTMLElement {
  const hasData = state.snapshots.some((s) => s.collection.platform === 'ytm');
  let action: Child;
  if (!GOOGLE_CLIENT_ID) {
    action = h('p', { class: 'hint' }, 'Google sign-in isn’t set up on this site yet.');
  } else {
    action = h(
      'button',
      { onclick: syncYtm, disabled: !state.google || !!state.busy.ytm },
      hasData ? 'Sync again' : 'Sign in with Google',
    );
  }
  return h(
    'section',
    { class: 'card ytm' },
    h('h3', {}, PLATFORM_LABELS.ytm),
    h(
      'p',
      { class: 'hint' },
      'Read-only access to your liked music and playlists, kept only in this browser. Uses YouTube API Services; by signing in you agree to the ',
      h('a', { href: 'https://www.youtube.com/t/terms', target: '_blank', rel: 'noopener' }, 'YouTube Terms of Service'),
      '.',
    ),
    action,
    status('ytm'),
    summary('ytm'),
  );
}

function spotifyCard(): HTMLElement {
  const input = h('input', {
    type: 'file',
    accept: '.zip,.json,application/zip,application/json',
    multiple: true,
    onchange: (e: Event) => {
      const files = [...((e.target as HTMLInputElement).files ?? [])];
      if (files.length) void importSpotify(files);
    },
  });
  return h(
    'section',
    { class: 'card spotify' },
    h('h3', {}, PLATFORM_LABELS.spotify),
    h(
      'p',
      { class: 'hint' },
      'Request “Account data” at ',
      h('a', { href: 'https://www.spotify.com/account/privacy/', target: '_blank', rel: 'noopener' }, 'spotify.com/account/privacy'),
      ', then drop the zip here. Spotify usually sends it within a few days.',
    ),
    h('label', { class: 'button' }, 'Import export', input),
    status('spotify'),
    summary('spotify'),
  );
}

function soundcloudCard(): HTMLElement {
  return h(
    'section',
    { class: 'card soundcloud' },
    h('h3', {}, PLATFORM_LABELS.soundcloud),
    h('p', { class: 'hint' }, 'Coming next: sign in with SoundCloud to bring in your likes and playlists.'),
    h('button', { disabled: true }, 'Sign in with SoundCloud'),
  );
}

function platformBadge(t: SourceTrack): HTMLElement {
  const label = PLATFORM_LABELS[t.platform];
  return t.url
    ? h('a', { class: `badge ${t.platform}`, href: t.url, target: '_blank', rel: 'noopener', title: `Open on ${label}` }, label)
    : h('span', { class: `badge ${t.platform}` }, label);
}

function visibleGroups(): TrackGroup[] {
  const q = state.query.trim().toLowerCase();
  return state.groups.filter((g) => {
    if (state.filter !== 'all') {
      const missing = state.filter.slice('missing:'.length);
      if (g.members.some((t) => t.platform === missing)) return false;
    }
    if (q) {
      const t = g.members[0]!;
      if (!`${t.title} ${t.artists.join(' ')}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function library(): HTMLElement {
  const platforms = platformsWithData();
  if (platforms.length === 0) {
    return h('section', { class: 'library empty' }, h('p', {}, 'Bring in a library above to see everything in one place.'));
  }
  const groups = visibleGroups();
  const multi = state.groups.filter((g) => g.members.length > 1).length;

  const filter = h(
    'select',
    {
      'aria-label': 'Filter',
      onchange: (e: Event) => {
        state.filter = (e.target as HTMLSelectElement).value as State['filter'];
        render();
      },
    },
    h('option', { value: 'all', selected: state.filter === 'all' }, 'All songs'),
    ...(platforms.length > 1
      ? platforms.map((p) => h('option', { value: `missing:${p}`, selected: state.filter === `missing:${p}` }, `Not on ${PLATFORM_LABELS[p]}`))
      : []),
  );
  const search = h('input', {
    type: 'search',
    placeholder: 'Search songs or artists',
    value: state.query,
    oninput: (e: Event) => {
      state.query = (e.target as HTMLInputElement).value;
      renderLibraryOnly();
    },
  });

  const rows = groups.slice(0, MAX_ROWS).map((g) => {
    const t = g.members[0]!;
    return h(
      'tr',
      {},
      h('td', {}, t.title),
      h('td', {}, t.artists.join(', ')),
      h(
        'td',
        { class: 'platforms' },
        ...g.members.map(platformBadge),
        g.confidence === 'probable' ? h('span', { class: 'unsure', title: 'Probably the same song. Check before relying on it.' }, '?') : null,
      ),
    );
  });

  return h(
    'section',
    { class: 'library' },
    h(
      'div',
      { class: 'toolbar' },
      h('h2', {}, 'Your library'),
      h('span', { class: 'muted' }, `${plural(state.groups.length, 'song')} · ${multi.toLocaleString()} on more than one platform`),
      h('div', { class: 'controls' }, search, filter),
    ),
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Song'), h('th', {}, 'Artist'), h('th', {}, 'On'))),
      h('tbody', {}, ...rows),
    ),
    groups.length > MAX_ROWS
      ? h('p', { class: 'muted' }, `Showing ${MAX_ROWS} of ${groups.length.toLocaleString()}. Search to narrow it down.`)
      : groups.length === 0
        ? h('p', { class: 'muted' }, 'Nothing matches.')
        : null,
  );
}

// ---------- render ----------

const root = document.getElementById('app')!;

function renderLibraryOnly() {
  const old = root.querySelector('section.library');
  const fresh = library();
  if (old) old.replaceWith(fresh);
  const input = fresh.querySelector('input[type=search]') as HTMLInputElement | null;
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
}

function render() {
  root.replaceChildren(
    h(
      'header',
      {},
      h('h1', {}, 'hovering.today'),
      h('p', { class: 'tagline' }, 'Your likes and playlists from YouTube Music, Spotify and SoundCloud, in one place.'),
    ),
    h('div', { class: 'sources' }, ytmCard(), spotifyCard(), soundcloudCard()),
    library(),
    h(
      'footer',
      {},
      'Everything stays in this browser. ',
      h('a', { href: '/privacy.html' }, 'Privacy'),
    ),
  );
}

render();
void reload();
if (GOOGLE_CLIENT_ID) {
  loadGoogle()
    .then((g) => {
      state.google = g;
      render();
    })
    .catch((e) => {
      state.errors.ytm = describeError(e);
      render();
    });
}
