import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BadgePercent, Gift, PackageOpen, Store } from 'lucide-react';
import { clsx } from 'clsx';
import { useDataFiles } from '../hooks/useGameData';

type Reward = {
  itemId: number;
  name: string;
  count: number;
};

type SurpriseBox = {
  id: number;
  tier: number;
  name: string;
  contentLabel: string;
  waitHours: number;
  poolWeight: number;
  rewards: Reward[];
};

type BoxLevel = {
  level: number;
  levelEnd: number | null;
  boxes: SurpriseBox[];
};

type BoxTier = {
  tier: number;
  name: string;
  waitHours: number;
};

type StageRef = {
  id: number;
  name: string;
};

type ShopItem = {
  kind: 'item';
  name: string;
  quantity: number;
  cost: { itemId: number; name: string; count: number } | null;
  unlockStage: StageRef | null;
  retireStage: StageRef | null;
  unlockLevel: number | null;
  unlockVip: number | null;
};

type ShopCategory = {
  kind: 'category';
  name: string;
  note?: string;
};

type ShopSlot = {
  slot: number;
  items: Array<ShopItem | ShopCategory>;
};

type ShopPrice = {
  itemId: number;
  name: string;
  count: number;
};

type BlackMarketItem = {
  id: number;
  itemId: number;
  name: string;
  quantity: number;
  formerCost: ShopPrice | null;
  cost: ShopPrice | null;
  discountPercent: number | null;
  tag: number | null;
  weight: number;
};

type BlackMarketSlot = {
  slot: number;
  items: BlackMarketItem[];
};

type BlackMarketStage = {
  stage: StageRef;
  nextStage: StageRef | null;
  slots?: BlackMarketSlot[];
  fileName?: string;
};

type BlackMarketMode = {
  id: 'current' | 'special';
  name: string;
  snapshotTime: string;
  activity: {
    id: number;
    name: string;
    startTime: string;
    endTime: string;
  } | null;
  stages: BlackMarketStage[];
};

type ResourceAcquisitionPayload = {
  surpriseBoxes?: {
    note?: string;
    tiers?: BoxTier[];
    levels?: BoxLevel[];
  };
  secretShop?: {
    note?: string;
    slots?: ShopSlot[];
  };
  blackMarket?: {
    note?: string;
    unlockStage?: StageRef;
    dailyRefreshTime?: string;
    modes?: BlackMarketMode[];
  };
};

interface Props {
  dataSources: Record<string, any>;
}

const numberFormatter = new Intl.NumberFormat('zh-CN');

const TIER_STYLES: Record<number, { dot: string; label: string }> = {
  1: { dot: 'bg-amber-500', label: 'text-amber-700 dark:text-amber-300' },
  2: { dot: 'bg-violet-500', label: 'text-violet-700 dark:text-violet-300' },
  3: { dot: 'bg-cyan-500', label: 'text-cyan-700 dark:text-cyan-300' },
};

function asPayload(value: unknown): ResourceAcquisitionPayload {
  return value && typeof value === 'object' ? value as ResourceAcquisitionPayload : {};
}

function formatLevelRange(level: BoxLevel) {
  return level.levelEnd == null ? `Lv.${level.level}+` : `Lv.${level.level}-${level.levelEnd}`;
}

function formatWait(waitHours: number) {
  return waitHours > 0 ? `${waitHours} 小时` : '立即开启';
}

function formatProbability(weight: number, totalWeight: number) {
  if (totalWeight <= 0 || weight <= 0) return '0%';
  const percentage = (weight / totalWeight) * 100;
  if (percentage < 0.01) return '<0.01%';
  return `${percentage.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`;
}

function formatConditions(item: ShopItem) {
  const conditions: string[] = [];
  if (item.unlockStage) conditions.push(`主线达到 ${item.unlockStage.name}`);
  if (item.retireStage) conditions.push(`主线到 ${item.retireStage.name} 前`);
  if (item.unlockLevel != null) conditions.push(`Lv.${item.unlockLevel}`);
  if (item.unlockVip != null) conditions.push(`VIP ${item.unlockVip}`);
  return conditions.length > 0 ? conditions.join(' · ') : '默认开放';
}

