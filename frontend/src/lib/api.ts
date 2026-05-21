const DEFAULT_SERVER_API_BASE = 'https://api.zmwsrank.top';
const SERVER_API_BASE = (import.meta.env.VITE_SERVER_API_BASE || import.meta.env.VITE_DATA_API_BASE || DEFAULT_SERVER_API_BASE).replace(/\/$/, '');
const STATIC_DATA_BASE = (import.meta.env.VITE_STATIC_DATA_BASE || '/data').replace(/\/$/, '');

export function apiUrl(path: string) {
  return SERVER_API_BASE ? `${SERVER_API_BASE}${path}` : path;
}

export function staticDataUrl(path: string) {
  return `${STATIC_DATA_BASE}${path}`;
}

export function dataManifestUrl() {
  return staticDataUrl('/manifest.json');
}

export function dataFileUrl(name: string) {
  return staticDataUrl(`/${encodeURIComponent(name)}.json`);
}

export function staticDataStreamEnabled() {
  return ['1', 'true', 'on', 'yes'].includes(String(import.meta.env.VITE_STATIC_DATA_STREAM || '').toLowerCase());
}

export function buildAdminHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token && token.trim()) {
    headers['X-Admin-Token'] = token.trim();
  }
  return headers;
}

async function readJsonResponse<T>(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : null;
  if (!response.ok) {
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      throw new Error(body.error);
    }
    throw new Error(`Request failed: ${response.status}`);
  }
  if (!body) {
    throw new Error('接口未返回 JSON，请检查服务器 API 域名配置');
  }
  return body as T;
}

export type PlayerSearchMode = 'phrase' | 'tokens';

export interface PlayerNameSearchItem {
  uid: string;
  latestMatchTime: number;
  matchedRecords: number;
  distinctNameCount: number;
  latestMatchedName: string;
  currentName: string;
  currentTime: number;
}

export interface PlayerNameSearchResponse {
  mode: PlayerSearchMode;
  keyword: string;
  separator: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
  items: PlayerNameSearchItem[];
}

export interface PlayerNameHistoryItem {
  name: string;
  firstSeenAt: number;
  lastSeenAt: number;
  seenCount: number;
  isCurrent: boolean;
}

export interface PlayerNameHistoryResponse {
  uid: string;
  currentName: string;
  currentTime: number | null;
  rawRecordCount: number;
  distinctNameCount: number;
  items: PlayerNameHistoryItem[];
}

export interface PlayerNameSearchParams {
  keyword: string;
  mode: PlayerSearchMode;
  separator?: string;
  page?: number;
  pageSize?: number;
}

export type FeedbackCategory = 'feature' | 'data' | 'ux' | 'other';

export interface FeedbackSubmissionInput {
  category: FeedbackCategory;
  area?: string;
  title: string;
  message: string;
  contact?: string;
  pageUrl?: string;
}

export interface FeedbackSubmissionResponse {
  ok: true;
  message: string;
  receivedAt: string;
}

export interface VisitorStatsResponse {
  onlineVisitors: number;
  todayVisitors: number;
  totalVisitors: number;
  totalVisits: number;
  updatedAt: string;
}

export interface VisitorHistoryItem {
  date: string;
  visitors: number;
}

export interface VisitorHistoryResponse {
  days: number;
  items: VisitorHistoryItem[];
  totalVisitors: number;
  maxVisitors: number;
  updatedAt: string;
}

export interface BeastPetEntry {
  petId: number;
  petNickname: string;
  petPower: number;
  petLevel: number;
  slotIndex: number;
}

export interface BeastDetailRow {
  season: number;
  group: number;
  sid: number;
  uid: string;
  winnerNameAtThatTime: string;
  currentName: string;
  petPowerSum: number;
  isAnomalyBySeasonAvg80: boolean;
  pets: BeastPetEntry[];
}

