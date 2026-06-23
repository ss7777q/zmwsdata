import { handleCalculate, optionsResponse } from '../_shared/battlefield-api.js';

export function onRequestOptions() {
  return optionsResponse();
}

export function onRequestGet({ request }) {
  return handleCalculate(request);
}

export function onRequestPost({ request }) {
  return handleCalculate(request);
}
