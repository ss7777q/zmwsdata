import { useEffect, useMemo, useState } from 'react';
import SkillCard, { type SkillBaselineData, type SkillCardData } from '../wiki/SkillCard';
import { useDataFiles } from '../../hooks/useGameData';

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

interface RideSkillBaselineEntry extends SkillBaselineData {
  file: string;
  rideId: number | null;
  slot: string | null;
  skillId: number;
}

interface RideSkillBaselinePayload {
  skills?: RideSkillBaselineEntry[];
}

interface RideMenuEntry {
  groupKey: string;
  rideId: number;
  rideName: string;
}

interface RideWikiIndexEntry {
  fileName: string;
  rideId: number;
  rideName: string;
}

interface RideWikiIndexGroup {
  fileName: string;
  key: string;
  name: string;
  entries: RideWikiIndexEntry[];
}

interface RideWikiIndexPayload {
  groups?: RideWikiIndexGroup[];
}

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
  const indexPayload = dataSources.ride_wiki_index?.data as RideWikiIndexPayload | undefined;
  const indexGroups = useMemo(() => Array.isArray(indexPayload?.groups) ? indexPayload.groups : [], [indexPayload]);
  const firstGroupKey = indexGroups[0]?.fileName ?? '';
  const baselineBySkill = useMemo(() => {
    const payload = dataSources.ride_skill_baseline?.data as RideSkillBaselinePayload | undefined;
    const map = new Map<string, RideSkillBaselineEntry>();
    for (const skill of payload?.skills || []) {
      if (!skill.file || skill.rideId == null || !skill.slot || typeof skill.skillId !== 'number') continue;
      map.set(`${skill.file}|${skill.rideId}|${skill.slot}|${skill.skillId}`, skill);
    }
    return map;
  }, [dataSources]);
  const rideEntries = useMemo<RideMenuEntry[]>(() => {
    const entries: RideMenuEntry[] = [];
    for (const group of indexGroups) {
      for (const entry of group.entries || []) {
        entries.push({
          groupKey: entry.fileName || group.fileName,
          rideId: entry.rideId,
          rideName: entry.rideName,
        });
      }
    }
    return entries;
  }, [indexGroups]);
  const [activeGroupKey, setActiveGroupKey] = useState(firstGroupKey);
  const [activeRideId, setActiveRideId] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[] | null>(null);
  const detailResult = useDataFiles(activeGroupKey ? [activeGroupKey] : [], Boolean(activeGroupKey));
  const mergedSources = useMemo(
    () => ({ ...dataSources, ...detailResult.dataSources }),
    [dataSources, detailResult.dataSources]
  );

  useEffect(() => {
    if (!rideEntries.length) return;
    if (!rideEntries.some((entry) => entry.groupKey === activeGroupKey && entry.rideId === activeRideId)) {
      const firstEntry = rideEntries[0];
      setActiveGroupKey(firstEntry.groupKey);
      setActiveRideId(firstEntry.rideId);
      setPicked(null);
    }
  }, [activeGroupKey, activeRideId, rideEntries]);

  const payload: RideWikiPayload | null = useMemo(() => {
    const src = mergedSources[activeGroupKey];
    return src?.data ?? null;
  }, [activeGroupKey, mergedSources]);

  const activeVariant = useMemo(() => {
    if (!payload?.variants?.length) return null;
    return payload.variants.find((v) => v.ride.id === activeRideId) || payload.variants[0];
  }, [activeRideId, payload]);

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
    const sourceFile = `${activeGroupKey}.json`;
    return activeVariant.slots.map((slot) => {
      const baselineKey = `${sourceFile}|${activeVariant.ride.id}|${slot.slot}|${slot.base.skillId}`;
      const baseline = baselineBySkill.get(baselineKey) ?? null;
      return {
        card: { ...slot.base, skillBaseline: baseline },
        slotLabel: slot.slotLabel,
        badge: slot.slotKind === 'sp' ? '无双' : slot.slotKind === 'passive' ? '被动' : slot.slotKind === 'attack' ? '普攻' : undefined,
      };
    });
  }, [activeGroupKey, activeVariant, baselineBySkill]);

  const switchRideEntry = (entry: RideMenuEntry) => {
    setActiveGroupKey(entry.groupKey);
    setActiveRideId(entry.rideId);
    setPicked(null);
  };

  const toggleLevel = (n: number) => {
    setPicked((prev) => {
      const base = prev ?? defaults;
      return base.includes(n) ? dedupeSort(base.filter((x) => x !== n)) : dedupeSort([...base, n]);
    });
  };

  const detailErrorMessage = activeGroupKey && detailResult.errors[activeGroupKey]
    ? `${activeGroupKey}.json：${detailResult.errors[activeGroupKey]}`
    : '';
  const isDetailLoading = detailResult.loading && !payload;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[24px] border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {rideEntries.map((entry) => (
              <button
              key={`${entry.groupKey}-${entry.rideId}`}
              onClick={() => switchRideEntry(entry)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeGroupKey === entry.groupKey && activeVariant?.ride.id === entry.rideId ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-surface text-textSub hover:text-textMain'
                }`}
            >
              {entry.rideName}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-textSub">对比等级<span className="ml-2 text-xs text-textSub/70">点选多个等级横向对比</span></span>
            {payload ? (
              <div className="flex gap-2 text-xs">
                <button onClick={() => setPicked(defaults)} className="rounded-md bg-surface px-2 py-1 text-textSub hover:text-textMain">默认档位</button>
                <button onClick={() => setPicked(availableLevels)} className="rounded-md bg-surface px-2 py-1 text-textSub hover:text-textMain">全选</button>
                <button onClick={() => setPicked([maxLevel])} className="rounded-md bg-surface px-2 py-1 text-textSub hover:text-textMain">仅满级</button>
              </div>
            ) : (
              <span className="rounded-md bg-surface px-2 py-1 text-xs text-textSub">等级数据加载中...</span>
            )}
          </div>
          {payload ? (
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
          ) : null}
        </div>
      </div>

      {detailErrorMessage ? (
        <div className="card border border-dashed border-red-300 bg-red-50/70 py-20 text-center dark:border-red-500/40 dark:bg-red-500/10">
          <h3 className="text-xl font-medium text-red-700 dark:text-red-200">坐骑技能 Wiki 详情加载失败</h3>
          <p className="mt-2 text-sm text-red-600/80 dark:text-red-100/80">{detailErrorMessage}</p>
        </div>
      ) : isDetailLoading || !activeVariant ? (
        <div className="card border border-dashed border-border bg-transparent py-20 text-center">
          <h3 className="text-xl font-medium text-textSub">正在加载坐骑技能 Wiki...</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c, i) => (
            <SkillCardView key={`${activeVariant.ride.id}-${c.card.skillId}-${i}`} card={c.card} level={displayLevel} levels={selectedLevels} slotLabel={c.slotLabel} badge={c.badge} />
          ))}
        </div>
      )}
    </div>
  );
}
