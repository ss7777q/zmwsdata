import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, dataFileUrl, dataManifestUrl, staticDataEnabled } from '../lib/api';

export interface MetaData {
  name?: string;
  extractedAt?: string;
  system?: string;
  source?: string;
  sourceFiles?: string[];
  extractionTime?: string;
  [key: string]: unknown;
}

export interface GameDataFile {
  _meta: MetaData;
  data: unknown;
}

export interface DataFileDescriptor {
  name: string;
  size: number;
  mtimeMs: number;
}

interface FileListResponse {
  files: DataFileDescriptor[];
}

interface FileChangedEvent {
  type: string;
  name: string;
}

interface DataCacheEntry {
  descriptorKey: string;
  content: GameDataFile;
}

const dataFileCache = new Map<string, DataCacheEntry>();
let manifestCache: FileListResponse | null = null;
let manifestPromise: Promise<FileListResponse> | null = null;

function descriptorKey(descriptor?: DataFileDescriptor) {
  if (!descriptor) return 'unknown';
  return `${descriptor.size}:${Math.floor(descriptor.mtimeMs || 0)}`;
}

export function matchesSystemFilter(name: string, systemFilter?: string) {
  if (!systemFilter) return true;
  if (systemFilter === 'ops') return false;
  if (systemFilter === 'resist') return name === 'exp';
  if (systemFilter === 'ride') return name.startsWith('ride');
  if (systemFilter === 'pet') return name.startsWith('pet_');
  if (systemFilter === 'beast_stats') return name.startsWith('beast_') || name.startsWith('pet_champion');
  if (systemFilter === 'role_cultivate') {
    return ['role_heart', 'role_meridians', 'role_danqi', 'role_danyuan', 'role_danyuan_effect', 'role_danyuan_effect_index', 'role_xianpo'].includes(name) || name.startsWith('role_danyuan_effect_family_');
  }
  if (systemFilter === 'role_spiritual') {
    return name.startsWith('role_magic') || name.startsWith('role_godweapon') || name.startsWith('role_matrix');
  }
  if (systemFilter === 'role_extreme_stats') {
    return name.startsWith('role_extreme_stats');
  }
  if (systemFilter === 'role_wing') {
    return name.startsWith('role_wing') || name.startsWith('role_feather');
  }
  if (systemFilter === 'call_god') return name.startsWith('call_god');
  if (systemFilter === 'rogue_item') return name.startsWith('rogue_item');
  if (systemFilter === 'role_honor') {
    return name === 'role_honor';
  }
  if (systemFilter === 'role_wiki') return name.startsWith('role_wiki');
  if (systemFilter === 'role_equip') {
    return name.startsWith('role_equip') && name !== 'role_equip_baptism';
  }
  return name.startsWith(systemFilter);
}

export async function loadDataManifest() {
  if (manifestCache) return manifestCache;
  if (!manifestPromise) {
    const useStaticData = staticDataEnabled();
    manifestPromise = fetch(useStaticData ? dataManifestUrl() : apiUrl('/api/files'))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(useStaticData ? `Load data manifest failed: ${response.status}` : `Load /api/files failed: ${response.status}`);
        }
        return response.json() as Promise<FileListResponse>;
      })
      .then((payload) => {
        manifestCache = payload;
        return payload;
      })
      .finally(() => {
        manifestPromise = null;
      });
  }
  return manifestPromise;
}

export async function loadDataFile(name: string, signal?: AbortSignal) {
  const useStaticData = staticDataEnabled();
  const response = await fetch(
    useStaticData ? dataFileUrl(name) : apiUrl(`/api/data/${encodeURIComponent(name)}`),
    signal ? { signal } : undefined
  );
  if (!response.ok) {
    throw new Error(`Load ${name}.json failed: ${response.status}`);
  }
  return response.json() as Promise<GameDataFile>;
}

async function loadCachedDataFile(name: string, descriptor: DataFileDescriptor | undefined, signal?: AbortSignal) {
  const key = descriptorKey(descriptor);
  const cached = dataFileCache.get(name);
  if (cached && cached.descriptorKey === key) {
    return cached.content;
  }

  const content = await loadDataFile(name, signal);
  if (content?._meta) {
    dataFileCache.set(name, { descriptorKey: key, content });
  }
  return content;
}

function readCachedRequiredSources(requiredNames: string[]) {
  const entries = requiredNames
    .map((name) => {
      const cached = dataFileCache.get(name)?.content;
      return cached ? ([name, cached] as const) : null;
    })
    .filter((entry): entry is readonly [string, GameDataFile] => Boolean(entry));
  return Object.fromEntries(entries);
}

function uniqueNames(names: readonly string[]) {
  return [...new Set(names.filter((name) => typeof name === 'string' && name.trim().length > 0).map((name) => name.trim()))]
    .sort((left, right) => left.localeCompare(right));
}

