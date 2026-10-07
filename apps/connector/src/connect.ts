import { PLATFORM_LABELS, type Platform } from '@hovering/core';
import { ADAPTERS } from './adapters';

const platform = new URLSearchParams(location.search).get('platform') as Platform | null;
const adapter = platform ? ADAPTERS[platform] : undefined;
const $ = (id: string) => document.getElementById(id)!;

if (!platform || !adapter) {
  $('title').textContent = 'Unknown platform';
  $('grant').remove();
} else {
  const label = PLATFORM_LABELS[platform];
  $('title').textContent = `Connect ${label}`;
  $('why').textContent =
    `hovering.today reads your ${label} likes and playlists using the session you're already signed in with. ` +
    `Requests go only to ${new URL(adapter.origins[0]!.replace('/*', '/')).host}, from your browser. ` +
    `You can remove this access any time from Chrome's extension settings.`;
  $('grant').addEventListener('click', async () => {
    if (await chrome.permissions.request({ origins: adapter.origins })) {
      $('grant').remove();
      $('done').style.display = 'block';
    }
  });
}
