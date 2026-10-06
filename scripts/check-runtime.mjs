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
await mkdir(`${workDir}/src/features/admin`, { recursive: true });
await cp(resolve('src/features/admin/editor-state.ts'), `${workDir}/src/features/admin/editor-state.ts`);
await cp(resolve('tests/fixtures'), `${workDir}/tests/fixtures`, { recursive: true });
await cp(resolve('migrations'), `${workDir}/migrations`, { recursive: true });
await cp(resolve('tests/runtime/library-data-check.ts'), `${workDir}/functions/api/_data-check.ts`);
await cp(resolve('tests/runtime/library-search-check.ts'), `${workDir}/functions/api/_search-check.ts`);
await cp(resolve('tests/runtime/account-check.ts'), `${workDir}/functions/api/_account-check.ts`);
await cp(resolve('tests/runtime/admin-check.ts'), `${workDir}/functions/api/_admin-check.ts`);
await cp(resolve('tests/runtime/launch-data-check.ts'), `${workDir}/functions/api/_launch-check.ts`);
await cp(resolve('tests/runtime/usage-check.ts'), `${workDir}/functions/api/_usage-check.ts`);
await cp(resolve('dist'), `${workDir}/dist`, { recursive: true });
await writeFile(`${workDir}/package.json`, JSON.stringify({ name: 'studyspotperth-runtime-check', private: true, type: 'module' }));
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
config.pages_build_output_dir = './dist';
config.vars.AUTH_BASE_URL = origin;
await writeFile(`${workDir}/wrangler.jsonc`, JSON.stringify(config));
// Synthetic credentials verify local binding loading without contacting Google.
await writeFile(`${workDir}/.dev.vars`, `AUTH_SECRET=${randomBytes(32).toString('hex')}\nGOOGLE_CLIENT_ID=runtime-check-client\nGOOGLE_CLIENT_SECRET=runtime-check-secret\n`, { mode: 0o600 });
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
  '--env-file', '.dev.vars',
], { cwd: workDir, env: runtimeEnv, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (chunk) => { output += String(chunk); });
child.stderr.on('data', (chunk) => { output += String(chunk); });
let launchError;
child.on('error', (error) => { launchError = error; });

