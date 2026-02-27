# FMR.fyi Chrome Extension

Chrome extension for viewing FMR data and cash flow calculations directly on real estate listings.

## Development

### Prerequisites

- Bun (https://bun.sh)
- TypeScript (will be installed via Bun)

### Setup

1. Install dependencies:
```bash
bun install
```

2. Build the extension:
```bash
bun run build
```

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `chrome/dist` directory

### Development Mode

For development with watch mode:
```bash
bun run dev
```

This will watch for file changes and rebuild automatically.

## Building

The build process:
1. Compiles TypeScript files to JavaScript
2. Bundles content scripts, background service worker, and popup
3. Copies static assets (HTML, CSS, icons, manifest.json) to `dist/`

## Project Structure

```
chrome/
├── manifest.json          # Extension manifest
├── content/              # Content scripts
│   ├── content-script.ts # Main content script
│   ├── address-detector.ts
│   ├── property-detector.ts
│   ├── badge.tsx
│   └── mini-view.tsx
├── background/           # Background service worker
│   └── service-worker.ts
├── popup/                # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   ├── popup.ts
│   └── settings.ts
├── shared/               # Shared utilities
│   ├── types.ts
│   ├── api-client.ts
│   └── cashflow.ts
├── assets/               # Static assets
│   ├── icons/
│   └── styles.css
└── dist/                 # Built extension (generated)
```

## Publishing

To publish to the Chrome Web Store, you **must** package the **built** extension from `dist/`, not the source folder. Otherwise Sign In and other features will not work.

1. Build the extension:
```bash
bun run build
```

2. Create a zip for store upload:
```bash
bun run package:store
```
This creates `extension.zip` from the contents of `dist/`.

3. Upload `extension.zip` to the Chrome Web Store developer dashboard.

## Notes

- The extension uses the main app's API at `https://fmr.fyi`
- For local development, you may need to update the API base URL in `shared/api-client.ts`
- **Icon files required**: You need to create actual PNG icon files:
  - `assets/icons/icon16.png` (16x16 pixels)
  - `assets/icons/icon48.png` (48x48 pixels)
  - `assets/icons/icon128.png` (128x128 pixels)
- The popup is built from `popup.ts` via Webpack; the output is `dist/popup/popup.js`
