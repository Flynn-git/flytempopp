/**
 * YouTube Music adapter.
 *
 * There is no public API for YouTube Music libraries, so we do what the
 * music.youtube.com page itself does: call its internal `youtubei/v1/browse`
 * endpoint from inside a music.youtube.com tab, signed with the user's own
 * session. Requests run in the page's origin, so cookies and auth headers
 * are the ones the site already uses; nothing is sent anywhere else.
 */

import { BridgeError, type Collection, type SourceTrack } from '@hovering/core';
import type { SourceAdapter } from './types';
import { parseContinuation, parsePlaylists, parseTracks } from './ytm-parse';

const ORIGIN = 'https://music.youtube.com';
const MAX_PAGES = 200; // ~20k tracks; guards against a continuation loop
const PAGE_DELAY_MS = 250; // be polite: one request at a time, small gap
const IDLE_CLOSE_MS = 30_000;

type BrowseBody = { browseId: string } | { continuation: string };
type PageResult = { ok: true; json: unknown } | { ok: false; code: 'not_signed_in' | 'not_ready' | 'http'; status?: number };

/**
 * Runs inside the music.youtube.com page (MAIN world). Must be
 * self-contained: Chrome serializes the function source, not its closure.
 */
async function browseInPage(body: BrowseBody): Promise<PageResult> {
  const w = window as unknown as { ytcfg?: { data_?: Record<string, unknown> } };
  for (let i = 0; i < 50 && !w.ytcfg?.data_?.INNERTUBE_API_KEY; i++) await new Promise((r) => setTimeout(r, 200));
  const cfg = w.ytcfg?.data_;
  if (!cfg?.INNERTUBE_API_KEY) return { ok: false, code: 'not_ready' };
  if (cfg.LOGGED_IN === false) return { ok: false, code: 'not_signed_in' };

  const cookie = (name: string) =>
    document.cookie.split('; ').find((c) => c.startsWith(name + '='))?.slice(name.length + 1);
  const sapisid = cookie('SAPISID') ?? cookie('__Secure-3PAPISID');
  if (!sapisid) return { ok: false, code: 'not_signed_in' };

  const ts = Math.floor(Date.now() / 1000);
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sapisid} ${location.origin}`));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const res = await fetch(`/youtubei/v1/browse?prettyPrint=false`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SAPISIDHASH ${ts}_${hash}`,
      'X-Origin': location.origin,
      'X-Goog-AuthUser': String(cfg.SESSION_INDEX ?? 0),
    },
    body: JSON.stringify({ context: cfg.INNERTUBE_CONTEXT, ...body }),
  });
  if (res.status === 401 || res.status === 403) return { ok: false, code: 'not_signed_in' };
  if (!res.ok) return { ok: false, code: 'http', status: res.status };
  return { ok: true, json: await res.json() };
}

let ownedTabId: number | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

async function waitForComplete(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;
  await new Promise<void>((resolve) => {
    const listener = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Reuse an open music.youtube.com tab, or open a background one we close when idle. */
async function getTab(): Promise<number> {
  if (closeTimer) clearTimeout(closeTimer);
  const [existing] = await chrome.tabs.query({ url: `${ORIGIN}/*` });
  if (existing?.id !== undefined) return existing.id;
  if (ownedTabId !== undefined) {
    try {
      await chrome.tabs.get(ownedTabId);
      return ownedTabId;
    } catch {
      ownedTabId = undefined;
    }
  }
  const tab = await chrome.tabs.create({ url: `${ORIGIN}/`, active: false });
  ownedTabId = tab.id!;
  await waitForComplete(ownedTabId);
  return ownedTabId;
}

function scheduleClose() {
  if (ownedTabId === undefined) return;
  const id = ownedTabId;
  closeTimer = setTimeout(() => {
    ownedTabId = undefined;
    chrome.tabs.remove(id).catch(() => {});
  }, IDLE_CLOSE_MS);
}

async function browse(body: BrowseBody): Promise<unknown> {
  const tabId = await getTab();
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: browseInPage,
    args: [body],
  });
  const result = injection?.result as PageResult | undefined;
  if (!result) throw new BridgeError('upstream_error', 'YouTube Music page did not respond');
  if (!result.ok) {
    if (result.code === 'not_signed_in') throw new BridgeError('not_signed_in', 'Sign in to music.youtube.com first');
    if (result.code === 'not_ready') throw new BridgeError('upstream_changed', 'YouTube Music page config not found');
    throw new BridgeError('upstream_error', `YouTube Music returned HTTP ${result.status}`);
  }
  return result.json;
}

/** Fetch a browse page and follow continuations, collecting with `parse`. */
async function browseAll<T>(browseId: string, parse: (json: unknown) => T[]): Promise<T[]> {
  try {
    let json = await browse({ browseId });
    const out = parse(json);
    for (let page = 1; page < MAX_PAGES; page++) {
      const token = parseContinuation(json);
      if (!token) break;
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      json = await browse({ continuation: token });
      out.push(...parse(json));
    }
    return out;
  } finally {
    scheduleClose();
  }
}

export const ytmAdapter: SourceAdapter = {
  platform: 'ytm',
  origins: [`${ORIGIN}/*`],

  async listCollections(): Promise<Collection[]> {
    const playlists = await browseAll('FEmusic_liked_playlists', parsePlaylists);
    const likes: Collection = {
      platform: 'ytm',
      id: 'LM',
      kind: 'likes',
      name: 'Liked music',
      url: `${ORIGIN}/playlist?list=LM`,
    };
    return [likes, ...playlists];
  },

  async listTracks(collectionId: string): Promise<SourceTrack[]> {
    if (!/^[\w-]+$/.test(collectionId)) throw new BridgeError('bad_request', 'Bad playlist ID');
    const tracks = await browseAll(`VL${collectionId}`, parseTracks);
    // Continuation pages can repeat a row at the seam; keep first occurrence.
    const seen = new Set<string>();
    return tracks.filter((t) => !seen.has(t.id) && seen.add(t.id));
  },
};
