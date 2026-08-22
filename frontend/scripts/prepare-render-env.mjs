/**
 * Render injects VITE_WS_URL at build time via render.yaml.
 * Vite needs VITE_API_URL with /api suffix — set it here before build.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ws = (process.env.VITE_WS_URL || '').replace(/\/$/, '');

const env = { ...process.env };
if (ws) {
  env.VITE_API_URL = `${ws}/api`;
  console.log(`VITE_API_URL set to ${env.VITE_API_URL}`);
} else if (!env.VITE_API_URL) {
  console.warn('VITE_WS_URL not set — using default /api proxy for local builds');
}

const result = spawnSync('npm', ['run', 'build', '-w', 'frontend'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 1);
