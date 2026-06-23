import { handleConfig, optionsResponse } from '../_shared/battlefield-api.js';

export function onRequestOptions() {
  return optionsResponse();
}

export function onRequestGet() {
  return handleConfig();
}
