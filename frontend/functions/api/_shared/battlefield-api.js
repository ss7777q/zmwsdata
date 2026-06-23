import source from './call-god-battlefield-source.js';
import { createBattlefieldService } from './battlefield-service.js';

const REQUEST_BODY_MAX_BYTES = 64 * 1024;
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const battlefieldService = createBattlefieldService(source);

export function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS,
  });
}

export function handleConfig() {
  return jsonResponse(200, battlefieldService.getConfig());
}

export async function handleCalculate(request) {
  try {
    const params = request.method === 'POST'
      ? await readJsonBody(request)
      : parseBattlefieldQuery(new URL(request.url).searchParams);
    return jsonResponse(200, battlefieldService.calculate(params));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/must be|lookup failed|at least|one of|Request body/.test(message)) {
      return jsonResponse(400, { error: message });
    }
    return jsonResponse(500, { error: `Failed to calculate battlefield data: ${message}` });
  }
}

function parseBattlefieldQuery(searchParams) {
  const params = {};
  const battlefieldTier = searchParams.get('battlefieldTier');
  const battlefieldLevel = searchParams.get('battlefieldLevel') ?? searchParams.get('level');
  const starLevel = searchParams.get('starLevel') ?? searchParams.get('star');
  const bossStage = searchParams.get('bossStage');

  if (battlefieldTier != null && battlefieldTier !== '') params.battlefieldTier = Number(battlefieldTier);
  if (battlefieldLevel != null && battlefieldLevel !== '') params.battlefieldLevel = Number(battlefieldLevel);
  if (starLevel != null && starLevel !== '') params.starLevel = Number(starLevel);
  if (bossStage != null && bossStage !== '') params.bossStage = Number(bossStage);

  return params;
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > REQUEST_BODY_MAX_BYTES) {
    throw new Error('Request body too large');
  }
  return request.json();
}
