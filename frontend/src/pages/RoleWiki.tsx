import { useEffect, useMemo, useState } from 'react';
import SkillCard, { type SkillCardData } from '../components/wiki/SkillCard';
import { apiUrl, dataFileUrl, staticDataEnabled } from '../lib/api';

interface SkillSlot {
  slot: string;
  slotLabel: string;
  isTrans: boolean;
  base: SkillCardData;
  awakens: SkillCardData[];
  allAwakenIdentical: boolean;
}
interface RoleWikiPayload {
  role: { id: number; name: string; text?: string };
  slots: SkillSlot[];
  passiveSlots?: SkillSlot[];
}
interface RoleWikiFile {
  data: RoleWikiPayload;
}

// 已生成 Wiki 的角色(数据源名 -> 显示名)。后续角色加到这里即可。
const ROLES = [
  { key: 'role_wiki_wukong', name: '孙悟空' },
  { key: 'role_wiki_tangseng', name: '唐三藏' },
  { key: 'role_wiki_shaseng', name: '沙悟净' },
  { key: 'role_wiki_bajie', name: '猪八戒' },
  { key: 'role_wiki_aoxue', name: '敖雪' },
  { key: 'role_wiki_aolie', name: '敖烈' },
  { key: 'role_wiki_xiaoyan', name: '萧嫣' },
  { key: 'role_wiki_xuannv', name: '玄女' },
  { key: 'role_wiki_yangjian', name: '杨戬' },
];

/** 去重升序 */
function dedupeSort(arr: number[]) {
  return [...new Set(arr)].filter((n) => n >= 1).sort((a, b) => a - b);
}

/** 默认对比档位:首/四分位/中/三四分位/满级 */
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

async function loadRoleWikiPayload(name: string, signal: AbortSignal): Promise<RoleWikiPayload> {
  const response = await fetch(staticDataEnabled() ? dataFileUrl(name) : apiUrl(`/api/data/${encodeURIComponent(name)}`), { signal });
  if (!response.ok) {
    throw new Error(`Load ${name}.json failed: ${response.status}`);
  }

  const file = (await response.json()) as RoleWikiFile;
  if (!file?.data?.role || !Array.isArray(file.data.slots)) {
    throw new Error(`Invalid ${name}.json`);
  }
  return file.data;
}

