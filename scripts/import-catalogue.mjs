import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createCataloguePlan, parseCatalogueImport } from '../server/data/catalogue-import.ts';
import { readCatalogueFiles } from '../server/data/catalogue-files.ts';
import { createCatalogueMetadataLinks } from '../server/data/catalogue-metadata.ts';

const args = process.argv.slice(2);
const fromFolders = args[0] === '--catalogue' && args.length <= 4 && new Set(args).size === args.length && args.slice(1).every((arg) => ['--apply', '--link-suburbs', '--link-sizes'].includes(arg));
const fromFile = args[0] === '--file' && [2, 3].includes(args.length) && (args.length === 2 || args[2] === '--apply');
if (!fromFolders && !fromFile) throw new Error('Use npm run db:catalogue -- --catalogue [--link-suburbs] [--link-sizes] [--apply], or --file <manifest.json> [--apply]. Only local D1 is targeted.');
const apply = args.includes('--apply');
let catalogue;
if (fromFolders) ({ catalogue } = await readCatalogueFiles());
else {
  const file = resolve(args[1]);
  if ((await stat(file)).size > 5_000_000) throw new Error('The catalogue manifest must be at most 5 MB.');
  catalogue = parseCatalogueImport(JSON.parse(await readFile(file, 'utf8')));
}
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
const metadata = args.includes('--link-suburbs') || args.includes('--link-sizes') ? createCatalogueMetadataLinks(catalogue,
  query("SELECT l.id,l.slug,r.id AS revisionId,r.content FROM library l JOIN library_revision r ON r.library_id=l.id WHERE l.is_fixture=0 AND r.status='published' AND r.rowid=(SELECT MAX(last.rowid) FROM library_revision last WHERE last.library_id=l.id)"),
  { suburbs: args.includes('--link-suburbs'), sizes: args.includes('--link-sizes') }) : { statements: [], linkedSuburbs: [], linkedSizes: [] };
for (const library of plan.libraries) for (const photo of library.content.photos) if (!fromFolders && photo.url.startsWith('/images/libraries/')) {
  await stat(resolve('public', photo.url.slice(1)));
}
console.log(JSON.stringify({ mode: apply ? 'apply-local-drafts' : 'preview',
  newLibraries: plan.libraries.map((library) => library.slug), newSuburbs: plan.suburbs.map((suburb) => suburb.id),
  physicalSuburbLinks: metadata.linkedSuburbs, sizeLinks: metadata.linkedSizes,
  preservedLibraries: plan.skipped }, null, 2));
if (apply && (plan.statements.length || metadata.statements.length)) {
  const sqlFile = resolve('.runtime-check/catalogue-import.sql');
  await writeFile(sqlFile, [...plan.statements, ...metadata.statements].join('\n'));
  execute(['--file', sqlFile, '--yes']);
  console.log('Imported missing records as local drafts. Requested suburb and size links preserve existing facts. Review and publish new drafts through Manage libraries.');
} else if (!apply) console.log('Preview only. Add --apply to import missing records as local drafts.');
