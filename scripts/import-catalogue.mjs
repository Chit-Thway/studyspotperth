import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createCataloguePlan, parseCatalogueImport } from '../server/data/catalogue-import.ts';

const args = process.argv.slice(2);
if (![2, 3].includes(args.length) || args[0] !== '--file' || args.length === 3 && args[2] !== '--apply') {
  throw new Error('Use npm run db:catalogue -- --file <manifest.json> [--apply]. This command only targets local D1.');
}
const file = resolve(args[1]);
if ((await stat(file)).size > 5_000_000) throw new Error('The catalogue manifest must be at most 5 MB.');
const catalogue = parseCatalogueImport(JSON.parse(await readFile(file, 'utf8')));
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
await mkdir('.runtime-check/wrangler-logs', { recursive: true });
const commandEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: resolve('.runtime-check/wrangler-logs') };
const execute = (extra) => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'studyspotperth', '--local', ...extra],
  { env: commandEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const query = (sql) => JSON.parse(execute(['--command', sql, '--json']))[0].results;
const existingLibraries = query('SELECT id,slug,institution_id AS institution,is_fixture AS isFixture FROM library')
  .map((library) => ({ ...library, isFixture: Boolean(library.isFixture) }));
const existingSuburbs = query('SELECT id,name,latitude,longitude,is_fixture AS isFixture FROM suburb')
  .map((suburb) => ({ ...suburb, isFixture: Boolean(suburb.isFixture) }));
const plan = createCataloguePlan(catalogue, existingLibraries, existingSuburbs);
for (const library of plan.libraries) for (const photo of library.content.photos) if (photo.url.startsWith('/images/libraries/')) {
  await stat(resolve('public', photo.url.slice(1)));
}
console.log(JSON.stringify({ mode: args[2] === '--apply' ? 'apply-local-drafts' : 'preview',
  newLibraries: plan.libraries.map((library) => library.slug), newSuburbs: plan.suburbs.map((suburb) => suburb.id),
  preservedLibraries: plan.skipped }, null, 2));
if (args[2] === '--apply' && plan.statements.length) {
  const sqlFile = resolve('.runtime-check/catalogue-import.sql');
  await writeFile(sqlFile, plan.statements.join('\n'));
  execute(['--file', sqlFile, '--yes']);
  console.log('Imported missing records as local drafts. Review and publish through Manage libraries.');
} else if (args[2] !== '--apply') console.log('Preview only. Add --apply to import missing records as local drafts.');
