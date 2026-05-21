const TEMP_PREVIEW_API_BASE = (import.meta.env.VITE_TEMP_PREVIEW_API_BASE || 'http://127.0.0.1:2418').replace(/\/$/, '');

function tempPreviewUrl(path: string) {
  return `${TEMP_PREVIEW_API_BASE}${path}`;
}

async function readJsonResponse<T>(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      throw new Error(body.error);
    }
    throw new Error(`Request failed: ${response.status}`);
  }
  return body as T;
}

export interface TempPreviewRoleSummary {
  roleKey: string;
  unitSlug: string;
  categoryId: string;
  roleName: string;
  exportVersion: number;
  generatedAt: string | null;
  unresolvedCount: number;
  excelDisplayRowsCount: number;
  sectionCounts: Record<string, number>;
}

export interface TempPreviewCategoryItem {
  id?: string;
  label?: string;
  status?: string;
  unitSlug?: string;
  roleKey?: string;
  roleName?: string;
  exportVersion?: number;
  generatedAt?: string | null;
  unresolvedCount?: number;
  excelDisplayRowsCount?: number;
  sectionCounts?: Record<string, number>;
}

export interface TempPreviewCatalogCategory {
  id: 'role' | 'pet' | 'ride';
  label: string;
  description: string;
  items: TempPreviewCategoryItem[];
}

export interface TempPreviewCatalogResponse {
  categories: TempPreviewCatalogCategory[];
}

export interface TempPreviewExport {
  meta: {
    roleKey: string;
    roleName: string;
    exportVersion: number;
    generatedAt: string;
    source?: Record<string, unknown>;
  };
  references: Record<string, unknown>;
  sections: Record<string, unknown[]>;
  unresolved: Array<Record<string, unknown>>;
  notes: string[];
}

export interface TempPreviewUnitResponse {
  unitMeta: {
    unitSlug: string;
    categoryId: string;
    roleKey: string;
    roleName: string;
    generatedAt: string | null;
    unresolvedCount: number;
    excelDisplayRowsCount: number;
  };
  export: TempPreviewExport;
}

export async function fetchTempPreviewCatalog(signal?: AbortSignal) {
  const response = await fetch(tempPreviewUrl('/api/temp-preview/catalog'), {
    cache: 'no-store',
    signal,
  });
  return readJsonResponse<TempPreviewCatalogResponse>(response);
}

export async function fetchTempPreviewRole(roleKey: string, signal?: AbortSignal) {
  const response = await fetch(tempPreviewUrl(`/api/temp-preview/roles/${encodeURIComponent(roleKey)}`), {
    cache: 'no-store',
    signal,
  });
  return readJsonResponse<TempPreviewExport>(response);
}

export async function fetchTempPreviewUnit(unitSlug: string, signal?: AbortSignal) {
  const response = await fetch(tempPreviewUrl(`/api/temp-preview/units/${encodeURIComponent(unitSlug)}`), {
    cache: 'no-store',
    signal,
  });
  return readJsonResponse<TempPreviewUnitResponse>(response);
}
