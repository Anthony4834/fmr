// Shared configuration for the extension
// API base URL is stored in local storage; only the popup enforces admin-only editing.

const DEFAULT_API_BASE_URL = 'https://fmr.fyi';

function isContextInvalidated(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Extension context invalidated/i.test(msg) || /context invalidated/i.test(msg);
}

/**
 * Get the API base URL. Reads from storage (no auth check here).
 * If extension context is invalidated (e.g. after reload), returns default without throwing.
 */
export async function getApiBaseUrl(): Promise<string> {
  try {
    return await new Promise((resolve) => {
      try {
        chrome.storage.local.get(['api_base_url'], (items) => {
          if (chrome.runtime?.lastError && isContextInvalidated(new Error(chrome.runtime.lastError.message))) {
            resolve(DEFAULT_API_BASE_URL);
            return;
          }
          resolve(items?.api_base_url || DEFAULT_API_BASE_URL);
        });
      } catch (e) {
        if (isContextInvalidated(e)) resolve(DEFAULT_API_BASE_URL);
        else throw e;
      }
    });
  } catch (e) {
    if (isContextInvalidated(e)) return DEFAULT_API_BASE_URL;
    throw e;
  }
}

/**
 * Set the API base URL. Caller (popup) must enforce admin-only.
 * No-ops if extension context is invalidated.
 */
export async function setApiBaseUrl(url: string): Promise<void> {
  try {
    return await new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set({ api_base_url: url }, () => {
          if (chrome.runtime?.lastError) {
            if (isContextInvalidated(new Error(chrome.runtime.lastError.message))) {
              resolve();
              return;
            }
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (e) {
        if (isContextInvalidated(e)) resolve();
        else reject(e);
      }
    });
  } catch (e) {
    if (isContextInvalidated(e)) return;
    throw e;
  }
}
