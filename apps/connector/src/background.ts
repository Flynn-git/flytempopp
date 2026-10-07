import {
  BridgeError,
  PLATFORMS,
  PROTOCOL_VERSION,
  parseBridgeRequest,
  type BridgeRequest,
  type BridgeResponse,
  type HelloResult,
  type PlatformStatus,
} from '@hovering/core';
import { ADAPTERS } from './adapters';

/** Injected by build.mjs from origins.json; matches the manifest's externally_connectable. */
declare const __ALLOWED_ORIGINS__: string[];
const allowedOrigins = new Set(__ALLOWED_ORIGINS__);

function adapterFor(platform: BridgeRequest & { platform: unknown }) {
  const adapter = ADAPTERS[platform.platform as keyof typeof ADAPTERS];
  if (!adapter) throw new BridgeError('unsupported_platform', `The connector does not read ${platform.platform}`);
  return adapter;
}

async function handle(req: BridgeRequest): Promise<unknown> {
  switch (req.type) {
    case 'hello': {
      const result: HelloResult = {
        protocolVersion: PROTOCOL_VERSION,
        extensionVersion: chrome.runtime.getManifest().version,
        platforms: PLATFORMS.filter((p) => ADAPTERS[p]),
      };
      return result;
    }
    case 'status': {
      const adapter = ADAPTERS[req.platform];
      const status: PlatformStatus = {
        platform: req.platform,
        supported: !!adapter,
        permitted: adapter ? await chrome.permissions.contains({ origins: adapter.origins }) : false,
      };
      return status;
    }
    case 'connect': {
      adapterFor(req);
      await chrome.tabs.create({ url: chrome.runtime.getURL(`connect.html?platform=${req.platform}`) });
      return { opened: true };
    }
    case 'listCollections':
    case 'listTracks': {
      const adapter = adapterFor(req);
      if (!(await chrome.permissions.contains({ origins: adapter.origins }))) {
        throw new BridgeError('permission_required', 'Grant the connector access first');
      }
      return req.type === 'listCollections' ? adapter.listCollections() : adapter.listTracks(req.collectionId);
    }
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // Chrome already enforces externally_connectable; this double-checks the exact origin.
  if (!sender.origin || !allowedOrigins.has(sender.origin)) return false;

  (async (): Promise<BridgeResponse> => {
    try {
      return { ok: true, result: await handle(parseBridgeRequest(msg)) };
    } catch (e) {
      if (e instanceof BridgeError) return { ok: false, error: { code: e.code, message: e.message } };
      console.error(e);
      return { ok: false, error: { code: 'upstream_error', message: e instanceof Error ? e.message : String(e) } };
    }
  })().then(sendResponse);
  return true; // keep the channel open for the async response
});
