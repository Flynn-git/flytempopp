/**
 * Message protocol between hovering.today (the page) and the companion
 * connector extension.
 *
 * The page calls `chrome.runtime.sendMessage(extensionId, request)`; Chrome
 * only delivers it if the page's origin is listed under
 * `externally_connectable` in the extension manifest. The extension answers
 * with a `BridgeResponse`.
 */

import type { Collection, Platform, SourceTrack } from './model';

export const PROTOCOL_VERSION = 1;

export type BridgeRequest =
  | { type: 'hello' }
  | { type: 'status'; platform: Platform }
  /** Opens the extension's own consent page; Chrome only shows permission prompts from there. */
  | { type: 'connect'; platform: Platform }
  | { type: 'listCollections'; platform: Platform }
  | { type: 'listTracks'; platform: Platform; collectionId: string };

export interface PlatformStatus {
  platform: Platform;
  /** The connector has an adapter for this platform. */
  supported: boolean;
  /** The extension holds the host permission it needs for this platform. */
  permitted: boolean;
}

export interface HelloResult {
  protocolVersion: number;
  extensionVersion: string;
  platforms: Platform[];
}

export type BridgeResult<R extends BridgeRequest> = R extends { type: 'hello' }
  ? HelloResult
  : R extends { type: 'status' }
    ? PlatformStatus
    : R extends { type: 'connect' }
      ? { opened: true }
      : R extends { type: 'listCollections' }
        ? Collection[]
        : R extends { type: 'listTracks' }
          ? SourceTrack[]
          : never;

export type BridgeErrorCode =
  | 'unsupported_platform'
  | 'permission_required'
  | 'not_signed_in'
  | 'upstream_changed'
  | 'upstream_error'
  | 'bad_request';

export type BridgeResponse<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: { code: BridgeErrorCode; message: string } };

export class BridgeError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

const PLATFORM_SET = new Set<string>(['ytm', 'spotify', 'soundcloud']);

/** Validates an incoming message; the page origin is trusted, the payload shape is not. */
export function parseBridgeRequest(msg: unknown): BridgeRequest {
  if (typeof msg !== 'object' || msg === null) throw new BridgeError('bad_request', 'Not an object');
  const m = msg as Record<string, unknown>;
  switch (m.type) {
    case 'hello':
      return { type: 'hello' };
    case 'status':
    case 'connect':
    case 'listCollections':
      if (typeof m.platform !== 'string' || !PLATFORM_SET.has(m.platform))
        throw new BridgeError('bad_request', 'Unknown platform');
      return { type: m.type, platform: m.platform as Platform };
    case 'listTracks':
      if (typeof m.platform !== 'string' || !PLATFORM_SET.has(m.platform))
        throw new BridgeError('bad_request', 'Unknown platform');
      if (typeof m.collectionId !== 'string' || m.collectionId.length === 0 || m.collectionId.length > 256)
        throw new BridgeError('bad_request', 'Bad collectionId');
      return { type: 'listTracks', platform: m.platform as Platform, collectionId: m.collectionId };
    default:
      throw new BridgeError('bad_request', 'Unknown message type');
  }
}
