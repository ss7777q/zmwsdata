import { useEffect, useState } from 'react';
import { fetchVisitorStats, registerVisitorStats, type VisitorStatsResponse } from '../lib/api';

const VISITOR_ID_STORAGE_KEY = 'deployable-app-visitor-id';
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

function createVisitorId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
}

function getVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);
  if (existing) return existing;
  const next = createVisitorId();
  window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, next);
  return next;
}

export function useVisitorStats() {
  const [stats, setStats] = useState<VisitorStatsResponse | null>(null);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const visitorId = getVisitorId();

    async function syncStats() {
      try {
        const next = await registerVisitorStats(visitorId, controller.signal);
        if (!disposed) {
          setStats(next);
        }
      } catch {
        if (disposed) return;
        try {
          const fallback = await fetchVisitorStats(controller.signal);
          if (!disposed) {
            setStats(fallback);
          }
        } catch {
          // ignore temporary stats errors to avoid disturbing page usage
        }
      }
    }

    void syncStats();
    const timer = window.setInterval(() => {
      void syncStats();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  return stats;
}
