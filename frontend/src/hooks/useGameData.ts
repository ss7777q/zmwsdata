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
  data: unknown[];
}

interface DataFileDescriptor {
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

function matchesSystemFilter(name: string, systemFilter?: string) {
  if (!systemFilter) return true;
  if (systemFilter === 'ops') return false;
  if (systemFilter === 'resist') return name === 'exp';
  if (systemFilter === 'ride') return name.startsWith('ride');
  if (systemFilter === 'pet') return name.startsWith('pet_');
  if (systemFilter === 'beast_stats') return name.startsWith('beast_');
  if (systemFilter === 'role_cultivate') {
    return ['role_heart', 'role_meridians', 'role_danqi', 'role_danyuan', 'role_danyuan_effect', 'role_xianpo'].includes(name);
  }
  if (systemFilter === 'role_spiritual') {
    return name.startsWith('role_magic') || name.startsWith('role_godweapon') || name.startsWith('role_matrix');
  }
  if (systemFilter === 'role_wing') {
    return name.startsWith('role_wing') || name.startsWith('role_feather');
  }
  if (systemFilter === 'role_wiki') return name.startsWith('role_wiki');
  if (systemFilter === 'role_equip') {
    return name.startsWith('role_equip') && name !== 'role_equip_baptism';
  }
  return name.startsWith(systemFilter);
}

export function useGameData(systemFilter?: string, enabled = true) {
  const [allSources, setAllSources] = useState<Record<string, GameDataFile>>({});
  const [loading, setLoading] = useState(true);
  const useStaticData = staticDataEnabled();

  const loadFile = useCallback(async (name: string) => {
    const response = await fetch(useStaticData ? dataFileUrl(name) : apiUrl(`/api/data/${encodeURIComponent(name)}`));
    if (!response.ok) {
      throw new Error(`Load ${name}.json failed: ${response.status}`);
    }
    return response.json() as Promise<GameDataFile>;
  }, [useStaticData]);

  const refreshOne = useCallback(async (name: string) => {
    try {
      const fileData = await loadFile(name);
      if (fileData?._meta) {
        setAllSources((prev) => ({ ...prev, [name]: fileData }));
      }
    } catch (err) {
      console.error(`Failed to refresh ${name}:`, err);
    }
  }, [loadFile]);

  const refreshAll = useCallback(async (activeSystemFilter?: string) => {
    const response = await fetch(useStaticData ? dataManifestUrl() : apiUrl('/api/files'));
    if (!response.ok) {
      throw new Error(useStaticData ? `Load data manifest failed: ${response.status}` : `Load /api/files failed: ${response.status}`);
    }
    const { files } = (await response.json()) as FileListResponse;
    const targetFiles = files.filter((file) => matchesSystemFilter(file.name, activeSystemFilter));
    const entries = await Promise.all(
      targetFiles.map(async (file) => {
        const content = await loadFile(file.name);
        return [file.name, content] as const;
      })
    );
    setAllSources((previous) => ({
      ...previous,
      ...Object.fromEntries(entries),
    }));
  }, [loadFile, useStaticData]);

  useEffect(() => {
    let disposed = false;
    let stream: EventSource | null = null;

    if (!enabled) {
      setLoading(false);
      return () => {
        disposed = true;
      };
    }

    async function init() {
      setLoading(true);
      try {
        await refreshAll(systemFilter);
      } catch (err) {
        console.error('Failed to load game data from API:', err);
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
          if (!payload?.name) return;
          if (!matchesSystemFilter(payload.name, systemFilter)) {
            return;
          }
          if (payload.type === 'deleted') {
            setAllSources((prev) => {
              const next = { ...prev };
              delete next[payload.name];
              return next;
            });
            return;
          }
          void refreshOne(payload.name);
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
      stream?.close();
    };
  }, [enabled, refreshAll, refreshOne, systemFilter, useStaticData]);

  const filteredSources = useMemo(() => {
    return Object.fromEntries(
      Object.entries(allSources).filter(([key]) => {
        return matchesSystemFilter(key, systemFilter);
      })
    );
  }, [allSources, systemFilter]);

  return {
    loading,
    dataSources: filteredSources,
    allSources
  };
}
