/**
 * scripts/fix-cjs-ext.mjs
 *
 * After `tsc` compiles the CJS build it emits `.js` files.
 * Node's "exports" map expects `.cjs` for CommonJS files when the
 * package root has `"type": "module"`. This script renames them.
 */

import { readdir, rename } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CJS_DIR = join(__dirname, '..', 'dist', 'cjs');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
    } else if (extname(entry.name) === '.js') {
      await rename(full, full.replace(/\.js$/, '.cjs'));
    }
  }
}

walk(CJS_DIR)
  .then(() => console.log('+++++ Renamed .js to .cjs in dist/cjs'))
  .catch((err) => { console.error(err); process.exit(1); });