export interface BeastDetailResponse {
  summary: {
    totalChampions: number;
    anomalyCount: number;
    seasonList: number[];
    serverList: number[];
    petSpeciesNameById: Record<string, string>;
  };
  rows: BeastDetailRow[];
}

export interface BeastLineupCatalogItem {
  petId: number;
  petSpeciesName: string;
  totalCount: number;
}

export interface BeastLineupDataset {
  seasonList: number[];
  petCatalog: BeastLineupCatalogItem[];
  appearanceCountBySeason: Record<string, Record<string, number>>;
  appearanceRateBySeason: Record<string, Record<string, number>>;
  topPetsDefault: number[];
}

export interface BeastLineupAnalysisResponse {
  summary: {
    totalChampionRows: number;
    cleanedChampionRows: number;
    anomalyRows: number;
    seasonList: number[];
  };
  raw: BeastLineupDataset;
  cleaned: BeastLineupDataset;
}

export interface BeastPlayerSeasonWin {
  season: number;
  sid: number;
  winnerNameAtThatTime: string;
}

export interface BeastPlayerRow {
  rank: number;
  uid: string;
  currentName: string;
  winnerAliasList: string[];
  championCount: number;
  seasonWins: BeastPlayerSeasonWin[];
  sidCoverage: number[];
  firstChampionSeason: number | null;
  latestChampionSeason: number | null;
}

export interface BeastPlayerAnalysisResponse {
  summary: {
    totalPlayers: number;
    totalChampionRows: number;
    seasonList: number[];
    serverList: number[];
  };
  rows: BeastPlayerRow[];
}

export interface BeastAnomaliesResponse {
  summary: {
    totalAnomalies: number;
    totalSkippedRows: number;
    seasonList: number[];
    serverList: number[];
  };
  skippedRows: Array<{
    skipped: true;
    season: number;
    group: number;
    file: string;
    code: number;
    error: string | null;
  }>;
  rows: BeastDetailRow[];
}

export async function searchPlayerNames(params: PlayerNameSearchParams, signal?: AbortSignal) {
  const searchParams = new URLSearchParams({
    keyword: params.keyword,
    mode: params.mode,
    separator: params.separator ?? ' ',
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 50),
  });
  const response = await fetch(apiUrl(`/api/player-name/search?${searchParams.toString()}`), {
    cache: 'no-store',
    signal,
  });
  return readJsonResponse<PlayerNameSearchResponse>(response);
}

export async function fetchPlayerNameHistory(uid: string, signal?: AbortSignal) {
  const searchParams = new URLSearchParams({ uid });
  const response = await fetch(apiUrl(`/api/player-name/history?${searchParams.toString()}`), {
    cache: 'no-store',
    signal,
  });
  return readJsonResponse<PlayerNameHistoryResponse>(response);
}

export async function submitFeedback(input: FeedbackSubmissionInput, signal?: AbortSignal) {
  const response = await fetch(apiUrl('/api/feedback'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    cache: 'no-store',
    signal,
  });
  return readJsonResponse<FeedbackSubmissionResponse>(response);
}

export async function fetchVisitorStats(signal?: AbortSignal) {
  const response = await fetch(apiUrl('/api/visitor-stats'), {
    cache: 'no-store',
    signal,
  });
  return readJsonResponse<VisitorStatsResponse>(response);
}

export async function registerVisitorStats(visitorId: string, signal?: AbortSignal) {
  const response = await fetch(apiUrl('/api/visitor-stats/register'), {
    method: 'POST',
    headers: {
      'X-Visitor-Id': visitorId,
    },
    cache: 'no-store',
    signal,
  });
  return readJsonResponse<VisitorStatsResponse>(response);
}

export async function fetchVisitorHistory(days = 30, signal?: AbortSignal) {
  const searchParams = new URLSearchParams({
    days: String(days),
  });
  const response = await fetch(apiUrl(`/api/visitor-stats/history?${searchParams.toString()}`), {
    cache: 'no-store',
    signal,
  });
  return readJsonResponse<VisitorHistoryResponse>(response);
}
