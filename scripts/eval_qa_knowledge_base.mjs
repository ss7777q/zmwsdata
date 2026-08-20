import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DOC = 'docs/全系统全模块数据内容问答知识库.md';
const DEFAULT_OUTPUT = 'file/runtime/qa-knowledge-base-eval.json';
const MISSING_PATTERN = /当前资料未找到|资料中未找到|资料未给出|资料不足|无法确定|缺失说明/;

function parseArgs(argv) {
  const options = {
    url: 'http://127.0.0.1:8788/api/qa/ask',
    doc: DEFAULT_DOC,
    output: DEFAULT_OUTPUT,
    concurrency: 3,
    offset: 0,
    limit: Number.POSITIVE_INFINITY,
    indices: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url') options.url = argv[++index];
    else if (arg === '--doc') options.doc = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--concurrency') options.concurrency = Math.max(1, Number(argv[++index]) || 1);
    else if (arg === '--offset') options.offset = Math.max(0, Number(argv[++index]) || 0);
    else if (arg === '--limit') options.limit = Math.max(1, Number(argv[++index]) || 1);
    else if (arg === '--indices') {
      options.indices = String(argv[++index] || '')
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
    }
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function extractQuestions(markdown) {
  const questions = [];
  let section = '';
  let pending = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      section = heading[1].trim();
      pending = null;
      continue;
    }
    const question = line.match(/^-\s+\*\*[^*]*问题\*\*[：:]\s*(.+)$/);
    if (question) {
      pending = {
        index: questions.length + 1,
        section,
        question: question[1].trim(),
        expectedSource: '',
      };
      questions.push(pending);
      continue;
    }
    const source = line.match(/^-\s+\*\*[^*]*数据来源\*\*[：:]\s*(.+)$/);
    if (source && pending) pending.expectedSource = source[1].trim();
  }
  return questions;
}

async function askQuestion(item, url) {
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
    const citations = Array.isArray(payload.citations) ? payload.citations : [];
    return {
      ...item,
      ok: response.ok,
      status: response.status,
      elapsedSeconds: Number(((performance.now() - startedAt) / 1_000).toFixed(2)),
      model: payload.model || '',
      retrievalMode: payload.retrievalMode || '',
      files: Array.isArray(payload.files) ? payload.files : [],
      citations,
      answer,
      missingClaim: MISSING_PATTERN.test(answer),
      error: response.ok ? '' : String(payload.error || `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ...item,
      ok: false,
      status: 0,
      elapsedSeconds: Number(((performance.now() - startedAt) / 1_000).toFixed(2)),
      model: '',
      retrievalMode: '',
      files: [],
      citations: [],
      answer: '',
      missingClaim: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
      const result = results[index];
      const marker = result.ok ? (result.missingClaim ? 'MISSING' : 'OK') : 'ERROR';
      console.log(`[${index + 1}/${items.length}] ${marker} ${result.elapsedSeconds}s ${result.section}`);
    }
  }));
  return results;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log('Usage: node scripts/eval_qa_knowledge_base.mjs [--url URL] [--doc FILE] [--output FILE] [--concurrency N] [--offset N] [--limit N] [--indices 1,2,3]');
  process.exit(0);
}

const markdown = await readFile(path.resolve(options.doc), 'utf8');
const allQuestions = extractQuestions(markdown);
const requestedIndices = new Set(options.indices);
const questions = requestedIndices.size > 0
  ? allQuestions.filter((item) => requestedIndices.has(item.index))
  : allQuestions.slice(options.offset, options.offset + options.limit);
if (questions.length === 0) throw new Error(`No questions found in ${options.doc}`);

console.log(`Evaluating ${questions.length} questions against ${options.url} with concurrency ${options.concurrency}`);
const results = await runPool(questions, options.concurrency, (item) => askQuestion(item, options.url));
const summary = {
  total: results.length,
  succeeded: results.filter((item) => item.ok).length,
  failed: results.filter((item) => !item.ok).length,
  withCitations: results.filter((item) => item.citations.length > 0).length,
  missingClaims: results.filter((item) => item.missingClaim).length,
  averageSeconds: Number((results.reduce((sum, item) => sum + item.elapsedSeconds, 0) / results.length).toFixed(2)),
};
const report = {
  generatedAt: new Date().toISOString(),
  url: options.url,
  document: options.doc,
  summary,
  results,
};
const outputPath = path.resolve(options.output);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary));
console.log(`Report: ${outputPath}`);
if (summary.failed > 0) process.exitCode = 1;
