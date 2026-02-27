#!/usr/bin/env node
/**
 * Creates extension.zip from dist/ for Chrome Web Store upload.
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

if (version) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(sourceManifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Updated manifest version to ${version}`);
}

const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Created ${path.basename(outPath)} (${archive.pointer()} bytes)`);
  console.log('Upload this file to the Chrome Web Store developer dashboard.');
});

archive.on('error', (err) => {
  console.error('Archive error:', err);
  process.exit(1);
});

archive.pipe(output);
archive.directory(distDir, false);
archive.finalize();
