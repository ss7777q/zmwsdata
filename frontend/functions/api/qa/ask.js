import { handleQaRequest, jsonResponse, optionsResponse } from '../_shared/qa-service.js';

export function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestPost(context) {
  return handleQaRequest(context);
}

export function onRequestGet() {
  return jsonResponse({
    error: '请使用 POST /api/qa/ask 提交问题',
    code: 'EQA_METHOD_NOT_ALLOWED',
  }, 405);
}
