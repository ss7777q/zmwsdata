import { execSync } from 'child_process';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const env = { ...process.env, HTTPS_PROXY: 'http://127.0.0.1:7897', HTTP_PROXY: 'http://127.0.0.1:7897' };
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx > 0) {
    const k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
}

try {
  const cmd = `npx wrangler d1 execute zmws-visitor-stats --remote --command "SELECT id, created_at, question, model, answer, citations, latency_ms FROM qa_logs WHERE id >= 10 ORDER BY id DESC;" --json`;
  const res = execSync(cmd, { cwd: 'frontend', env, encoding: 'utf8' });
  const parsed = JSON.parse(res);
  const rows = parsed[0]?.results || [];
  console.log(`Fetched ${rows.length} logs (id >= 10) from D1:`);
  for (const row of rows) {
    const beijingTime = new Date(new Date(row.created_at).getTime() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[ID ${row.id}] [${beijingTime}] [${row.model}] [${row.latency_ms}ms]`);
    console.log(`Q: ${row.question}`);
    console.log(`A: ${row.answer.replace(/\s+/g, ' ').slice(0, 180)}`);
    console.log(`Citations: ${row.citations}`);
    console.log('----------------------------------------------------');
  }
} catch (e) {
  console.error('Error stdout:', e.stdout);
  console.error('Error stderr:', e.stderr);
}
