import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { apiUrl } from '../lib/api';
import { AttributeTab } from '../components/callGodStats/CallGodAttributeTab';
import { BossAnalysisTab, BossCommonSkillsTab, BossTalentsTab } from '../components/callGodStats/CallGodBossTabs';
import { StageLimitsTab } from '../components/callGodStats/CallGodStageLimitsTab';
import { StoneRewardsTab } from '../components/callGodStats/CallGodStoneRewardsTab';
import type { BattlefieldConfig, BattlefieldResult, BossAnalysisEntry, BossCommonSkillAnalysis, BossTalentAnalysis, OutputDataFile, Props, StageLimitPayload, StoneRewardPayload } from '../components/callGodStats/callGodStatsShared';

export default function CallGodStats({ dataSources }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = useMemo(() => [
    { key: 'stats', label: '神魔属性', path: '/call_god/stats' },
    { key: 'limits', label: '关卡等级上限', path: '/call_god/limits' },
    { key: 'stones', label: '神/魔灵石获取详情', path: '/call_god/stones' },
    { key: 'boss', label: '魔王解析', path: '/call_god/boss' },
    { key: 'common_skills', label: '通用魔王技能', path: '/call_god/common_skills' },
    { key: 'talents', label: '通用魔王天赋', path: '/call_god/talents' },
  ] as const, []);
  const activeTab = tabs.find((tab) => tab.path === location.pathname)?.key ?? 'stats';
  const [config, setConfig] = useState<BattlefieldConfig | null>(null);
  const [result, setResult] = useState<BattlefieldResult | null>(null);
  const [battlefieldTier, setBattlefieldTier] = useState<number>(0);
  const [starLevel, setStarLevel] = useState<number>(8);
  const [bossStage, setBossStage] = useState<number>(6);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');

  const stoneRewardPayload = useMemo(() => {
    const source = dataSources.call_god_stone_rewards as OutputDataFile<StoneRewardPayload> | undefined;
    return source?.data || null;
  }, [dataSources]);

  const stageLimitPayload = useMemo(() => {
    const source = dataSources.call_god_stage_limits as OutputDataFile<StageLimitPayload> | undefined;
    return source?.data || null;
  }, [dataSources]);

  const bossAnalysisPayload = useMemo(() => {
    const source = dataSources.call_god_boss_analysis as OutputDataFile<BossAnalysisEntry[]> | undefined;
    return Array.isArray(source?.data) ? source.data : [];
  }, [dataSources]);

  const bossTalentPayload = useMemo(() => {
    const source = dataSources.call_god_boss_talents as OutputDataFile<BossTalentAnalysis[]> | undefined;
    return Array.isArray(source?.data) ? source.data : [];
  }, [dataSources]);

  const bossCommonSkillPayload = useMemo(() => {
    const source = dataSources.call_god_boss_common_skills as OutputDataFile<BossCommonSkillAnalysis[]> | undefined;
    return Array.isArray(source?.data) ? source.data : [];
  }, [dataSources]);

  useEffect(() => {
    let disposed = false;

    async function loadConfig() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(apiUrl('/api/battlefield/config'), { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || '加载配置失败');
        }
        if (disposed) return;
        setConfig(payload);
        setBattlefieldTier(payload.selectors.battlefieldTier.default ?? payload.selectors.battlefieldTier.values.at(-1) ?? 1);
        setStarLevel(payload.selectors.starLevel.default ?? 8);
        setBossStage(payload.selectors.bossStage.default ?? payload.selectors.bossStage.values[0] ?? 1);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err.message : '加载配置失败');
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void loadConfig();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!config || battlefieldTier <= 0 || starLevel < 0 || bossStage <= 0) {
      return;
    }

    let disposed = false;

    async function calculate() {
      setCalculating(true);
      setError('');
      try {
        const response = await fetch(apiUrl('/api/battlefield'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ battlefieldTier, starLevel, bossStage }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || '计算失败');
        }
        if (disposed) return;
        setResult(payload);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err.message : '计算失败');
      } finally {
        if (!disposed) setCalculating(false);
      }
    }

    void calculate();
    return () => {
      disposed = true;
    };
  }, [battlefieldTier, bossStage, config, starLevel]);

  return (
    <div className="space-y-6 pb-20">
      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => navigate(tab.path)}
              className={clsx(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface/60 text-textSub hover:bg-surface hover:text-textMain'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'stats' ? (
        <AttributeTab
          config={config}
          result={result}
          loading={loading}
          calculating={calculating}
          error={error}
          battlefieldTier={battlefieldTier}
          starLevel={starLevel}
          bossStage={bossStage}
          setBattlefieldTier={setBattlefieldTier}
          setStarLevel={setStarLevel}
          setBossStage={setBossStage}
        />
      ) : activeTab === 'limits' ? (
        <StageLimitsTab payload={stageLimitPayload} />
      ) : activeTab === 'stones' ? (
        <StoneRewardsTab payload={stoneRewardPayload} />
      ) : activeTab === 'talents' ? (
        <BossTalentsTab talents={bossTalentPayload} />
      ) : activeTab === 'common_skills' ? (
        <BossCommonSkillsTab skills={bossCommonSkillPayload} />
      ) : (
        <BossAnalysisTab payload={bossAnalysisPayload} />
      )}
    </div>
  );
}
