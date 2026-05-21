import { useEffect, useState } from 'react';
import {
  fetchTempPreviewCatalog,
  fetchTempPreviewRole,
  fetchTempPreviewUnit,
  type TempPreviewCatalogResponse,
  type TempPreviewExport,
  type TempPreviewUnitResponse,
} from '../lib/temp-preview-api';

export function useTempPreviewCatalog() {
  const [data, setData] = useState<TempPreviewCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchTempPreviewCatalog(controller.signal);
        setData(next);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : '加载临时预览目录失败');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return { data, loading, error };
}

export function useTempPreviewRole(roleKey: string | null) {
  const [data, setData] = useState<TempPreviewExport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roleKey) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();

    async function load(currentRoleKey: string) {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchTempPreviewRole(currentRoleKey, controller.signal);
        setData(next);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : '加载角色导出失败');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load(roleKey);
    return () => controller.abort();
  }, [roleKey]);

  return { data, loading, error };
}

export function useTempPreviewUnit(unitSlug: string | null) {
  const [data, setData] = useState<TempPreviewUnitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unitSlug) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();

    async function load(currentUnitSlug: string) {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchTempPreviewUnit(currentUnitSlug, controller.signal);
        setData(next);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : '加载单位详情失败');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load(unitSlug);
    return () => controller.abort();
  }, [unitSlug]);

  return { data, loading, error };
}
