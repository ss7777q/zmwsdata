import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, '..', 'frontend');
const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build'];

const result = spawnSync(command, commandArgs, {
  cwd: frontendDirectory,
  env: {
    ...process.env,
    VITE_STATIC_DATA_BASE: '/data',
    VITE_SERVER_API_BASE: 'https://api.zmwsrank.top',
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[cf-build] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
