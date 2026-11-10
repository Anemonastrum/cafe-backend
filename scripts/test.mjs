import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const suite = process.argv[2];
if (!['unit', 'integration', 'concurrency'].includes(suite)) {
  console.error('Choose unit, integration or concurrency'); process.exit(1);
}
function collect(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const file = join(path, entry.name);
    return entry.isDirectory() ? collect(file) : entry.isFile() && file.endsWith('.test.js') ? [file] : [];
  }).sort();
}
const files = collect(`tests/${suite}`);
if (!files.length) { console.error(`No tests found for ${suite}`); process.exit(1); }
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
if (result.error) console.error('Test process failed to start');
process.exit(result.status ?? 1);
