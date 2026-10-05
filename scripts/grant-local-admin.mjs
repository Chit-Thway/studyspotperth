import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--email' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1]) || args[1].length > 254) {
  throw new Error('Use: npm run db:admin -- --email "your-signed-in-email"');
}
const email = `'${args[1].replaceAll("'", "''")}'`;
const command = `INSERT INTO user_role(user_id,role) SELECT id,'admin' FROM user WHERE email=${email} COLLATE NOCASE ON CONFLICT(user_id) DO UPDATE SET role='admin'; SELECT count(*) AS admins FROM user_role r INNER JOIN user u ON u.id=r.user_id WHERE u.email=${email} COLLATE NOCASE AND r.role='admin';`;
const wranglerPath = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const output = execFileSync(process.execPath, [wranglerPath, 'd1', 'execute', 'studyspotperth', '--local', '--command', command, '--json'], {
  encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const results = JSON.parse(output);
if (!results.some((result) => result.results?.some((row) => row.admins === 1))) throw new Error('No matching local account. Sign in once, then run this command again.');
console.log('Local administrator access granted. Reload the app and choose Profile → Manage libraries.');
