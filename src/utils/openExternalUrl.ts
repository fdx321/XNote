import { openUrl } from '@tauri-apps/plugin-opener';

export async function openExternalUrl(url: string) {
  if (!url) return;
  const isTauri = (window as any).__TAURI_INTERNALS__;

  if (!isTauri) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    await openUrl(url, 'Google Chrome');
    return;
  } catch {}

  try {
    await openUrl(url, 'chrome');
    return;
  } catch {}

  await openUrl(url);
}

