import { useEffect, useMemo, useState } from 'react';
import SkillCard, { type SkillCardData } from '../wiki/SkillCard';

const SkillCardView = SkillCard as any;

interface Props {
  dataSources: Record<string, any>;
}

interface RideSkillSlot {
  slot: string;
  slotLabel: string;
  slotKind: string;
  base: SkillCardData;
  awakens?: SkillCardData[];
}

interface RideWikiVariant {
  ride: { id: number; name: string; cfgFile?: string | null; idGroup?: number; rank?: number };
  slots: RideSkillSlot[];
}

interface RideWikiPayload {
  rideGroup: { key: string; name: string; note?: string };
  variants: RideWikiVariant[];
}

const GROUPS = [
  { key: 'ride_wiki_diting', name: '谛听' },
  { key: 'ride_wiki_pixiu', name: '天禄/辟邪' },
  { key: 'ride_wiki_qingshi', name: '青狮/青鬃狮王' },
  { key: 'ride_wiki_nianshou', name: '年兽/上古年兽/永冬年兽' },
  { key: 'ride_wiki_fenghuang', name: '赤凤/赤炎凤凰/青鸾/寒冰凤凰' },
  { key: 'ride_wiki_wangwang', name: '汪汪/超级汪' },
  { key: 'ride_wiki_jinmaohou', name: '金毛犼/冲天神犼' },
  { key: 'ride_wiki_mojingshou', name: '魔睛兽/金睛兽' },
];

function dedupeSort(arr: number[]) {
  return [...new Set(arr)].filter((n) => n >= 1).sort((a, b) => a - b);
}

function pickNearestLevel(levels: number[], target: number) {
  for (const level of levels) if (level >= target) return level;
  return levels[levels.length - 1] ?? 1;
}

function defaultPicks(levels: number[]) {
  if (!levels.length) return [];
  const maxLevel = levels[levels.length - 1];
  return dedupeSort([
    levels[0],
    pickNearestLevel(levels, Math.ceil(maxLevel / 4)),
    pickNearestLevel(levels, Math.ceil(maxLevel / 2)),
    pickNearestLevel(levels, Math.ceil((maxLevel * 3) / 4)),
    maxLevel,
  ]);
}

function collectCardLevels(card: SkillCardData | undefined, levelSet: Set<number>) {
  for (const row of card?.levels || []) {
    if (typeof row.level === 'number' && Number.isFinite(row.level)) levelSet.add(row.level);
  }
}

