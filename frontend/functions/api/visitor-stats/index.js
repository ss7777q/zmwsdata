import { collectVisitorStats, jsonResponse, optionsResponse, withRequestErrors } from '../_visitor-stats.js';

export async function onRequestGet({ env }) {
  return withRequestErrors(async () => jsonResponse(await collectVisitorStats(env)));
}

export function onRequestOptions() {
  return optionsResponse();
}
