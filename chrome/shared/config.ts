// Shared configuration for the extension
// API base URL is stored in local storage; only the popup enforces admin-only editing.

const DEFAULT_API_BASE_URL = 'https://fmr.fyi';

/**
 * Get the API base URL. Reads from storage (no auth check here).
 * Popup hides the API config UI for non-admin users; this just returns the stored or default URL.
 */
export async function getApiBaseUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['api_base_url'], (items) => {
      resolve(items.api_base_url || DEFAULT_API_BASE_URL);
    });
  });
}

/**
 * Set the API base URL. Caller (popup) must enforce admin-only.
 */
export async function setApiBaseUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ api_base_url: url }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}
