import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (existsSync('.dev.vars')) {
  console.log('Existing .dev.vars preserved.');
} else {
  writeFileSync('.dev.vars', `AUTH_SECRET=${randomBytes(32).toString('hex')}\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n`, { mode: 0o600 });
  console.log('Created ignored local .dev.vars with a random auth secret; Google credentials remain unset.');
}
