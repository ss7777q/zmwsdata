import { useMemo, useState } from 'react';
import { clsx } from 'clsx';

type RewardMonster = {
  id: number | string;
  ids?: number[];
  name: string;
  count: number;
  isChoice?: boolean;
};

type RewardCoefficients = {
  expMonster: number;
  expBoss: number;
  soulMonster: number;
  soulBoss: number;
};



type StageReward = {
  stageId: number | string;
  stageName: string;
  type: number | string;
  typeLabel: string;
  slug: string;
  stageLv?: number | null;
  lvOpen?: number | null;
  chainStageIds?: Array<number | string>;
  mapNames: string[];
  rewardCoefficients: RewardCoefficients | null;
  coefficientSetIsUniform?: boolean;
  counts: {
    normal: number;
    boss: number;
    total: number;
  };
  reward: {
    experience: number;
    soul: number;
  };
  monsters: {
      normal: RewardMonster[];
      boss: RewardMonster[];
    };
  segments?: StageReward[];
  warnings: string[];
};

type RewardGroup = {
  type: number | string;
  label: string;
  slug: string;
  stageCount: number;
  totalExperience: number;
  totalSoul: number;
  stages: StageReward[];
};

type RewardPayload = {
  summary?: {
    stageCount: number;
    typeCount: number;
    totalExperience: number;
    totalSoul: number;
    includedTypes: string[];
  };
  types?: RewardGroup[];
};

interface Props {
  dataSources: Record<string, any>;
}

const numberFormatter = new Intl.NumberFormat('zh-CN');
function formatNumber(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return numberFormatter.format(value);
}

function asPayload(value: unknown): RewardPayload {
  if (!value || typeof value !== 'object') return {};
  const payload = value as RewardPayload;
  return {
    summary: payload.summary,
    types: Array.isArray(payload.types) ? payload.types : [],
  };
}



export default function StageRewards({ dataSources }: Props) {
  const payload = asPayload(dataSources.stage_reward_exp_soul?.data);
  const groups = payload.types || [];
  const [activeSlug, setActiveSlug] = useState(() => groups[0]?.slug || 'mainline');

  const activeGroup = useMemo(
    () => groups.find((group) => group.slug === activeSlug) || groups[0] || null,
    [activeSlug, groups]
  );

  if (!dataSources.stage_reward_exp_soul) {
    return (
      <div className="card text-center py-20 border border-dashed border-border bg-transparent">
        <h3 className="text-xl text-textSub font-medium">正在加载关卡奖励数据...</h3>
      </div>
    );
  }

  if (!activeGroup) {
    return (
      <div className="card text-center py-20 border border-dashed border-border bg-transparent">
        <h3 className="text-xl text-textSub font-medium">未找到关卡奖励数据</h3>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20">


      <div className="flex flex-wrap gap-2">
        {groups.map((group) => (
          <button
            key={group.slug}
            type="button"
            onClick={() => {
              setActiveSlug(group.slug);
            }}
            className={clsx(
              'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              activeGroup.slug === group.slug
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-card text-textSub hover:text-textMain'
            )}
          >
            {group.label} · {formatNumber(group.stageCount)}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">


        <div className="max-h-[82vh] overflow-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-semibold">关卡</th>
                <th className="px-4 py-3 text-right font-semibold">基础经验</th>
                <th className="px-4 py-3 text-right font-semibold">基础灵魂</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {activeGroup.stages.map((stage) => (
                <tr key={String(stage.stageId)} className="align-top hover:bg-surface/50">
                  <td className="px-4 py-3 font-semibold text-textMain">{stage.stageName}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-primary">{formatNumber(stage.reward.experience)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-cta">{formatNumber(stage.reward.soul)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
