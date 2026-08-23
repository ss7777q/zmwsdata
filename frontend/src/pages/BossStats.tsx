import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BossStatsTable from '../components/boss/BossStatsTable';
import BossStatsToolbar from '../components/boss/BossStatsToolbar';
import BossTypeTabs from '../components/boss/BossTypeTabs';
import {
  collectBossGroups,
  flattenBossGroups,
  getTypeKey,
  METRIC_KEYS,
  PAGE_SIZE,
  recalculateBossProps,
} from '../lib/boss-stats';

const SEARCH_RESULTS_KEY = 'search-results';

interface Props {
  dataSources: Record<string, any>;
  searchQuery?: string;
}

export default function BossStats({ dataSources, searchQuery = '' }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const groups = useMemo(() => collectBossGroups(dataSources), [dataSources]);
  const bossIndex = dataSources.boss_index?.data as {
    summary?: { stageCount?: number; bossCount?: number };
    types?: Array<{ routeKey: string; label: string; stageCount: number; bossCount: number }>;
  } | undefined;

  const sortedGroups = useMemo(() => {
    const order = ['主线', '精英', '噩梦', '幻境', '罗汉堂', '昆仑', '兜率宫', '十绝阵', '联盟BOSS', '七星战场', '葬灵洞', '灵宠天梯', '关卡小怪'];
    return [...groups].sort((a, b) => {
      const labelA = a.label || '';
      const labelB = b.label || '';
      const indexA = order.findIndex(prefix => labelA.includes(prefix));
      const indexB = order.findIndex(prefix => labelB.includes(prefix));

      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return groups.indexOf(a) - groups.indexOf(b);
    });
  }, [groups]);

  const allBosses = useMemo(() => flattenBossGroups(groups), [groups]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const hasSearchQuery = normalizedSearchQuery.length > 0;
  const routeKey = location.pathname.split('/').filter(Boolean)[1] || 'mainline';
  const currentTypeKey = hasSearchQuery || routeKey === 'search'
    ? SEARCH_RESULTS_KEY
    : routeKey;

  const [currentPage, setCurrentPage] = useState(1);
  const [levelInput, setLevelInput] = useState('');
  const [presetLevel, setPresetLevel] = useState<number | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [currentTypeKey, normalizedSearchQuery]);

  const activeGroup = useMemo(
    () => currentTypeKey === SEARCH_RESULTS_KEY
      ? null
      : sortedGroups.find((group) => (group.slug || getTypeKey(group.type)) === currentTypeKey) || null,
    [currentTypeKey, sortedGroups]
  );

  const supportsLevelOverride = Boolean(activeGroup?.supportsLevelOverride && currentTypeKey !== 'all');
  const levelOverrideMode = activeGroup?.levelOverrideMode || 'input';

  useEffect(() => {
    if (!supportsLevelOverride) {
      setLevelInput('');
      setPresetLevel(null);
    }
  }, [supportsLevelOverride]);

  useEffect(() => {
    if (!supportsLevelOverride || !activeGroup) {
      return;
    }
    setLevelInput('');
    setPresetLevel(activeGroup.defaultLevel ?? activeGroup.levelOptions?.[0] ?? null);
  }, [activeGroup, supportsLevelOverride]);

  const typeTabs = useMemo(() => {
    const indexTypes = Array.isArray(bossIndex?.types) ? bossIndex.types : [];
    const totalStageCount = bossIndex?.summary?.stageCount ?? sortedGroups.reduce((sum, group) => sum + group.stageCount, 0);
    const totalBossCount = allBosses.length;
    const displayedBossCounts = new Map<string, number>();
    for (const boss of allBosses) {
      const group = groups.find((item) => String(item.type) === String(boss.type));
      const key = group?.slug || getTypeKey(boss.type);
      displayedBossCounts.set(key, (displayedBossCounts.get(key) || 0) + 1);
    }
    const tabs = indexTypes.length > 0
      ? indexTypes.map((group) => ({
        key: group.routeKey,
        label: group.label,
        description: `${group.stageCount} 关卡 / ${displayedBossCounts.get(group.routeKey) ?? group.bossCount} BOSS`,
      }))
      : sortedGroups.map((group) => ({
        key: group.slug || getTypeKey(group.type),
        label: group.type == null ? (group.label || '未知类型') : `${group.label || `Type ${group.type}`}`,
        description: `${group.stageCount} 关卡 / ${displayedBossCounts.get(group.slug || getTypeKey(group.type)) ?? group.bossCount} BOSS`,
      }));

    tabs.push({
      key: 'all',
      label: '全部BOSS',
      description: `${totalStageCount} 关卡 / ${totalBossCount} BOSS`,
    });

    if (hasSearchQuery || routeKey === 'search') {
      const matchedCount = hasSearchQuery ? allBosses.filter((boss) => {
        const fields = [boss.name, boss.remark, boss.stageName];
        return fields.some((value) => value?.toLowerCase().includes(normalizedSearchQuery));
      }).length : allBosses.length;

      tabs.unshift({
        key: SEARCH_RESULTS_KEY,
        label: '搜索',
        description: hasSearchQuery ? `${matchedCount} 条匹配` : `${matchedCount} BOSS`,
      });
    }

    return tabs;
  }, [allBosses, bossIndex, hasSearchQuery, normalizedSearchQuery, routeKey, sortedGroups]);

  const overrideLevel = useMemo(() => {
    if (!supportsLevelOverride || !activeGroup?.levelTemplates) {
      return null;
    }
    if (levelOverrideMode === 'preset') {
      return presetLevel != null && activeGroup.levelTemplates[String(presetLevel)] ? presetLevel : null;
    }
    const normalized = levelInput.trim();
    if (!normalized) {
      const defaultLevel = activeGroup.defaultLevel;
      return defaultLevel != null && activeGroup.levelTemplates[String(defaultLevel)] ? defaultLevel : null;
    }
    const parsed = Number(normalized);
    if (!Number.isInteger(parsed)) {
      return null;
    }
    return activeGroup.levelTemplates[String(parsed)] ? parsed : null;
  }, [activeGroup, levelInput, levelOverrideMode, presetLevel, supportsLevelOverride]);

  const levelInputError = useMemo(() => {
    if (!supportsLevelOverride || levelOverrideMode !== 'input') {
      return '';
    }
    const normalized = levelInput.trim();
    if (!normalized) {
      return '';
    }
    const parsed = Number(normalized);
    if (!Number.isInteger(parsed)) {
      return '请输入整数等级';
    }
    if (overrideLevel == null) {
      const minLevel = activeGroup?.levelRange?.min;
      const maxLevel = activeGroup?.levelRange?.max;
      return minLevel != null && maxLevel != null
        ? `当前仅支持 ${minLevel}-${maxLevel} 级模板`
        : '当前等级没有对应模板';
    }
    return '';
  }, [activeGroup, levelInput, levelOverrideMode, overrideLevel, supportsLevelOverride]);

  const searchResultBosses = useMemo(() => {
    if (!hasSearchQuery) {
      return routeKey === 'search' ? allBosses : [];
    }
    return allBosses.filter((boss) => {
      const fields = [boss.name, boss.remark, boss.stageName];
      return fields.some((value) => value?.toLowerCase().includes(normalizedSearchQuery));
    });
  }, [allBosses, hasSearchQuery, normalizedSearchQuery, routeKey]);

  const typeScopedBosses = useMemo(() => {
    if (currentTypeKey === SEARCH_RESULTS_KEY) {
      return searchResultBosses;
    }

    const baseBosses = currentTypeKey === 'all'
      ? allBosses
      : allBosses.filter((boss) => {
        const group = groups.find((item) => String(item.type) === String(boss.type));
        return (group?.slug || getTypeKey(boss.type)) === currentTypeKey;
      });

    if (!supportsLevelOverride || overrideLevel == null || !activeGroup?.levelTemplates) {
      return baseBosses;
    }

    return baseBosses.map((boss) => {
      if (Number(activeGroup.type) === 33) {
        if (!boss.levelFollowsWorldLevel) {
          return boss;
        }
        const levelKey = String(boss.leagueLevelKey || '');
        const worldLevelOffset = Number(activeGroup.degreeWorldLv?.[levelKey] || 0);
        const bossLevel = Math.max(1, overrideLevel - worldLevelOffset);
        const bossTemplate = activeGroup.levelTemplates?.[String(bossLevel)];
        return bossTemplate ? recalculateBossProps(boss, bossLevel, bossTemplate) : boss;
      }

      const template = activeGroup.levelTemplates?.[String(overrideLevel)];
      if (!template) {
        return boss;
      }
      return recalculateBossProps(boss, overrideLevel, template);
    });
  }, [activeGroup, currentTypeKey, allBosses, groups, overrideLevel, searchResultBosses, supportsLevelOverride]);

  const visibleBosses = typeScopedBosses;
  const showSourceColumn = currentTypeKey === SEARCH_RESULTS_KEY;

  const resistIds = useMemo(() => {
    const ids = new Set<number>();
    for (const boss of visibleBosses) {
      if (!boss.resistEntries) {
        continue;
      }
      for (const entry of boss.resistEntries) {
        ids.add(entry.id);
      }
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [visibleBosses]);

  const showRoleResistColumn = useMemo(
    () => visibleBosses.some((boss) => Array.isArray(boss.resistRoleEntries) && boss.resistRoleEntries.length > 0),
    [visibleBosses]
  );

  const showRoleResistPvpColumn = useMemo(
    () => visibleBosses.some((boss) => Array.isArray(boss.resistRolePvpEntries) && boss.resistRolePvpEntries.length > 0),
    [visibleBosses]
  );

  const totalPages = Math.max(1, Math.ceil(visibleBosses.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const pagedBosses = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return visibleBosses.slice(start, start + PAGE_SIZE);
  }, [visibleBosses, safeCurrentPage]);

  if (allBosses.length === 0) {
    return (
      <div className="card text-center py-20 border border-dashed border-border bg-transparent">
        <h3 className="text-xl text-textSub font-medium">暂无 BOSS 属性数据</h3>
      </div>
    );
  }

  const startIndex = visibleBosses.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(safeCurrentPage * PAGE_SIZE, visibleBosses.length);
  const dynamicColumnCount = (showSourceColumn ? 1 : 0) + METRIC_KEYS.length + resistIds.length + (showRoleResistColumn ? 1 : 0) + (showRoleResistPvpColumn ? 1 : 0);
  const showNotePanel = Number(activeGroup?.type) !== 45 && Boolean(activeGroup?.noteText?.trim());
  const showToolbarPanel = supportsLevelOverride || showNotePanel;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <BossTypeTabs
        tabs={typeTabs}
        activeKey={currentTypeKey}
        onChange={(nextKey) => {
          if (nextKey === SEARCH_RESULTS_KEY) {
            navigate('/boss/search');
            return;
          }
          navigate(`/boss/${nextKey}`);
        }}
      />

      <BossStatsToolbar
        activeGroup={activeGroup}
        levelOverrideMode={levelOverrideMode}
        supportsLevelOverride={supportsLevelOverride}
        showNotePanel={showNotePanel}
        showToolbarPanel={showToolbarPanel}
        levelInput={levelInput}
        onLevelInputChange={setLevelInput}
        presetLevel={presetLevel}
        onPresetLevelChange={setPresetLevel}
        overrideLevel={overrideLevel}
        levelInputError={levelInputError}
      />

      <BossStatsTable
        bosses={pagedBosses}
        filteredBossesLength={visibleBosses.length}
        resistIds={resistIds}
        showSourceColumn={showSourceColumn}
        showRoleResistColumn={showRoleResistColumn}
        showRoleResistPvpColumn={showRoleResistPvpColumn}
        dynamicColumnCount={dynamicColumnCount}
      />

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/60 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-textSub">
          <span>第 {safeCurrentPage} / {totalPages} 页</span>
          <span className="hidden h-3 w-[1px] bg-border/80 lg:block"></span>
          <div className="flex items-center gap-2">
            <span>每页 {PAGE_SIZE} 条</span>
            <span>·</span>
            <span>{startIndex}-{endIndex} / {visibleBosses.length}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={safeCurrentPage === 1}
            className="rounded-lg border border-border px-3 py-2 text-sm text-textMain disabled:cursor-not-allowed disabled:opacity-40"
          >
            首页
          </button>
          <button
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={safeCurrentPage === 1}
            className="rounded-lg border border-border px-3 py-2 text-sm text-textMain disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一页
          </button>
          <button
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={safeCurrentPage === totalPages}
            className="rounded-lg border border-border px-3 py-2 text-sm text-textMain disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一页
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={safeCurrentPage === totalPages}
            className="rounded-lg border border-border px-3 py-2 text-sm text-textMain disabled:cursor-not-allowed disabled:opacity-40"
          >
            末页
          </button>
        </div>
      </div>
    </div>
  );
}
