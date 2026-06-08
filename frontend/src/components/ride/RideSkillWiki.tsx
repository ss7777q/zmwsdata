import { useEffect, useMemo, useState } from 'react';
import SkillCard, { type SkillBaselineData, type SkillCardData } from '../wiki/SkillCard';

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
    for (const group of availableGroups) {
      const payload = dataSources[group.key]?.data as RideWikiPayload | undefined;
      if (!payload?.variants?.length) continue;
      for (const variant of payload.variants) {
        entries.push({
          groupKey: group.key,
          rideId: variant.ride.id,
          rideName: variant.ride.name,
        });
      }
    }
    return entries;
  }, [availableGroups, dataSources]);
  const [activeGroupKey, setActiveGroupKey] = useState(GROUPS[0].key);
  const [activeRideId, setActiveRideId] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[] | null>(null);

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
    const src = dataSources[activeGroupKey];
    return src?.data ?? null;
  }, [activeGroupKey, dataSources]);

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
          {rideEntries.map((entry) => (
            <button
              key={`${entry.groupKey}-${entry.rideId}`}
              onClick={() => switchRideEntry(entry)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeGroupKey === entry.groupKey && activeVariant.ride.id === entry.rideId ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-surface text-textSub hover:text-textMain'
                }`}
            >
              {entry.rideName}
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
