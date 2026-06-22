import { useEffect, useMemo, useState } from 'react';
import SkillCard, { type SkillBaselineData, type SkillCardData } from '../wiki/SkillCard';
import { useDataFiles } from '../../hooks/useGameData';

const SkillCardView = SkillCard as any;

interface Props {
  dataSources: Record<string, any>;
}

interface PetSkillSlot {
  slot: string;
  slotLabel: string;
  slotKind: string;
  base: SkillCardData;
  awakens?: SkillCardData[];
}

interface PetWikiVariant {
  pet: { id: number; name: string; cfgFile?: string | null };
  slots: PetSkillSlot[];
}

interface PetWikiPayload {
  petGroup: { key: string; name: string; note?: string };
  variants: PetWikiVariant[];
}

interface PetSkillBaselineEntry extends SkillBaselineData {
  file: string;
  petId: number | null;
  slot: string | null;
  skillId: number;
}

interface PetSkillBaselinePayload {
  skills?: PetSkillBaselineEntry[];
}

type PetGroupType = '神兽' | '灵兽' | '仙兽';

interface PetMenuEntry {
  type: PetGroupType;
  groupKey: string;
  petId: number;
  petName: string;
}

interface PetWikiIndexEntry {
  fileName: string;
  petId: number;
  petName: string;
  type: PetGroupType;
}

interface PetWikiIndexGroup {
  fileName: string;
  key: string;
  name: string;
  type: PetGroupType;
  entries: PetWikiIndexEntry[];
}

interface PetWikiIndexPayload {
  groups?: PetWikiIndexGroup[];
}

const TYPE_ORDER: PetGroupType[] = ['神兽', '灵兽', '仙兽'];