export default function RoleWiki() {
  const [activeRole, setActiveRole] = useState(ROLES[0].key);
  const [payloadCache, setPayloadCache] = useState<Record<string, RoleWikiPayload>>({});
  const [loadingRole, setLoadingRole] = useState<string | null>(activeRole);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null = 跟随默认档位;非 null = 用户手动选择的等级集合
  const [picked, setPicked] = useState<number[] | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'active' | 'passive'>('all');

  const payload = payloadCache[activeRole] ?? null;

  useEffect(() => {
    if (payload) {
      setLoadingRole(null);
      setLoadError(null);
      return;
    }

    const controller = new AbortController();
    let disposed = false;
    setLoadingRole(activeRole);
    setLoadError(null);

    loadRoleWikiPayload(activeRole, controller.signal)
      .then((nextPayload) => {
        if (disposed) return;
        setPayloadCache((prev) => ({ ...prev, [activeRole]: nextPayload }));
      })
      .catch((err) => {
        if (disposed || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.error(`Failed to load ${activeRole}:`, err);
        setLoadError(err instanceof Error ? err.message : `Load ${activeRole}.json failed`);
      })
      .finally(() => {
        if (!disposed) setLoadingRole(null);
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [activeRole, payload]);

  const availableLevels = useMemo(() => {
    const levelSet = new Set<number>();
    for (const slot of payload?.slots || []) {
      collectCardLevels(slot.base, levelSet);
      for (const awaken of slot.awakens || []) collectCardLevels(awaken, levelSet);
    }
    return [...levelSet].sort((a, b) => a - b);
  }, [payload]);
  const maxLevel = availableLevels[availableLevels.length - 1] ?? 1;

  const defaults = useMemo(() => defaultPicks(availableLevels), [availableLevels]);
  const selectedLevels = useMemo(() => {
    const allowed = new Set(availableLevels);
    const filtered = (picked ?? defaults).filter((level) => allowed.has(level));
    return filtered.length ? filtered : defaults;
  }, [availableLevels, defaults, picked]);

  const toggleLevel = (n: number) => {
    setPicked((prev) => {
      const base = prev ?? defaults;
      return base.includes(n) ? dedupeSort(base.filter((x) => x !== n)) : dedupeSort([...base, n]);
    });
  };

  const switchRole = (key: string) => {
    setActiveRole(key);
    setPicked(null); // 切角色回到默认档位
  };

  // 把每个槽展开成要展示的卡片列表(觉醒合并:相同的不重复出卡,只在基础卡加标记)
  const cards = useMemo(() => {
    if (!payload?.slots) return [];
    const out: { card: SkillCardData; slotLabel: string; badge?: string; levels?: number[]; isPassive?: boolean }[] = [];
    for (const slot of payload.slots) {
      if (!slot.base) continue;
      const distinctAwakens = (slot.awakens || []).filter((a) => a && !a.identicalToBase);
      const mergedCount = (slot.awakens || []).length - distinctAwakens.length;
      out.push({
        card: slot.base,
        slotLabel: slot.slotLabel,
        badge: mergedCount > 0 ? `含${mergedCount}个同数值觉醒` : slot.isTrans ? '无双' : undefined,
        isPassive: false,
      });
      for (const aw of distinctAwakens) {
        if (aw) {
          out.push({ card: aw, slotLabel: `${slot.slotLabel} · 觉醒`, badge: '觉醒变化', isPassive: false });
        }
      }
    }
    for (const slot of payload.passiveSlots || []) {
      if (!slot.base) continue;
      const passiveLevels = (slot.base.levels || []).map((level) => level.level).sort((a, b) => a - b);
      out.push({ card: slot.base, slotLabel: slot.slotLabel, badge: '角色被动', levels: passiveLevels, isPassive: true });
    }
    return out;
  }, [payload]);

  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      if (filterType === 'all') return true;
      if (filterType === 'active') return !c.isPassive;
      if (filterType === 'passive') return !!c.isPassive;
      return true;
    });
  }, [cards, filterType]);

  const activeCards = useMemo(() => filteredCards.filter((c) => !c.isPassive), [filteredCards]);
  const passiveCards = useMemo(() => filteredCards.filter((c) => c.isPassive), [filteredCards]);

  if (!payload && loadError) {
    return (
      <div className="card border border-dashed border-red-300 bg-red-50/70 py-20 text-center dark:border-red-500/40 dark:bg-red-500/10">
        <h3 className="text-xl font-medium text-red-700 dark:text-red-200">角色技能数据加载失败</h3>
        <p className="mt-2 text-sm text-red-600/80 dark:text-red-100/80">{loadError}</p>
      </div>
    );
  }

  if (!payload || loadingRole === activeRole) {
    return (
      <div className="card border border-dashed border-border bg-transparent py-20 text-center">
        <h3 className="text-xl font-medium text-textSub">正在加载角色技能数据...</h3>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 顶部:角色选择 */}
      <div className="flex flex-col gap-4 rounded-[24px] border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.key}
              onClick={() => switchRole(r.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${activeRole === r.key ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-surface text-textSub hover:text-textMain'
                }`}
            >
              {r.name}
            </button>
          ))}
        </div>

        {/* 对比等级多选 */}
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

        {/* 技能类型筛选 */}
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-textSub">技能类型</span>
            <div className="flex gap-2 text-xs">
              {[
                { id: 'all', label: '全部' },
                { id: 'active', label: '主动技能' },
                { id: 'passive', label: '被动技能' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFilterType(opt.id as any)}
                  className={`rounded-md px-3 py-1 cursor-pointer transition-colors ${
                    filterType === opt.id
                      ? 'bg-primary text-white shadow-sm shadow-primary/15'
                      : 'bg-surface text-textSub hover:text-textMain'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {activeCards.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMain">主动技能</h3>
            <span className="text-xs text-textSub">{activeCards.length} 张</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeCards.map((c, i) => (
              <SkillCard key={`${c.card.skillId}-${i}`} card={c.card} levels={c.levels || selectedLevels} slotLabel={c.slotLabel} badge={c.badge} />
            ))}
          </div>
        </section>
      )}

      {passiveCards.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMain">角色被动</h3>
            <span className="text-xs text-textSub">{passiveCards.length} 张</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {passiveCards.map((c, i) => (
              <SkillCard key={`${c.card.skillId}-${i}`} card={c.card} levels={c.levels || selectedLevels} slotLabel={c.slotLabel} badge={c.badge} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
