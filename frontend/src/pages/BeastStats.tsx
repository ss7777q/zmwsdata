import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import type { BeastDetailResponse, BeastLineupAnalysisResponse, BeastPlayerAnalysisResponse } from '../lib/api';
import { loadDataFile } from '../hooks/useGameData';
import { DetailTab } from '../components/beastStats/BeastDetailTab';
import { LineupTab } from '../components/beastStats/BeastLineupTab';
import { PlayerTab } from '../components/beastStats/BeastPlayerTab';
import { EmptyState, type BeastStatsProps, type BeastTab } from '../components/beastStats/beastStatsShared';

async function fetchDataFile<T>(name: string): Promise<T> {
  const payload = await loadDataFile(name) as { data?: T };
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new Error(`${name} 返回格式不正确`);
  }

  return payload.data as T;
}

export default function BeastStats({ detailSource, lineupSource, playerSource, loading = false }: BeastStatsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: BeastTab = location.pathname.endsWith('/lineup')
    ? 'lineup'
    : location.pathname.endsWith('/players')
      ? 'players'
      : 'detail';
  const [detailData, setDetailData] = useState<BeastDetailResponse | undefined>(detailSource);
  const [lineupData, setLineupData] = useState<BeastLineupAnalysisResponse | undefined>(lineupSource);
  const [playerData, setPlayerData] = useState<BeastPlayerAnalysisResponse | undefined>(playerSource);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setDetailData(detailSource);
  }, [detailSource]);

  useEffect(() => {
    setLineupData(lineupSource);
  }, [lineupSource]);

  useEffect(() => {
    setPlayerData(playerSource);
  }, [playerSource]);

  useEffect(() => {
    let cancelled = false;

    async function loadMissing() {
      try {
        const tasks: Promise<void>[] = [];

        if (activeTab === 'detail' && !detailSource) {
          tasks.push(fetchDataFile<BeastDetailResponse>('beast_detail').then((data) => {
            if (!cancelled) setDetailData(data);
          }));
        }

        if (activeTab === 'lineup' && !lineupSource) {
          tasks.push(fetchDataFile<BeastLineupAnalysisResponse>('beast_lineup_analysis').then((data) => {
            if (!cancelled) setLineupData(data);
          }));
        }

        if (activeTab === 'players' && !detailSource) {
          tasks.push(fetchDataFile<BeastDetailResponse>('beast_detail').then((data) => {
            if (!cancelled) setDetailData(data);
          }));
        }

        if (activeTab === 'players' && !playerSource) {
          tasks.push(fetchDataFile<BeastPlayerAnalysisResponse>('beast_player_analysis').then((data) => {
            if (!cancelled) setPlayerData(data);
          }));
        }

        if (tasks.length === 0) {
          if (!cancelled) setErrorMessage(null); // 数据已齐时也要清掉上次的错误，避免永久卡在错误页
          return;
        }
        await Promise.all(tasks);
        if (!cancelled) setErrorMessage(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '万兽统计数据加载失败');
        }
      }
    }

    void loadMissing();

    return () => {
      cancelled = true;
    };
  }, [activeTab, detailSource, lineupSource, playerSource]);

  if (loading && ((activeTab === 'detail' && !detailData) || (activeTab === 'lineup' && !lineupData) || (activeTab === 'players' && (!detailData || !playerData)))) {
    return <EmptyState message="正在加载万兽统计数据..." />;
  }

  if (errorMessage) {
    return <EmptyState message={errorMessage} />;
  }

  if ((activeTab === 'detail' && !detailData) || (activeTab === 'lineup' && !lineupData) || (activeTab === 'players' && (!detailData || !playerData))) {
    return <EmptyState message="万兽统计数据暂未准备完成" />;
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-max max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar relative z-10">
        {[
          { id: 'detail', label: '详情', path: '/pet_champion/detail' },
          { id: 'lineup', label: '阵容分析', path: '/pet_champion/lineup' },
          { id: 'players', label: '兽王玩家分析', path: '/pet_champion/players' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigate(tab.path)}
            className={clsx(
              'px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 relative overflow-hidden',
              activeTab === tab.id
                ? 'text-white shadow-lg shadow-primary/20 bg-primary/20 border border-primary/50'
                : 'text-textSub hover:text-textMain hover:bg-white/5 border border-transparent'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'detail' && detailData ? <DetailTab source={detailData} /> : null}
      {activeTab === 'lineup' && lineupData ? <LineupTab source={lineupData} /> : null}
      {activeTab === 'players' && playerData && detailData ? <PlayerTab source={playerData} detailSource={detailData} /> : null}
    </div>
  );
}