const TYPE_BADGE_CLASS: Record<PetGroupType, string> = {
  神兽: 'border-orange-500/30 bg-orange-500/10 text-orange-500',
  灵兽: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  仙兽: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

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

export default function PetSkillWiki({ dataSources }: Props) {
  const indexPayload = dataSources.pet_wiki_index?.data as PetWikiIndexPayload | undefined;
  const indexGroups = useMemo(() => Array.isArray(indexPayload?.groups) ? indexPayload.groups : [], [indexPayload]);
  const firstGroupKey = indexGroups[0]?.fileName ?? '';
  const baselineBySkill = useMemo(() => {
    const payload = dataSources.pet_skill_baseline?.data as PetSkillBaselinePayload | undefined;
    const map = new Map<string, PetSkillBaselineEntry>();
    for (const skill of payload?.skills || []) {
      if (!skill.file || skill.petId == null || !skill.slot || typeof skill.skillId !== 'number') continue;
      map.set(`${skill.file}|${skill.petId}|${skill.slot}|${skill.skillId}`, skill);
    }
    return map;
  }, [dataSources]);
  const petEntriesByType = useMemo<Record<PetGroupType, PetMenuEntry[]>>(() => {
    const buckets: Record<PetGroupType, PetMenuEntry[]> = { 神兽: [], 灵兽: [], 仙兽: [] };
    for (const group of indexGroups) {
      for (const entry of group.entries || []) {
        const type = entry.type ?? group.type;
        buckets[type].push({
          type,
          groupKey: entry.fileName || group.fileName,
          petId: entry.petId,
          petName: entry.petName,
        });
      }
    }
    return buckets;
  }, [indexGroups]);
  const availableTypes = useMemo(
    () => TYPE_ORDER.filter((type) => petEntriesByType[type].length > 0),
    [petEntriesByType]
  );
  const [activeType, setActiveType] = useState<PetGroupType>('神兽');
  const [activeGroupKey, setActiveGroupKey] = useState<string>(firstGroupKey);
  const [activePetId, setActivePetId] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[] | null>(null);
  const detailResult = useDataFiles(activeGroupKey ? [activeGroupKey] : [], Boolean(activeGroupKey));
  const mergedSources = useMemo(
    () => ({ ...dataSources, ...detailResult.dataSources }),
    [dataSources, detailResult.dataSources]
  );

  useEffect(() => {
    if (!availableTypes.length) return;
    if (!availableTypes.includes(activeType)) {
      setActiveType(availableTypes[0]);
      setActiveGroupKey('');
      setActivePetId(null);
      setPicked(null);
    }
  }, [activeType, availableTypes]);

  const visiblePetEntries = petEntriesByType[activeType] ?? [];

  useEffect(() => {
    if (!visiblePetEntries.length) return;
    if (!visiblePetEntries.some((entry) => entry.groupKey === activeGroupKey && entry.petId === activePetId)) {
      const firstEntry = visiblePetEntries[0];
      setActiveGroupKey(firstEntry.groupKey);
      setActivePetId(firstEntry.petId);
      setPicked(null);
    }
  }, [activeGroupKey, activePetId, visiblePetEntries]);

  const payload: PetWikiPayload | null = useMemo(() => {
    const src = mergedSources[activeGroupKey];
    return src?.data ?? null;
  }, [activeGroupKey, mergedSources]);

  const activeVariant = useMemo(() => {
    if (!payload?.variants?.length) return null;
    return payload.variants.find((v) => v.pet.id === activePetId) || payload.variants[0];
  }, [activePetId, payload]);

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
      const baselineKey = `${sourceFile}|${activeVariant.pet.id}|${slot.slot}|${slot.base.skillId}`;
      const baseline = baselineBySkill.get(baselineKey) ?? null;
      return {
        card: { ...slot.base, skillBaseline: baseline },
        slotLabel: slot.slotLabel,
        badge: slot.slotKind === 'sp' ? '无双' : slot.slotKind === 'passive' ? '被动' : slot.slotKind === 'attack' ? '普攻' : undefined,
      };
    });
  }, [activeGroupKey, activeVariant, baselineBySkill]);

  const switchType = (type: PetGroupType) => {
    setActiveType(type);
    setActiveGroupKey('');
    setActivePetId(null);
    setPicked(null);
  };

  const switchPetEntry = (entry: PetMenuEntry) => {
    setActiveGroupKey(entry.groupKey);
    setActivePetId(entry.petId);
    setPicked(null);
  };

  const toggleLevel = (n: number) => {
    setPicked((prev) => {
      const base = prev ?? defaults;
      return base.includes(n) ? dedupeSort(base.filter((x) => x !== n)) : dedupeSort([...base, n]);
    });
  };

  if (!indexGroups.length) {
    return (
      <div className="card border border-dashed border-border bg-transparent py-20 text-center">
        <h3 className="text-xl font-medium text-textSub">正在加载宠物技能 Wiki...</h3>
      </div>
    );
  }

  const detailErrorMessage = activeGroupKey && detailResult.errors[activeGroupKey]
    ? `${activeGroupKey}.json：${detailResult.errors[activeGroupKey]}`
    : '';
  const isDetailLoading = detailResult.loading && (!payload || !activeVariant);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[24px] border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {availableTypes.map((type) => (
            <button
              key={type}
              onClick={() => switchType(type)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${activeType === type ? TYPE_BADGE_CLASS[type] : 'border-transparent bg-surface text-textSub hover:text-textMain'
                }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {visiblePetEntries.map((entry) => (
            <button
              key={`${entry.groupKey}-${entry.petId}`}
              onClick={() => switchPetEntry(entry)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeGroupKey === entry.groupKey && activePetId === entry.petId ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-surface text-textSub hover:text-textMain'
                }`}
            >
              {entry.petName}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-textSub">对比等级<span className="ml-2 text-xs text-textSub/70">点选多个等级横向对比</span></span>
            {activeVariant ? (
              <div className="flex gap-2 text-xs">
                <button onClick={() => setPicked(defaults)} className="rounded-md bg-surface px-2 py-1 text-textSub hover:text-textMain">默认档位</button>
                <button onClick={() => setPicked(availableLevels)} className="rounded-md bg-surface px-2 py-1 text-textSub hover:text-textMain">全选</button>
                <button onClick={() => setPicked([maxLevel])} className="rounded-md bg-surface px-2 py-1 text-textSub hover:text-textMain">仅满级</button>
              </div>
            ) : (
              <span className="rounded-md bg-surface px-2 py-1 text-xs text-textSub">等级数据加载中...</span>
            )}
          </div>
          {activeVariant ? (
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
          <h3 className="text-xl font-medium text-red-700 dark:text-red-200">宠物技能 Wiki 详情加载失败</h3>
          <p className="mt-2 text-sm text-red-600/80 dark:text-red-100/80">{detailErrorMessage}</p>
        </div>
      ) : isDetailLoading || !activeVariant ? (
        <div className="card border border-dashed border-border bg-transparent py-20 text-center">
          <h3 className="text-xl font-medium text-textSub">正在加载宠物技能 Wiki...</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c, i) => (
            <SkillCardView key={`${activeVariant.pet.id}-${c.card.skillId}-${i}`} card={c.card} level={displayLevel} levels={selectedLevels} slotLabel={c.slotLabel} badge={c.badge} />
          ))}
        </div>
      )}
    </div>
  );
}
