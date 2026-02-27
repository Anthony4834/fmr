#!/usr/bin/env node
/**
 * Creates extension.zip from dist/ for Chrome Web Store upload.
 * Chrome Web Store requires: manifest.json at the ROOT of the zip (no parent folder),
 * and all paths use forward slashes.
 *
 * Run from chrome/ directory: bun run package:store
 * Optionally pass --version or --v to set version before zipping:
 *   bun run package:store -- --version 1.4.0
 *   bun run package:store -- -v 1.4.0
 */
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const args = process.argv.slice(2);
let version = null;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--version' || args[i] === '-v' || args[i] === '--v') && args[i + 1]) {
    version = args[i + 1];
    break;
  }
}

const chromeDir = path.join(__dirname, '..');
const distDir = path.join(chromeDir, 'dist');
const manifestPath = path.join(distDir, 'manifest.json');
const sourceManifestPath = path.join(chromeDir, 'manifest.json');
const outPath = path.join(chromeDir, 'extension.zip');

if (!fs.existsSync(distDir)) {
  console.error('Error: dist/ not found. Run "bun run build" first.');
  process.exit(1);
}

if (!fs.existsSync(manifestPath)) {
  console.error('Error: dist/manifest.json not found.');
  process.exit(1);
}

if (version) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(sourceManifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Updated manifest version to ${version}`);
}

const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

const entryNames = [];

archive.on('entry', (entry) => {
  const name = entry.name.replace(/\\/g, '/');
  entryNames.push(name);
});

output.on('close', () => {
  const hasManifestAtRoot = entryNames.some((n) => {
    const norm = n.replace(/\\/g, '/').replace(/\/$/, '');
    return norm === 'manifest.json';
  });
  const hasDistPrefix = entryNames.some((n) => n.startsWith('dist/') || n.startsWith('dist\\'));
  if (!hasManifestAtRoot) {
    console.error('ERROR: manifest.json is not at zip root. Root entries:', entryNames.filter((n) => !n.includes('/')));
    process.exit(1);
  }
  if (hasDistPrefix) {
    console.error('ERROR: Zip contains "dist/" prefix. Chrome Web Store expects files at root.');
    process.exit(1);
  }
  console.log(`Created ${path.basename(outPath)} (${archive.pointer()} bytes)`);
  console.log('Zip root: manifest.json, popup/, background/, content/, assets/');
  console.log('Upload this file to the Chrome Web Store developer dashboard.');
});

archive.on('error', (err) => {
  console.error('Archive error:', err);
  process.exit(1);
});

archive.pipe(output);

// Add contents of dist/ at the root of the zip (no "dist" folder inside the zip).
// Use glob so paths are explicit and normalized (forward slashes, no platform variance).
archive.glob('**/*', {
  cwd: distDir,
  dot: false,
  ignore: ['.gitkeep', '*.map', '.DS_Store', 'Thumbs.db'],
});

archive.finalize();
