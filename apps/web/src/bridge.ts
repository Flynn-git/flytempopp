/**
 * Talks to the companion connector extension.
 *
 * `chrome.runtime.sendMessage` only exists on a page when some installed
 * extension lists that page in `externally_connectable`, so its absence means
 * "connector not installed". The extension ID comes from VITE_CONNECTOR_ID
 * (see apps/web/.env.example).
 */

import type { BridgeRequest, BridgeResponse, BridgeResult, HelloResult } from '@hovering/core';

export const CONNECTOR_ID: string | undefined = import.meta.env.VITE_CONNECTOR_ID || undefined;

interface ChromeRuntime {
  sendMessage(id: string, msg: unknown, cb: (res: unknown) => void): void;
  lastError?: { message?: string };
}

function runtime(): ChromeRuntime | undefined {
  return (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
}

export class ConnectorError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function send<R extends BridgeRequest>(req: R): Promise<BridgeResult<R>> {
  const rt = runtime();
  if (!CONNECTOR_ID || !rt?.sendMessage) {
    return Promise.reject(new ConnectorError('not_installed', 'The hovering.today connector is not installed'));
  }
  return new Promise((resolve, reject) => {
    rt.sendMessage(CONNECTOR_ID, req, (res) => {
      if (rt.lastError || res === undefined) {
        reject(new ConnectorError('not_installed', rt.lastError?.message ?? 'No response from the connector'));
        return;
      }
      const r = res as BridgeResponse<BridgeResult<R>>;
      if (r.ok) resolve(r.result);
      else reject(new ConnectorError(r.error.code, r.error.message));
    });
  });
}

export async function hello(): Promise<HelloResult | null> {
  try {
    return await send({ type: 'hello' });
  } catch {
    return null;
  }
}
