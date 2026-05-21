import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, buildAdminHeaders } from '../lib/api';

export type AdminTask = 'pipeline' | 'sync' | 'extract';

export interface AdminSettingsInput {
  maxLevel: number;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalMinutes: number;
  autoRefreshOnStart: boolean;
}

export interface OpsStatus {
  running: boolean;
  task: AdminTask | null;
  trigger: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
  lastDurationMs: number | null;
  lastExitCode: number | null;
  lastError: string | null;
  nextRunAt: string | null;
  logLines: string[];
  authRequired: boolean;
  opsEnabled: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalMinutes: number;
  autoRefreshOnStart: boolean;
  outputFileCount: number;
  dataApiFileCount: number;
  latestOutputAt: string | null;
  latestDataApiAt: string | null;
  uptimeSeconds: number;
  serverTime: string;
  defaultMaxLevel: number;
  configuredMaxLevel: number;
}

const EMPTY_STATUS: OpsStatus = {
  running: false,
  task: null,
  trigger: null,
  startedAt: null,
  finishedAt: null,
  lastSucceededAt: null,
  lastFailedAt: null,
  lastDurationMs: null,
  lastExitCode: null,
  lastError: null,
  nextRunAt: null,
  logLines: [],
  authRequired: false,
  opsEnabled: false,
  autoRefreshEnabled: false,
  autoRefreshIntervalMinutes: 0,
  autoRefreshOnStart: false,
  outputFileCount: 0,
  dataApiFileCount: 0,
  latestOutputAt: null,
  latestDataApiAt: null,
  uptimeSeconds: 0,
  serverTime: new Date(0).toISOString(),
  defaultMaxLevel: 220,
  configuredMaxLevel: 220,
};

function toRequestError(response: Response, body: unknown) {
  if (response.status === 403 || response.status === 404) {
    return new Error('设置面板未启用，请使用专用启动命令开启。');
  }
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return new Error(body.error);
  }
  return new Error(`Request failed: ${response.status}`);
}

export function useOpsStatus() {
  const [status, setStatus] = useState<OpsStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('data-api-admin-token') || '';
  });

  const fetchStatus = useCallback(async (tokenValue: string) => {
    const response = await fetch(apiUrl('/api/admin/status'), {
      headers: buildAdminHeaders(tokenValue),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw toRequestError(response, body);
    }
    return body as OpsStatus;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const nextStatus = await fetchStatus(token);
      setStatus(nextStatus);
      setError(null);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      if (message.includes('设置面板未启用')) {
        setStatus(EMPTY_STATUS);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, token]);

  const updateSettings = useCallback(async (settings: AdminSettingsInput) => {
    const response = await fetch(apiUrl('/api/admin/settings'), {
      method: 'POST',
      headers: buildAdminHeaders(token),
      body: JSON.stringify(settings),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw toRequestError(response, body);
    }
    if (body && typeof body === 'object') {
      setStatus(body as OpsStatus);
    }
  }, [token]);

  const runTask = useCallback(async (task: AdminTask) => {
    const response = await fetch(apiUrl('/api/admin/run'), {
      method: 'POST',
      headers: buildAdminHeaders(token),
      body: JSON.stringify({ task }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw toRequestError(response, body);
    }
    if (body && typeof body === 'object') {
      setStatus(body as OpsStatus);
    }
  }, [token]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('data-api-admin-token', token);
    }
  }, [token]);

  useEffect(() => {
    let timer: number | undefined;
    void refresh();
    timer = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [refresh]);

  const latestLogLines = useMemo(() => status.logLines.slice(-24).reverse(), [status.logLines]);

  return {
    status,
    latestLogLines,
    loading,
    error,
    token,
    setToken,
    refresh,
    runTask,
    updateSettings,
  };
}
