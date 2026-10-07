import type { Platform } from '@hovering/core';
import type { SourceAdapter } from './types';
import { ytmAdapter } from './ytm';

/**
 * Platforms the connector reads through the user's web session.
 *
 * Not here on purpose:
 * - SoundCloud has a usable official OAuth API, so hovering.today talks to it directly.
 * - Spotify's developer API caps unreviewed apps at 5 users, so for now the site
 *   imports Spotify's own data export. A session adapter can be added here later.
 */
export const ADAPTERS: Partial<Record<Platform, SourceAdapter>> = {
  ytm: ytmAdapter,
};
