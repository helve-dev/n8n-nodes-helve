import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const pairs = [
  ['nodes/Helve/helve.svg', 'dist/nodes/Helve/helve.svg'],
];

for (const [src, dst] of pairs) {
  mkdirSync(dirname(resolve(dst)), { recursive: true });
  copyFileSync(resolve(src), resolve(dst));
}