export function useDataFiles(requiredNames: readonly string[], enabled = true) {
  const normalizedNames = useMemo(() => uniqueNames(requiredNames), [requiredNames]);
  const namesKey = normalizedNames.join('\n');
  const [allSources, setAllSources] = useState<Record<string, GameDataFile>>(() => readCachedRequiredSources(normalizedNames));
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const useStaticData = staticDataEnabled();

  const refreshOne = useCallback(async (name: string, descriptor?: DataFileDescriptor) => {
    const fileData = await loadCachedDataFile(name, descriptor);
    if (fileData?._meta) {
      setAllSources((prev) => ({ ...prev, [name]: fileData }));
      setErrors((prev) => {
        if (!(name in prev)) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const required = namesKey ? namesKey.split('\n') : [];
    setAllSources(readCachedRequiredSources(required));
  }, [namesKey]);

  useEffect(() => {
    let disposed = false;
    let stream: EventSource | null = null;
    const controller = new AbortController();
    const required = namesKey ? namesKey.split('\n') : [];

    if (!enabled || required.length === 0) {
      setLoading(false);
      setErrors({});
      return () => {
        disposed = true;
        controller.abort();
      };
    }

    async function init() {
      setLoading(true);
      setErrors({}); // 路由/依赖变化时先清掉上一组文件的错误，避免残留横幅
      const nextErrors: Record<string, string> = {};
      try {
        const { files } = await loadDataManifest();
        const descriptors = new Map(files.map((file) => [file.name, file]));
        const entries = await Promise.all(required.map(async (name) => {
          const descriptor = descriptors.get(name);
          if (!descriptor) {
            nextErrors[name] = `配置文件不存在: ${name}.json`;
            return null;
          }
          try {
            const content = await loadCachedDataFile(name, descriptor, controller.signal);
            return [name, content] as const;
          } catch (err) {
            if (controller.signal.aborted) return null;
            nextErrors[name] = err instanceof Error ? err.message : `Load ${name}.json failed`;
            return null;
          }
        }));
        if (disposed) return;
        setAllSources((previous) => ({
          ...previous,
          ...Object.fromEntries(entries.filter((entry): entry is readonly [string, GameDataFile] => Boolean(entry))),
        }));
        setErrors(nextErrors);
      } catch (err) {
        if (disposed || controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : '加载配置清单失败';
        setErrors(Object.fromEntries(required.map((name) => [name, message])));
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void init();

    if (!useStaticData && typeof window !== 'undefined' && 'EventSource' in window) {
      stream = new EventSource(apiUrl('/api/stream'));
      stream.addEventListener('file-changed', (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as FileChangedEvent;
          if (!payload?.name || !required.includes(payload.name)) return;
          manifestCache = null;
          if (payload.type === 'deleted') {
            dataFileCache.delete(payload.name);
            setAllSources((prev) => {
              const next = { ...prev };
              delete next[payload.name];
              return next;
            });
            setErrors((prev) => ({ ...prev, [payload.name]: `配置文件已删除: ${payload.name}.json` }));
            return;
          }
          void loadDataManifest()
            .then(({ files }) => refreshOne(payload.name, files.find((file) => file.name === payload.name)))
            .catch((err) => console.error(`Failed to refresh ${payload.name}:`, err));
        } catch (err) {
          console.error('Invalid stream payload:', err);
        }
      });
      stream.addEventListener('error', () => {
        console.warn('Data stream disconnected, browser will retry automatically.');
      });
    }

    return () => {
      disposed = true;
      controller.abort();
      stream?.close();
    };
  }, [enabled, namesKey, refreshOne, useStaticData]);

  const filteredSources = useMemo(() => {
    const required = namesKey ? namesKey.split('\n') : [];
    return Object.fromEntries(required.map((name) => [name, allSources[name]]).filter(([, value]) => Boolean(value)));
  }, [allSources, namesKey]);

  return {
    loading,
    dataSources: filteredSources,
    allSources,
    errors,
    loadedNames: Object.keys(filteredSources),
    missingNames: normalizedNames.filter((name) => !filteredSources[name] && !errors[name]),
    reload: refreshOne,
  };
}

function useManifestFileNames(systemFilter?: string, enabled = true) {
  const [fileNames, setFileNames] = useState<string[]>([]);

  useEffect(() => {
    let disposed = false;

    if (!enabled) {
      return () => {
        disposed = true;
      };
    }

    async function init() {
      try {
        const { files } = await loadDataManifest();
        if (!disposed) {
          setFileNames(files.filter((file) => matchesSystemFilter(file.name, systemFilter)).map((file) => file.name));
        }
      } catch (err) {
        console.error('Failed to load data manifest:', err);
      }
    }

    void init();

    return () => {
      disposed = true;
    };
  }, [enabled, systemFilter]);

  return fileNames;
}

export function useGameData(systemFilter?: string, enabled = true) {
  const fileNames = useManifestFileNames(systemFilter, enabled);
  const result = useDataFiles(fileNames, enabled && fileNames.length > 0);

  const filteredSources = useMemo(() => {
    return Object.fromEntries(
      Object.entries(result.allSources).filter(([key]) => {
        return matchesSystemFilter(key, systemFilter);
      })
    );
  }, [result.allSources, systemFilter]);

  return {
    ...result,
    dataSources: filteredSources,
    allSources: result.allSources
  };
}