export default function RideSkillWiki({ dataSources }: Props) {
  const availableGroups = useMemo(() => GROUPS.filter((g) => dataSources[g.key]?.data), [dataSources]);
  const [activeGroupKey, setActiveGroupKey] = useState(GROUPS[0].key);
  const [activeRideId, setActiveRideId] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[] | null>(null);

  useEffect(() => {
    if (!availableGroups.length) return;
    if (!availableGroups.some((g) => g.key === activeGroupKey)) {
      setActiveGroupKey(availableGroups[0].key);
      setActiveRideId(null);
      setPicked(null);
    }
  }, [activeGroupKey, availableGroups]);

  const payload: RideWikiPayload | null = useMemo(() => {
    const src = dataSources[activeGroupKey];
    return src?.data ?? null;
  }, [activeGroupKey, dataSources]);

  const filteredVariants = useMemo(() => {
    if (!payload?.variants?.length) return [];
    const variantsByGroup = new Map<number, RideWikiVariant[]>();
    for (const variant of payload.variants) {
      const groupKey = variant.ride.idGroup ?? variant.ride.id;
      const bucket = variantsByGroup.get(groupKey) ?? [];
      bucket.push(variant);
      variantsByGroup.set(groupKey, bucket);
    }

    return Array.from(variantsByGroup.values()).flatMap((variants) => {
      const ranked = variants.filter((variant) => variant.ride.rank != null);
      const rankSource = ranked.length ? ranked : variants;
      const maxRank = Math.max(...rankSource.map((variant) => variant.ride.rank ?? Number.NEGATIVE_INFINITY));
      const highestRanked = rankSource.filter((variant) => (variant.ride.rank ?? Number.NEGATIVE_INFINITY) === maxRank);
      const maxSlotCount = Math.max(...highestRanked.map((variant) => variant.slots.length));
      return highestRanked.filter((variant) => variant.slots.length === maxSlotCount);
    });
  }, [payload]);

  useEffect(() => {
    if (!filteredVariants.length) return;
    if (!filteredVariants.some((variant) => variant.ride.id === activeRideId)) {
      setActiveRideId(filteredVariants[0].ride.id);
      setPicked(null);
    }
  }, [activeRideId, filteredVariants]);

  const activeVariant = useMemo(() => {
    if (!filteredVariants.length) return null;
    return filteredVariants.find((v) => v.ride.id === activeRideId) || filteredVariants[0];
  }, [activeRideId, filteredVariants]);

  const availableLevels = useMemo(() => {
    const levelSet = new Set<number>();
    for (const slot of activeVariant?.slots || []) collectCardLevels(slot.base, levelSet);
    return [...levelSet].sort((a, b) => a - b);
  }, [activeVariant]);
  const maxLevel = availableLevels[availableLevels.length - 1] ?? 1;

  const defaults = useMemo(() => defaultPicks(availableLevels), [availableLevels]);
  const selectedLevels = useMemo(() => {
    const allowed = new Set(availableLevels);
    const filtered = (picked ?? defaults).filter((level) => allowed.has(level));
    return filtered.length ? filtered : defaults;
  }, [availableLevels, defaults, picked]);
  const displayLevel = selectedLevels[selectedLevels.length - 1] ?? maxLevel;

  const cards = useMemo(() => {
    if (!activeVariant?.slots) return [];
    return activeVariant.slots.map((slot) => ({
      card: slot.base,
      slotLabel: slot.slotLabel,
      badge: slot.slotKind === 'sp' ? '无双' : slot.slotKind === 'passive' ? '被动' : undefined,
    }));
  }, [activeVariant]);

  const switchGroup = (key: string) => {
    setActiveGroupKey(key);
    setActiveRideId(null);
    setPicked(null);
  };

  const switchRide = (id: number) => {
    setActiveRideId(id);
    setPicked(null);
  };

  const toggleLevel = (n: number) => {
    setPicked((prev) => {
      const base = prev ?? defaults;
      return base.includes(n) ? dedupeSort(base.filter((x) => x !== n)) : dedupeSort([...base, n]);
    });
  };

  if (!payload || !activeVariant) {
    return (
      <div className="card border border-dashed border-border bg-transparent py-20 text-center">
        <h3 className="text-xl font-medium text-textSub">正在加载坐骑技能 Wiki...</h3>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[24px] border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {availableGroups.map((g) => (
            <button
              key={g.key}
              onClick={() => switchGroup(g.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeGroupKey === g.key ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-surface text-textSub hover:text-textMain'
                }`}
            >
              {g.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {filteredVariants.map((v) => (
            <button
              key={v.ride.id}
              onClick={() => switchRide(v.ride.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeVariant.ride.id === v.ride.id ? 'bg-primary text-white' : 'bg-surface text-textSub hover:text-textMain'
                }`}
            >
              {v.ride.name}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-textSub">对比等级<span className="ml-2 text-xs text-textSub/70">点选多个等级横向对比</span></span>
            <div className="flex gap-2 text-xs">
              <button onClick={() => setPicked(defaults)} className="rounded-md bg-surface px-2 py-1 text-textSub hover:text-textMain">默认档位</button>
              <button onClick={() => setPicked(availableLevels)} className="rounded-md bg-surface px-2 py-1 text-textSub hover:text-textMain">全选</button>
              <button onClick={() => setPicked([maxLevel])} className="rounded-md bg-surface px-2 py-1 text-textSub hover:text-textMain">仅满级</button>
            </div>
          </div>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {availableLevels.map((n) => {
              const on = selectedLevels.includes(n);
              return (
                <button
                  key={n}
                  onClick={() => toggleLevel(n)}
                  className={`min-w-[2.5rem] rounded-lg px-2 py-1 text-center font-mono text-xs transition-colors ${on ? 'bg-primary text-white' : 'bg-surface text-textSub hover:text-textMain'
                    }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c, i) => (
          <SkillCardView key={`${activeVariant.ride.id}-${c.card.skillId}-${i}`} card={c.card} level={displayLevel} levels={selectedLevels} slotLabel={c.slotLabel} badge={c.badge} />
        ))}
      </div>
    </div>
  );
}
