import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const pairs = [
  ['nodes/Helve/helve.svg', 'dist/nodes/Helve/helve.svg'],
  ['nodes/Helve/helve.dark.svg', 'dist/nodes/Helve/helve.dark.svg'],
  ['credentials/helve.svg', 'dist/credentials/helve.svg'],
  ['credentials/helve.dark.svg', 'dist/credentials/helve.dark.svg'],
];

for (const [src, dst] of pairs) {
  mkdirSync(dirname(resolve(dst)), { recursive: true });
  copyFileSync(resolve(src), resolve(dst));
}
