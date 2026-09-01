import { jsonResponse, optionsResponse } from '../_shared/qa-service.js';

export function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestGet({ request, env }) {
  const db = env?.VISITOR_STATS_DB;
  if (!db || typeof db.prepare !== 'function') {
    return jsonResponse({ error: '数据库未绑定或不可用', code: 'EDB_UNAVAILABLE' }, 500);
  }

  try {
    const url = new URL(request.url);
    const limitParam = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;
    const offsetParam = parseInt(url.searchParams.get('offset') || '0', 10);
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const countStmt = await db.prepare('SELECT COUNT(*) as total FROM qa_logs').first();
    const total = countStmt?.total ?? 0;

    const { results } = await db.prepare(`
      SELECT id, created_at, question, answer, model, citations, latency_ms
      FROM qa_logs
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    const items = (results || []).map((row) => {
      let parsedCitations = null;
      if (typeof row.citations === 'string') {
        try {
          parsedCitations = JSON.parse(row.citations);
        } catch {
          parsedCitations = row.citations;
        }
      }
      return {
        id: row.id,
        createdAt: row.created_at,
        question: row.question,
        answer: row.answer,
        model: row.model,
        citations: parsedCitations,
        latencyMs: row.latency_ms,
      };
    });

    return jsonResponse({
      total,
      limit,
      offset,
      logs: items,
    });
  } catch (error) {
    return jsonResponse({
      error: `查询问答日志失败: ${error?.message || String(error)}`,
      code: 'EQA_LOG_QUERY_FAILED',
    }, 500);
  }
}
