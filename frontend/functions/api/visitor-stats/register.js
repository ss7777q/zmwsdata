import { jsonResponse, optionsResponse, registerVisitor, withRequestErrors } from '../_visitor-stats.js';

export async function onRequestPost({ env, request }) {
  return withRequestErrors(async () => jsonResponse(await registerVisitor(env, request)));
}

export function onRequestOptions() {
  return optionsResponse();
}
