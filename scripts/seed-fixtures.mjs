import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createFixtureSql } from '../tests/fixtures/libraries.ts';

await mkdir('.runtime-check', { recursive: true });
const fixturePath = resolve('.runtime-check/fixtures.sql');
await writeFile(fixturePath, createFixtureSql());
execFileSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'studyspotperth',
  '--local', '--file', fixturePath, '--yes'], { stdio: 'pipe' });
console.log('Loaded fictional local fixtures. Public reads exclude them by default.');
