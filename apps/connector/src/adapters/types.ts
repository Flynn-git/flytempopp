import type { Collection, Platform, SourceTrack } from '@hovering/core';

/**
 * One platform's connector. Adapters run in the extension and use the
 * user's existing signed-in session on that platform's website, so there is
 * no developer-API quota or user cap involved and no tokens leave the browser.
 */
export interface SourceAdapter {
  platform: Platform;
  /** Origins the adapter needs host permission for. */
  origins: string[];
  listCollections(): Promise<Collection[]>;
  listTracks(collectionId: string): Promise<SourceTrack[]>;
}
