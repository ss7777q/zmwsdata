import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    url: 'http://127.0.0.1:8788/api/qa/ask',
    cases: 'tests/qa_adversarial_cases.json',
    output: 'file/runtime/qa-adversarial-report.json',
    concurrency: 3,
    ids: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url') options.url = argv[++index];
    else if (arg === '--cases') options.cases = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--concurrency') options.concurrency = Math.max(1, Number(argv[++index]) || 1);
    else if (arg === '--ids') options.ids = String(argv[++index] || '').split(',').map((value) => value.trim()).filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[\s,，]/g, '');
}

async function askCase(item, url) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ question: item.question, history: [] }),
      signal: AbortSignal.timeout(180_000),
    });
    const payload = await response.json().catch(() => ({}));
    const answer = String(payload.answer || '');
    const normalizedAnswer = normalize(answer);
    const files = Array.isArray(payload.files) ? payload.files : [];
    const missingTermGroups = (item.requiredTerms || []).filter((alternatives) => (
      !alternatives.some((term) => normalizedAnswer.includes(normalize(term)))
    ));
    const missingFiles = (item.requiredFiles || []).filter((file) => !files.includes(file));
    const citations = Array.isArray(payload.citations) ? payload.citations : [];
    const passed = response.ok && answer && citations.length > 0 && missingTermGroups.length === 0 && missingFiles.length === 0;
    return {
      ...item,
      passed,
      status: response.status,
      elapsedSeconds: Number(((performance.now() - startedAt) / 1_000).toFixed(2)),
      model: payload.model || '',
      retrievalMode: payload.retrievalMode || '',
      files,
      citations,
      answer,
      missingTermGroups,
      missingFiles,
      error: response.ok ? '' : String(payload.error || `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ...item,
      passed: false,
      status: 0,
      elapsedSeconds: Number(((performance.now() - startedAt) / 1_000).toFixed(2)),
      model: '',
      retrievalMode: '',
      files: [],
      citations: [],
      answer: '',
      missingTermGroups: item.requiredTerms || [],
      missingFiles: item.requiredFiles || [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
      const result = results[index];
      console.log(`[${index + 1}/${items.length}] ${result.passed ? 'PASS' : 'FAIL'} ${result.elapsedSeconds}s ${result.id}`);
    }
  }));
  return results;
}

const options = parseArgs(process.argv.slice(2));
const allCases = JSON.parse(await readFile(path.resolve(options.cases), 'utf8'));
const requestedIds = new Set(options.ids);
const cases = requestedIds.size > 0 ? allCases.filter((item) => requestedIds.has(item.id)) : allCases;
if (!Array.isArray(cases) || cases.length === 0) throw new Error('No QA cases found');
const results = await runPool(cases, options.concurrency, (item) => askCase(item, options.url));
const summary = {
  total: results.length,
  passed: results.filter((item) => item.passed).length,
  failed: results.filter((item) => !item.passed).length,
  averageSeconds: Number((results.reduce((sum, item) => sum + item.elapsedSeconds, 0) / results.length).toFixed(2)),
};
const report = { generatedAt: new Date().toISOString(), url: options.url, cases: options.cases, summary, results };
const outputPath = path.resolve(options.output);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary));
console.log(`Report: ${outputPath}`);
if (summary.failed > 0) process.exitCode = 1;
