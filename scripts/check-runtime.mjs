import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createFixtureSql } from '../tests/fixtures/libraries.ts';

const portServer = createServer();
await new Promise((resolvePort, reject) => {
  portServer.once('error', reject);
  portServer.listen(0, '127.0.0.1', resolvePort);
});
const address = portServer.address();
assert(address && typeof address !== 'string');
const port = address.port;
await new Promise((close) => portServer.close(close));
const origin = `http://127.0.0.1:${port}`;
await mkdir(resolve('.runtime-check'), { recursive: true });
const workDir = await mkdtemp(resolve('.runtime-check/run-'));
await cp(resolve('functions'), `${workDir}/functions`, { recursive: true });
await cp(resolve('server'), `${workDir}/server`, { recursive: true });
await cp(resolve('src/domain'), `${workDir}/src/domain`, { recursive: true });
await cp(resolve('tests/fixtures'), `${workDir}/tests/fixtures`, { recursive: true });
await cp(resolve('migrations'), `${workDir}/migrations`, { recursive: true });
await cp(resolve('tests/runtime/library-data-check.ts'), `${workDir}/functions/api/_data-check.ts`);
await cp(resolve('tests/runtime/library-search-check.ts'), `${workDir}/functions/api/_search-check.ts`);
await cp(resolve('dist'), `${workDir}/dist`, { recursive: true });
await writeFile(`${workDir}/package.json`, JSON.stringify({ name: 'studyspotperth-runtime-check', private: true, type: 'module' }));
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
config.pages_build_output_dir = './dist';
config.vars.AUTH_BASE_URL = origin;
await writeFile(`${workDir}/wrangler.jsonc`, JSON.stringify(config));
await writeFile(`${workDir}/.dev.vars`, `AUTH_SECRET=${randomBytes(32).toString('hex')}\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n`, { mode: 0o600 });
await writeFile(`${workDir}/fixtures.sql`, createFixtureSql());
const wranglerPath = resolve('node_modules/wrangler/bin/wrangler.js');
const runtimeEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false', BROWSER: 'none', CI: '1' };
// Run twice to prove migration replay and deterministic fixture loading are safe.
for (let replay = 0; replay < 2; replay++) {
  execFileSync(process.execPath, [wranglerPath, 'd1', 'migrations', 'apply', 'studyspotperth', '--local', '--persist-to', `${workDir}/state`],
    { cwd: workDir, env: runtimeEnv, stdio: 'pipe' });
  execFileSync(process.execPath, [wranglerPath, 'd1', 'execute', 'studyspotperth', '--local', '--persist-to', `${workDir}/state`, '--file', 'fixtures.sql', '--yes'],
    { cwd: workDir, env: runtimeEnv, stdio: 'pipe' });
}

const child = spawn(process.execPath, [
  wranglerPath, 'pages', 'dev', 'dist',
  '--ip', '127.0.0.1', '--port', String(port),
  '--persist-to', `${workDir}/state`,
], { cwd: workDir, env: runtimeEnv, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (chunk) => { output += String(chunk); });
child.stderr.on('data', (chunk) => { output += String(chunk); });
let launchError;
child.on('error', (error) => { launchError = error; });

try {
  let health;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`Pages exited before startup (code ${child.exitCode}).`);
    try { health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2_000) }); } catch { /* Wait for the runtime to bind. */ }
    if (health?.ok) break;
    await delay(250);
  }
  assert(health?.ok, 'Pages runtime did not become healthy within 60 seconds.');
  assert.deepEqual(await health.json(), { status: 'ok', database: 'connected', timeZone: 'Australia/Perth' });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const wrongMethod = await fetch(`${origin}/api/health`, { method: 'POST' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET');

  const auth = await fetch(`${origin}/api/auth/ok`);
  assert.equal(auth.status, 200, 'Better Auth did not initialise in the Pages runtime.');
  assert.deepEqual(await auth.json(), { ok: true });
  const inactiveAuth = await fetch(`${origin}/api/auth/sign-in/social`, { method: 'POST' });
  assert.equal(inactiveAuth.status, 404, 'Account endpoints must remain disabled.');

  for (const path of ['/', '/a-page-that-does-not-exist']) {
    const page = await fetch(`${origin}${path}`);
    assert.equal(page.status, 200, `SPA fallback failed for ${path}.`);
    assert.match(await page.text(), /<title>StudySpot Perth<\/title>/);
  }
  const home = await fetch(`${origin}/`);
  const html = await home.text();
  const assetPath = html.match(/src="([^"]+\.js)"/)?.[1];
  assert(assetPath, 'Built app script was not included.');
  assert.equal((await fetch(`${origin}${assetPath}`)).status, 200);
  for (const path of ['/api/libraries?start=2026-10-02T14:00', '/api/suburbs']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, `Public route failed: ${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetch(`${origin}/api/libraries/fictional-uwa-24-hours`)).status, 404, 'Public route exposed a fictional record.');
  assert.equal((await fetch(`${origin}/api/libraries?start=bad`)).status, 400);
  assert.equal((await fetch(`${origin}/api/libraries`, { method: 'POST' })).status, 405);
  const searchCheck = await fetch(`${origin}/api/_search-check`);
  assert.equal(searchCheck.status, 200, await searchCheck.text());
  const dataCheck = await fetch(`${origin}/api/_data-check`);
  assert.equal(dataCheck.status, 200, await dataCheck.text());
  console.log('Passed: search/detail API regression matrix; validated filters and ranking; fixture exclusion; local migrations and fixture replay; schema agreement; published/draft isolation; immutable snapshots; profile relations; atomic rollback; Pages/D1/auth runtime; SPA and assets.');
} catch (error) {
  // Wrangler masks secret values in its binding output; never print .dev.vars.
  console.error(output.slice(-6000));
  throw error;
} finally {
  if (child.exitCode === null && child.pid) {
    if (process.platform === 'win32') {
      try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { child.kill(); }
    } else { child.kill('SIGTERM'); }
  }
}