try {
  let health;
  let healthPayload;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`Pages exited before startup (code ${child.exitCode}).`);
    try {
      health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(5_000) });
      healthPayload = await health.json();
      if (health.ok) break;
    } catch { health = undefined; /* Wait for the runtime to bind and finish its first database request. */ }
    await delay(250);
  }
  assert(health?.ok, 'Pages runtime did not become healthy within 60 seconds.');
  assert.deepEqual(healthPayload, { status: 'ok', database: 'connected', timeZone: 'Australia/Perth' });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const wrongMethod = await fetch(`${origin}/api/health`, { method: 'POST' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET');

  const auth = await fetch(`${origin}/api/auth/ok`);
  assert.equal(auth.status, 200, 'Better Auth did not initialise in the Pages runtime.');
  assert.deepEqual(await auth.json(), { ok: true });
  const guestSession = await fetch(`${origin}/api/auth/get-session`);
  assert.equal(guestSession.status, 200);
  assert.equal(await guestSession.json(), null);
  const guestAccount = await fetch(`${origin}/api/account`);
  assert.deepEqual(await guestAccount.json(), { account: null, googleEnabled: true }, 'Pages must load both provider credentials from .dev.vars.');
  const social = await fetch(`${origin}/api/auth/sign-in/social`, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'google', callbackURL: `${origin}/profile`, disableRedirect: true }),
  });
  assert.equal(social.status, 200, 'Configured Google sign-in must generate an authorization URL.');
  const socialPayload = await social.json();
  const authorization = new URL(socialPayload.url);
  assert.equal(authorization.origin, 'https://accounts.google.com');
  assert.equal(authorization.searchParams.get('client_id'), 'runtime-check-client');
  assert.equal(authorization.searchParams.get('redirect_uri'), `${origin}/api/auth/callback/google`);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');

  for (const path of ['/', '/sign-in', '/profile', '/saved', '/admin', '/admin/libraries/new', '/libraries/fictional-uwa-24-hours', '/a-page-that-does-not-exist']) {
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
  const accountCheck = await fetch(`${origin}/api/_account-check`);
  assert.equal(accountCheck.status, 200, 'Account integration checks failed; see the worker log.');
  const testCookie = accountCheck.headers.get('set-cookie')?.split(';')[0];
  assert(testCookie, 'The isolated account check must provide a test session.');
  const protectedProfile = await fetch(`${origin}/api/account`, { headers: { Cookie: testCookie } });
  assert.equal(protectedProfile.status, 200);
  assert.equal((await protectedProfile.json()).account.user.id, 'account-check-alice');
  const emptyPut = await fetch(`${origin}/api/account/favourites/missing-library`, { method: 'PUT', headers: { Origin: origin, Cookie: testCookie } });
  assert.equal(emptyPut.status, 404, 'A bodyless HTTP PUT must reach library validation.');
  const expiredPut = await fetch(`${origin}/api/account`, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ suburbId: null, cards: [] }) });
  assert.equal(expiredPut.status, 401);
  const adminCheck = await fetch(`${origin}/api/_admin-check`);
  assert.equal(adminCheck.status, 200, 'Admin integration checks failed; see the worker log.');
  const adminCookie = adminCheck.headers.get('set-cookie')?.split(';')[0];
  assert(adminCookie);
  assert.equal((await fetch(`${origin}/api/admin/libraries`)).status, 401);
  assert.equal((await fetch(`${origin}/api/admin/libraries`, { headers: { Cookie: testCookie } })).status, 403);
  const adminList = await fetch(`${origin}/api/admin/libraries`, { headers: { Cookie: adminCookie } });
  assert.equal(adminList.status, 200);
  assert((await adminList.json()).libraries.every((item) => !item.record.isFixture));
  for (const action of ['preview', 'publish', 'unpublish']) {
    assert.equal((await fetch(`${origin}/api/admin/libraries/missing/${action}`, { method: 'POST', headers: { Cookie: adminCookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ revisionId: 'missing' }) })).status, 404, `Admin ${action} routing failed.`);
  }
  const dataCheck = await fetch(`${origin}/api/_data-check`);
  assert.equal(dataCheck.status, 200, await dataCheck.text());
  const launchCheck = await fetch(`${origin}/api/_launch-check`);
  assert.equal(launchCheck.status, 200, await launchCheck.text());
  const usageCheck = await fetch(`${origin}/api/_usage-check`);
  assert.equal(usageCheck.status, 200, await usageCheck.text());
  assert.equal((await fetch(`${origin}/api/admin/usage`)).status, 401);
  assert.equal((await fetch(`${origin}/api/admin/usage`, { headers: { Cookie: adminCookie } })).status, 200);
  const noConsent = await fetch(`${origin}/api/usage`, { method: 'POST', headers: { Origin: origin } });
  assert.equal(noConsent.status, 204);
  console.log('Passed: optional-cookie consent, anonymous/account separation, duplicate visits/events, returning estimates, retention, and protected usage summaries.');
  console.log('Passed: 13 public launch listings, repeatable local import, detail routes, 24/7 ranking and explicit UWA filtering.');
  console.log('Passed: admin permission/CSRF checks, concurrent drafts, preview, publish/unpublish, closures and overrides; local Google credential loading, authorization URL/callback and disabled-provider handling; account ownership, preferences/favourites, session signatures/expiry/revocation/renewal, CSRF and server roles; search/detail regression matrix; fixture exclusion; migration replay; publication and rollback; Pages/D1/auth runtime; SPA and assets. Live Google sign-in is checked separately.');
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
