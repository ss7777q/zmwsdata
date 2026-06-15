import { collectVisitorHistory, jsonResponse, optionsResponse, withRequestErrors } from '../_visitor-stats.js';

export async function onRequestGet({ env, request }) {
  return withRequestErrors(async () => {
    const url = new URL(request.url);
    const rawDays = url.searchParams.get('days');
    const days = rawDays == null ? undefined : Number(rawDays);
    return jsonResponse(await collectVisitorHistory(env, Number.isInteger(days) ? days : undefined));
  });
}

export function onRequestOptions() {
  return optionsResponse();
}