function TopTabs({ active }: { active: 'boxes' | 'secret_shop' | 'black_market' }) {
  const navigate = useNavigate();
  const tabs = [
    { id: 'boxes' as const, label: '惊喜宝箱', path: '/resource_acquisition/boxes', icon: Gift },
    { id: 'secret_shop' as const, label: '神秘商店', path: '/resource_acquisition/secret_shop', icon: Store },
    { id: 'black_market' as const, label: '黑市商店', path: '/resource_acquisition/black_market', icon: BadgePercent },
  ];

  return (
    <div className="flex w-max max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 shadow-sm custom-scrollbar">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => navigate(tab.path)}
            className={clsx(
              'flex shrink-0 items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-colors',
              active === tab.id
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-transparent text-textSub hover:bg-card hover:text-textMain'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function SurpriseBoxesView({ payload }: { payload: ResourceAcquisitionPayload }) {
  const levels = payload.surpriseBoxes?.levels ?? [];
  const tiers = payload.surpriseBoxes?.tiers ?? [];
  const [selectedLevel, setSelectedLevel] = useState(() => levels.at(-1)?.level ?? 0);

  useEffect(() => {
    if (levels.length === 0) return;
    if (!levels.some((entry) => entry.level === selectedLevel)) {
      setSelectedLevel(levels.at(-1)?.level ?? levels[0].level);
    }
  }, [levels, selectedLevel]);

  const activeLevel = useMemo(
    () => levels.find((entry) => entry.level === selectedLevel) ?? levels.at(-1) ?? null,
    [levels, selectedLevel]
  );

  if (!activeLevel) return <EmptyState />;
  const totalWeight = activeLevel.boxes.reduce((sum, box) => sum + Math.max(0, box.poolWeight), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <p className="text-sm text-textSub">奖励按宝箱掉落时的角色等级确定，概率按同等级档内全部品质的总权重计算。</p>
        <label className="flex items-center gap-2 text-sm font-semibold text-textMain">
          角色等级档
          <select
            value={activeLevel.level}
            onChange={(event) => setSelectedLevel(Number(event.target.value))}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm text-textMain outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {levels.map((level) => (
              <option key={level.level} value={level.level}>{formatLevelRange(level)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {tiers.map((tier) => {
          const boxes = activeLevel.boxes.filter((box) => box.tier === tier.tier);
          const tone = TIER_STYLES[tier.tier] ?? TIER_STYLES[3];
          return (
            <section key={tier.tier} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', tone.dot)} />
                  <h3 className={clsx('truncate text-sm font-bold', tone.label)}>{tier.name}</h3>
                </div>
                <span className="shrink-0 text-xs font-medium text-textSub">{formatWait(tier.waitHours)}</span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[430px] text-sm">
                  <thead className="bg-card text-left text-xs text-textSub">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2.5 font-semibold">奖励类型</th>
                      <th className="px-4 py-2.5 font-semibold">宝箱内容</th>
                      <th className="px-4 py-2.5 text-right font-semibold">出现概率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {boxes.map((box) => (
                      <tr key={box.id} className="align-top hover:bg-surface/50">
                        <td className="px-4 py-3 font-semibold text-textMain">{box.contentLabel || '-'}</td>
                        <td className="px-4 py-3 text-textMain">
                          <div className="space-y-1">
                            {box.rewards.map((reward) => (
                              <div key={`${box.id}-${reward.itemId}`} className="flex items-baseline justify-between gap-3">
                                <span>{reward.name}</span>
                                <span className="shrink-0 font-mono text-xs text-textSub">x{numberFormatter.format(reward.count)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-primary">
                          {formatProbability(box.poolWeight, totalWeight)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SecretShopView({ payload }: { payload: ResourceAcquisitionPayload }) {
  const slots = payload.secretShop?.slots ?? [];
  const [selectedSlot, setSelectedSlot] = useState(() => slots[0]?.slot ?? 1);
  const activeSlot = slots.find((slot) => slot.slot === selectedSlot) ?? slots[0] ?? null;

  if (!activeSlot) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 custom-scrollbar" aria-label="神秘商店格子">
        {slots.map((slot) => (
          <button
            key={slot.slot}
            type="button"
            onClick={() => setSelectedSlot(slot.slot)}
            className={clsx(
              'h-10 shrink-0 rounded-md border px-4 text-sm font-semibold transition-colors',
              activeSlot.slot === slot.slot
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-border bg-card text-textSub hover:text-textMain'
            )}
          >
            第 {slot.slot} 格
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <PackageOpen className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-textMain">第 {activeSlot.slot} 格商品池</h3>
          </div>
          <span className="text-xs text-textSub">{activeSlot.items.length} 种商品或类别</span>
        </header>
        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-semibold">商品</th>
                <th className="px-4 py-3 text-right font-semibold">数量</th>
                <th className="px-4 py-3 text-right font-semibold">价格</th>
                <th className="px-4 py-3 font-semibold">出现条件</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {activeSlot.items.map((item, index) => item.kind === 'category' ? (
                <tr key={`category-${item.name}`} className="bg-primary/5">
                  <td colSpan={4} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-bold text-primary">{item.name}</span>
                      {item.note ? <span className="text-xs text-textSub">{item.note}</span> : null}
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={`${item.name}-${item.cost?.count ?? 0}-${index}`} className="hover:bg-surface/50">
                  <td className="px-4 py-3 font-semibold text-textMain">{item.name}</td>
                  <td className="px-4 py-3 text-right font-mono text-textMain">{numberFormatter.format(item.quantity)}</td>
                  <td className="px-4 py-3 text-right">
                    {item.cost ? (
                      <span className="whitespace-nowrap font-mono font-semibold text-cta">
                        {numberFormatter.format(item.cost.count)} {item.cost.name}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-textSub">{formatConditions(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatStageRange(stage: BlackMarketStage) {
  return stage.nextStage
    ? `${stage.stage.name} - ${stage.nextStage.name}前`
    : `${stage.stage.name}及以后`;
}

function formatActivityTime(value: string) {
  return value ? value.slice(0, 16) : '-';
}

function formatPrice(price: ShopPrice | null) {
  if (!price) return '-';
  return `${numberFormatter.format(price.count)} ${price.name}`;
}

function formatDiscount(item: BlackMarketItem) {
  if (item.discountPercent == null || item.discountPercent >= 100) return '-';
  const rate = (item.discountPercent / 10).toFixed(1).replace(/\.0$/, '');
  return `${rate} 折`;
}

function BlackMarketView({ payload }: { payload: ResourceAcquisitionPayload }) {
  const market = payload.blackMarket;
  const modes = market?.modes ?? [];
  const [selectedMode, setSelectedMode] = useState<BlackMarketMode['id']>('current');
  const activeMode = modes.find((mode) => mode.id === selectedMode) ?? modes[0] ?? null;
  const stages = activeMode?.stages ?? [];
  const [selectedStage, setSelectedStage] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState(1);

  useEffect(() => {
    if (stages.length === 0) return;
    if (!stages.some((entry) => entry.stage.id === selectedStage)) {
      setSelectedStage(stages.at(-1)?.stage.id ?? stages[0].stage.id);
    }
  }, [selectedStage, stages]);

  const activeStageRef = stages.find((entry) => entry.stage.id === selectedStage) ?? stages.at(-1) ?? null;
  const detailResult = useDataFiles(activeStageRef?.fileName ? [activeStageRef.fileName] : [], Boolean(activeStageRef?.fileName));
  const activeStage = activeStageRef?.fileName
    ? detailResult.dataSources[activeStageRef.fileName]?.data as BlackMarketStage | undefined
    : undefined;
  const activeSlots = activeStage?.slots ?? [];
  const activeSlot = activeSlots.find((slot) => slot.slot === selectedSlot)
    ?? activeSlots[0]
    ?? null;
  const totalWeight = activeSlot?.items.reduce((sum, item) => sum + Math.max(0, item.weight), 0) ?? 0;

  if (!market || !activeMode || !activeStageRef || detailResult.loading || !activeStage || !activeSlot) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 custom-scrollbar" aria-label="黑市价格方案">
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setSelectedMode(mode.id)}
                className={clsx(
                  'h-9 shrink-0 rounded-md px-4 text-sm font-semibold transition-colors',
                  activeMode.id === mode.id
                    ? 'bg-card text-primary shadow-sm ring-1 ring-border'
                    : 'text-textSub hover:text-textMain'
                )}
              >
                {mode.name}
              </button>
            ))}
          </div>

          <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-textMain">
            主线阶段
            <select
              value={activeStage.stage.id}
              onChange={(event) => setSelectedStage(Number(event.target.value))}
              className="h-10 min-w-0 max-w-[260px] rounded-md border border-border bg-card px-3 text-sm text-textMain outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {stages.map((stage) => (
                <option key={stage.stage.id} value={stage.stage.id}>{formatStageRange(stage)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-textSub">
          <span>开放：通关 {market.unlockStage?.name ?? '奈何桥'}</span>
          <span>每日 {market.dailyRefreshTime ?? '06:00'} 刷新</span>
          {activeMode.activity ? (
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              活动时间：{formatActivityTime(activeMode.activity.startTime)} 至 {formatActivityTime(activeMode.activity.endTime)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 custom-scrollbar" aria-label="黑市商店格子">
        {activeSlots.map((slot) => (
          <button
            key={slot.slot}
            type="button"
            onClick={() => setSelectedSlot(slot.slot)}
            className={clsx(
              'h-10 shrink-0 rounded-md border px-4 text-sm font-semibold transition-colors',
              activeSlot.slot === slot.slot
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-border bg-card text-textSub hover:text-textMain'
            )}
          >
            第 {slot.slot} 格
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <BadgePercent className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-textMain">
              {formatStageRange(activeStage)} · 第 {activeSlot.slot} 格
            </h3>
          </div>
          <span className="text-xs text-textSub">{activeSlot.items.length} 种商品</span>
        </header>
        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-semibold">商品</th>
                <th className="px-4 py-3 text-right font-semibold">数量</th>
                <th className="px-4 py-3 text-right font-semibold">原价</th>
                <th className="px-4 py-3 text-right font-semibold">售价</th>
                <th className="px-4 py-3 text-right font-semibold">折扣</th>
                <th className="px-4 py-3 text-right font-semibold">出现概率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {activeSlot.items.map((item) => {
                const discounted = item.discountPercent != null && item.discountPercent < 100;
                return (
                  <tr key={item.id} className="hover:bg-surface/50">
                    <td className="px-4 py-3 font-semibold text-textMain">{item.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-textMain">{numberFormatter.format(item.quantity)}</td>
                    <td className={clsx('px-4 py-3 text-right font-mono text-textSub', discounted && 'line-through')}>
                      {formatPrice(item.formerCost)}
                    </td>
                    <td className={clsx('px-4 py-3 text-right font-mono font-semibold', discounted ? 'text-cta' : 'text-textMain')}>
                      {formatPrice(item.cost)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {discounted ? (
                        <span className="inline-flex min-w-12 justify-center rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                          {formatDiscount(item)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-primary">
                      {formatProbability(item.weight, totalWeight)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border py-20 text-center text-textSub">
      未找到资源获取数据
    </div>
  );
}

export default function ResourceAcquisition({ dataSources }: Props) {
  const location = useLocation();
  const activeView = location.pathname.endsWith('/black_market')
    ? 'black_market'
    : location.pathname.endsWith('/secret_shop')
      ? 'secret_shop'
      : 'boxes';
  const sourceName = activeView === 'black_market'
    ? 'resource/acquisition/black-market/index'
    : activeView === 'secret_shop'
      ? 'resource/acquisition/secret-shop'
      : 'resource/acquisition/boxes';
  const payload = asPayload(dataSources[sourceName]?.data);

  return (
    <div className="space-y-5 pb-16">
      <TopTabs active={activeView} />
      {activeView === 'black_market'
        ? <BlackMarketView payload={payload} />
        : activeView === 'secret_shop'
          ? <SecretShopView payload={payload} />
          : <SurpriseBoxesView payload={payload} />}
    </div>
  );
}
