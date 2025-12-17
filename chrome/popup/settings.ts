// Settings management for the extension

import { ExtensionPreferences, DEFAULT_PREFERENCES } from '../shared/types';

/**
 * Get user preferences from Chrome storage
 */
export function getPreferences(): Promise<ExtensionPreferences> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_PREFERENCES, (items) => {
      resolve(items as ExtensionPreferences);
    });
  });
}

/**
 * Save user preferences to Chrome storage
 */
export function savePreferences(prefs: Partial<ExtensionPreferences>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(prefs, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Reset preferences to defaults
 */
export function resetPreferences(): Promise<void> {
  return savePreferences(DEFAULT_PREFERENCES);
}
