import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

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
await cp(resolve('dist'), `${workDir}/dist`, { recursive: true });
await writeFile(`${workDir}/package.json`, JSON.stringify({ name: 'studyspotperth-runtime-check', private: true, type: 'module' }));
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
config.pages_build_output_dir = './dist';
config.vars.AUTH_BASE_URL = origin;
await writeFile(`${workDir}/wrangler.jsonc`, JSON.stringify(config));
await writeFile(`${workDir}/.dev.vars`, `AUTH_SECRET=${randomBytes(32).toString('hex')}\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n`, { mode: 0o600 });

const child = spawn(process.execPath, [
  resolve('node_modules/wrangler/bin/wrangler.js'), 'pages', 'dev', 'dist',
  '--ip', '127.0.0.1', '--port', String(port),
  '--persist-to', `${workDir}/state`,
], { cwd: workDir, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  console.log('Passed: Pages → Drizzle → local D1; method handling; Better Auth runtime initialisation; inactive account endpoints; SPA fallback and built asset delivery.');
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
