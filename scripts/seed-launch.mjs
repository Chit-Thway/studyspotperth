import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createLaunchSql } from '../server/data/launch-libraries.ts';

// This command intentionally targets only Wrangler's normal local D1 database.
if (process.argv.length > 2) throw new Error('db:launch takes no arguments and only imports locally.');
await mkdir('.runtime-check', { recursive: true });
const sqlPath = resolve('.runtime-check/launch.sql');
await writeFile(sqlPath, createLaunchSql());
execFileSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'studyspotperth',
  '--local', '--file', sqlPath, '--yes'], { stdio: 'pipe' });
console.log('Imported initial library listings locally. Existing records and admin edits were preserved.');
