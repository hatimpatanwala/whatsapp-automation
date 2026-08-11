// Publish the built desktop release to the generic electron-updater feed served
// at /var/www/desktop-updates/ on the staging EC2 (nginx location
// `/desktop-updates/`). Run AFTER `npm run dist` (which builds the EXE + blockmap
// + latest.yml into ./release). Installed apps read latest.yml on launch and
// auto-download the newer version.
//
// Overridable via env: WA_DEPLOY_KEY, WA_DEPLOY_HOST, WA_UPDATE_FEED_DIR.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const version = JSON.parse(readFileSync('./package.json', 'utf8')).version;
const KEY = process.env.WA_DEPLOY_KEY || path.resolve('..', 'wa-commece.pem');
const HOST = process.env.WA_DEPLOY_HOST || 'ubuntu@52.66.40.206';
const DEST = process.env.WA_UPDATE_FEED_DIR || '/var/www/desktop-updates/';

const exe = `NexusFlow-Setup-${version}.exe`;
const files = ['latest.yml', exe, `${exe}.blockmap`].map((f) => path.join('release', f));

for (const f of files) {
  if (!existsSync(f)) {
    console.error(`Missing build artifact: ${f}\nRun "npm run dist" first.`);
    process.exit(1);
  }
}

console.log(`Publishing desktop ${version} → ${HOST}:${DEST}`);
// execFile (no shell) preserves the spaces in the artifact filenames.
execFileSync('scp', ['-o', 'StrictHostKeyChecking=no', '-i', KEY, ...files, `${HOST}:${DEST}`], { stdio: 'inherit' });
console.log(`\n✓ Published ${version}. Installed apps will auto-update on next launch.`);
