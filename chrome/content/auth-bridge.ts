// Content script bridge for auth page
// Listens for postMessage from the auth page and forwards to extension

console.log('[FMR Auth Bridge] Content script loaded on:', window.location.href);

window.addEventListener('message', (event: MessageEvent) => {
  // Only accept messages from same origin
  if (event.origin !== window.location.origin) {
    return;
  }

  // Forward auth messages to extension
  if (event.data && (event.data.type === 'EXTENSION_AUTH_SUCCESS' || event.data.type === 'EXTENSION_AUTH_ERROR')) {
    console.log('[FMR Auth Bridge] Received auth message:', event.data.type);
    chrome.runtime.sendMessage(event.data)
      .then((response) => {
        console.log('[FMR Auth Bridge] Message sent successfully, response:', response);
      })
      .catch((error) => {
        console.error('[FMR Auth Bridge] Failed to send auth message to extension:', error);
      });
  }
});
