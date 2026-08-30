import { searchBosses } from '../_shared/boss-search-service.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  try {
    let keywords = '';
    let limit = 50;
    let stageType = null;
    let includeMobs = true;

    if (request.method === 'GET') {
      keywords = url.searchParams.get('keywords') || url.searchParams.get('keyword') || url.searchParams.get('q') || '';
      if (url.searchParams.has('limit')) {
        limit = Number(url.searchParams.get('limit')) || 50;
      }
      if (url.searchParams.has('type') || url.searchParams.has('stageType')) {
        stageType = url.searchParams.get('type') || url.searchParams.get('stageType');
      }
      if (url.searchParams.has('includeMobs')) {
        includeMobs = url.searchParams.get('includeMobs') !== 'false' && url.searchParams.get('includeMobs') !== '0';
      }
    } else if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const bodyText = await request.text();
      let body = {};
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        body = {};
      }
      keywords = body.keywords || body.keyword || body.q || '';
      if (body.limit !== undefined) {
        limit = Number(body.limit) || 50;
      }
      if (body.type !== undefined || body.stageType !== undefined) {
        stageType = body.type !== undefined ? body.type : body.stageType;
      }
      if (body.includeMobs !== undefined) {
        includeMobs = Boolean(body.includeMobs);
      }
    }

    const results = searchBosses(keywords, {
      limit,
      type: stageType,
      includeMobs,
    });

    return new Response(
      JSON.stringify({
        code: 200,
        msg: '获取成功',
        data: {
          count: results.length,
          data: results,
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=60, s-maxage=300',
          ...CORS_HEADERS,
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        code: 500,
        msg: 'BOSS搜索失败: ' + (err.message || String(err)),
        data: { count: 0, data: [] },
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...CORS_HEADERS,
        },
      }
    );
  }
}
