import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PetChampionStageStatsResponse, PetStageStatsItem } from '../../lib/api';
import {
  CHART_COLORS,
  formatNumber,
} from './beastStatsShared';

type MetricMode = 'pickRate' | 'winRate';
type SortField =
  | 'name'
  | '16_pick'
  | '16_win'
  | '8_pick'
  | '8_win'
  | '4_pick'
  | '4_win'
  | '2_pick'
  | '2_win'
  | 'winner_pick'
  | 'champion_conv'
  | 'total_matches'
  | 'overall_win';

type SortDirection = 'asc' | 'desc';

interface StageStatsTabProps {
  source: PetChampionStageStatsResponse;
}

const STAGES_ORDER = [
  { key: '16', label: '16强' },
  { key: '8', label: '8强' },
  { key: '4', label: '4强' },
  { key: '2', label: '决赛' },
  { key: 'winner', label: '总冠军' },
];

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function getRateHeatStyle(rate: number) {
  if (rate <= 0) return undefined;
  const alpha = Math.min(0.35, 0.04 + rate * 0.35);
  return {
    backgroundColor: `rgba(37, 99, 235, ${alpha.toFixed(3)})`,
  };
}

function getWinRateHeatStyle(rate: number) {
  if (rate <= 0) return undefined;
  if (rate >= 0.5) {
    const alpha = Math.min(0.35, 0.05 + (rate - 0.5) * 0.6);
    return {
      backgroundColor: `rgba(16, 185, 129, ${alpha.toFixed(3)})`,
    };
  }
  const alpha = Math.min(0.3, 0.05 + (0.5 - rate) * 0.5);
  return {
    backgroundColor: `rgba(239, 68, 68, ${alpha.toFixed(3)})`,
  };
}

export function PetChampionStageStatsTab({ source }: StageStatsTabProps) {
  const seasonList = source.seasonList;
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [metricMode, setMetricMode] = useState<MetricMode>('pickRate');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  const currentSeasonData = useMemo(() => {
    return source.seasons[selectedSeason] || source.seasons['all'];
  }, [selectedSeason, source.seasons]);

  const [selectedPetIds, setSelectedPetIds] = useState<number[]>(
    currentSeasonData?.topPetsDefault?.slice(0, 5) || []
  );

  useEffect(() => {
    if (currentSeasonData?.topPetsDefault) {
      setSelectedPetIds(currentSeasonData.topPetsDefault.slice(0, 5));
    }
  }, [currentSeasonData]);

  const [sortField, setSortField] = useState<SortField>('16_pick');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const filteredCatalog = useMemo(() => {
    if (!currentSeasonData) return [];
    let list = [...currentSeasonData.petCatalog];
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.petName.toLowerCase().includes(kw) || String(p.petId).includes(kw)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.petName.localeCompare(b.petName, 'zh-CN');
          break;
        case '16_pick':
          cmp = a.stages['16'].pickRate - b.stages['16'].pickRate;
          break;
        case '16_win':
          cmp = a.stages['16'].winRate - b.stages['16'].winRate;
          break;
        case '8_pick':
          cmp = a.stages['8'].pickRate - b.stages['8'].pickRate;
          break;
        case '8_win':
          cmp = a.stages['8'].winRate - b.stages['8'].winRate;
          break;
        case '4_pick':
          cmp = a.stages['4'].pickRate - b.stages['4'].pickRate;
          break;
        case '4_win':
          cmp = a.stages['4'].winRate - b.stages['4'].winRate;
          break;
        case '2_pick':
          cmp = a.stages['2'].pickRate - b.stages['2'].pickRate;
          break;
        case '2_win':
          cmp = a.stages['2'].winRate - b.stages['2'].winRate;
          break;
        case 'winner_pick':
          cmp = a.stages['winner'].pickRate - b.stages['winner'].pickRate;
          break;
        case 'champion_conv':
          cmp = a.championConversionRate - b.championConversionRate;
          break;
        case 'total_matches':
          cmp = a.totalMatches - b.totalMatches;
          break;
        case 'overall_win':
          cmp = a.overallWinRate - b.overallWinRate;
          break;
      }
      if (cmp === 0) cmp = a.petId - b.petId;
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [currentSeasonData, searchKeyword, sortDirection, sortField]);

  const petMap = useMemo(() => {
    const map = new Map<number, PetStageStatsItem>();
    if (currentSeasonData) {
      for (const p of currentSeasonData.petCatalog) {
        map.set(p.petId, p);
      }
    }
    return map;
  }, [currentSeasonData]);

  const chartData = useMemo(() => {
    if (!currentSeasonData) return [];

    return STAGES_ORDER.map(({ key, label }) => {
      const row: Record<string, string | number> = {
        stage: label,
        stageKey: key,
      };

      for (const petId of selectedPetIds) {
        const petItem = petMap.get(petId);
        if (petItem) {
          const stageInfo = petItem.stages[key];
          if (stageInfo) {
            const rawVal =
              metricMode === 'pickRate'
                ? stageInfo.pickRate
                : stageInfo.winRate;
            row[String(petId)] = Number((rawVal * 100).toFixed(1));
            row[`label-${petId}`] = petItem.petName;
          }
        }
      }
      return row;
    });
  }, [currentSeasonData, metricMode, petMap, selectedPetIds]);

  function handleToggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  function togglePetSelection(petId: number) {
    setSelectedPetIds((prev) =>
      prev.includes(petId)
        ? prev.filter((id) => id !== petId)
        : [...prev, petId]
    );
  }

  function selectTopPets(count: number) {
    if (!currentSeasonData) return;
    const top = currentSeasonData.petCatalog.slice(0, count).map((p) => p.petId);
    setSelectedPetIds(top);
  }

  function clearPetSelection() {
    setSelectedPetIds([]);
  }

  function renderSortMark(field: SortField) {
    if (sortField !== field) return null;
    return sortDirection === 'desc' ? ' ↓' : ' ↑';
  }

  return (
    <div className="space-y-6">
      {/* 顶部筛选栏 */}
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 赛季筛选 */}
          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium text-textMain">赛季选择</div>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="input w-full"
            >
              <option value="all">全部赛季</option>
              {seasonList.map((s) => (
                <option key={s} value={String(s)}>
                  第 {s} 赛季
                </option>
              ))}
            </select>
          </label>

          {/* 赛程阶段筛选 */}
          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium text-textMain">赛程阶段聚焦</div>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="input w-full"
            >
              {source.stageList.map((st) => (
                <option key={st.key} value={st.key}>
                  {st.name}
                </option>
              ))}
            </select>
          </label>

          {/* 指标模式切换 */}
          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium text-textMain">走势指标类型</div>
            <div className="flex rounded-xl bg-surface p-1 border border-border">
              <button
                type="button"
                onClick={() => setMetricMode('pickRate')}
                className={clsx(
                  'flex-1 rounded-lg py-1.5 text-xs font-medium transition cursor-pointer text-center',
                  metricMode === 'pickRate'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-textSub hover:text-textMain'
                )}
              >
                出场率
              </button>
              <button
                type="button"
                onClick={() => setMetricMode('winRate')}
                className={clsx(
                  'flex-1 rounded-lg py-1.5 text-xs font-medium transition cursor-pointer text-center',
                  metricMode === 'winRate'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-textSub hover:text-textMain'
                )}
              >
                晋级胜率
              </button>
            </div>
          </label>

          {/* 搜索宠物 */}
          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium text-textMain">搜索宠物</div>
            <input
              type="text"
              placeholder="搜索宠物名称或ID..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="input w-full"
            />
          </label>
        </div>
      </section>

      {/* 赛程演变折线图 */}
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="text-base font-bold text-textMain flex items-center gap-2">
              <span>📈 赛程阶段演变走势图</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {metricMode === 'pickRate' ? '出场率演变' : '单阶段晋级胜率演变'}
              </span>
            </h3>
            <p className="text-xs text-textSub mt-1">
              横坐标为赛程推进（16强 → 8强 → 4强 → 决赛 → 总冠军），展示入围宠物在各阶段的统治力演变。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => selectTopPets(5)}
              className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer font-medium"
            >
              前 5 名
            </button>
            <button
              onClick={() => selectTopPets(10)}
              className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer font-medium"
            >
              前 10 名
            </button>
            <button
              onClick={clearPetSelection}
              className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-textSub"
            >
              清空
            </button>
          </div>
        </div>

        {/* 宠物选择标签 */}
        <div className="flex flex-wrap gap-2 pt-1">
          {currentSeasonData?.petCatalog.slice(0, 15).map((pet) => {
            const isSelected = selectedPetIds.includes(pet.petId);
            const color =
              isSelected
                ? CHART_COLORS[selectedPetIds.indexOf(pet.petId) % CHART_COLORS.length]
                : undefined;

            return (
              <button
                key={pet.petId}
                onClick={() => togglePetSelection(pet.petId)}
                style={isSelected ? { borderColor: color, color } : undefined}
                className={clsx(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition cursor-pointer flex items-center gap-1.5',
                  isSelected
                    ? 'bg-primary/5 font-semibold'
                    : 'border-border bg-surface text-textSub hover:text-textMain'
                )}
              >
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{
                    backgroundColor: isSelected
                      ? color
                      : 'currentColor',
                    opacity: isSelected ? 1 : 0.4,
                  }}
                />
                {pet.petName}
              </button>
            );
          })}
        </div>

        {/* 折线图本体 */}
        <div className="h-[340px] w-full pt-2">
          {selectedPetIds.length === 0 ? (
            <div className="h-full flex items-center justify-center text-textSub text-sm">
              请在上方或下方表格中勾选宠物以查看其赛程演变折线
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 15, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="stage" stroke="currentColor" opacity={0.6} />
                <YAxis
                  stroke="currentColor"
                  opacity={0.6}
                  unit="%"
                  domain={[0, 'auto']}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm text-xs space-y-1.5 min-w-[140px]">
                        <div className="font-bold text-textMain border-b border-border pb-1">
                          赛程节点：{label}
                        </div>
                        {payload
                          .filter((p) => typeof p.value === 'number')
                          .sort((a, b) => Number(b.value) - Number(a.value))
                          .map((p) => {
                            const petId = Number(p.dataKey);
                            const name = petMap.get(petId)?.petName || String(p.dataKey);
                            return (
                              <div
                                key={String(p.dataKey)}
                                className="flex items-center justify-between gap-3"
                              >
                                <span
                                  className="flex items-center gap-1.5 font-medium"
                                  style={{ color: p.color }}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full inline-block"
                                    style={{ backgroundColor: p.color }}
                                  />
                                  {name}
                                </span>
                                <span className="font-mono font-bold text-textMain">
                                  {p.value}%
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    );
                  }}
                />
                <Legend />
                {selectedPetIds.map((petId, idx) => {
                  const pet = petMap.get(petId);
                  const color = CHART_COLORS[idx % CHART_COLORS.length];
                  return (
                    <Line
                      key={petId}
                      type="monotone"
                      dataKey={String(petId)}
                      name={pet?.petName || String(petId)}
                      stroke={color}
                      strokeWidth={2.5}
                      dot={{ r: 4, strokeWidth: 1.5, fill: '#fff' }}
                      activeDot={{ r: 6 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* 矩阵统计数据表格 */}
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h3 className="text-base font-bold text-textMain">
              📊 宠物各赛段出场率与晋级胜率矩阵
            </h3>
            <p className="text-xs text-textSub mt-0.5">
              当前赛区总数：
              <span className="font-semibold text-textMain">
                {currentSeasonData?.serverCount || 0}
              </span>{' '}
              组 | 16强总样本队伍：
              <span className="font-semibold text-textMain">
                {formatNumber(currentSeasonData?.totalTeamsByStage['16'])}
              </span>
            </p>
          </div>
          <div className="text-xs text-textSub">
            已匹配宠物：{filteredCatalog.length} 种
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-textSub font-semibold">
                <th className="py-3 px-3 w-12 text-center">对比</th>
                <th
                  onClick={() => handleToggleSort('name')}
                  className="py-3 px-3 cursor-pointer hover:text-textMain"
                >
                  宠物名称 {renderSortMark('name')}
                </th>
                <th
                  onClick={() => handleToggleSort('16_pick')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                >
                  16强出场率 {renderSortMark('16_pick')}
                </th>
                <th
                  onClick={() => handleToggleSort('16_win')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                >
                  16强胜率 {renderSortMark('16_win')}
                </th>
                <th
                  onClick={() => handleToggleSort('8_pick')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                >
                  8强出场率 {renderSortMark('8_pick')}
                </th>
                <th
                  onClick={() => handleToggleSort('8_win')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                >
                  8强胜率 {renderSortMark('8_win')}
                </th>
                <th
                  onClick={() => handleToggleSort('4_pick')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                >
                  4强出场率 {renderSortMark('4_pick')}
                </th>
                <th
                  onClick={() => handleToggleSort('4_win')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                >
                  4强胜率 {renderSortMark('4_win')}
                </th>
                <th
                  onClick={() => handleToggleSort('2_pick')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                >
                  决赛出场率 {renderSortMark('2_pick')}
                </th>
                <th
                  onClick={() => handleToggleSort('2_win')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                >
                  决赛胜率 {renderSortMark('2_win')}
                </th>
                <th
                  onClick={() => handleToggleSort('winner_pick')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                >
                  冠军占有率 {renderSortMark('winner_pick')}
                </th>
                <th
                  onClick={() => handleToggleSort('champion_conv')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-textMain"
                  title="从16强出发最终夺得冠军的转化比例"
                >
                  夺冠转化率 {renderSortMark('champion_conv')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredCatalog.map((pet, index) => {
                const isSelected = selectedPetIds.includes(pet.petId);
                const s16 = pet.stages['16'];
                const s8 = pet.stages['8'];
                const s4 = pet.stages['4'];
                const s2 = pet.stages['2'];
                const sw = pet.stages['winner'];

                return (
                  <tr
                    key={pet.petId}
                    className={clsx(
                      'hover:bg-black/5 dark:hover:bg-white/5 transition',
                      isSelected && 'bg-primary/[0.03]'
                    )}
                  >
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePetSelection(pet.petId)}
                        className="rounded border-border text-primary focus:ring-primary cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3 font-medium text-textMain">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-textSub w-4">
                          {index + 1}
                        </span>
                        <span>{pet.petName}</span>
                      </div>
                    </td>

                    {/* 16强 */}
                    <td
                      style={getRateHeatStyle(s16.pickRate)}
                      className="py-2.5 px-3 text-right font-mono font-medium"
                    >
                      {formatPercent(s16.pickRate)}
                      <span className="text-[10px] text-textSub block">
                        {s16.appearances}队
                      </span>
                    </td>
                    <td
                      style={getWinRateHeatStyle(s16.winRate)}
                      className="py-2.5 px-3 text-right font-mono"
                    >
                      {formatPercent(s16.winRate)}
                    </td>

                    {/* 8强 */}
                    <td
                      style={getRateHeatStyle(s8.pickRate)}
                      className="py-2.5 px-3 text-right font-mono font-medium"
                    >
                      {formatPercent(s8.pickRate)}
                      <span className="text-[10px] text-textSub block">
                        {s8.appearances}队
                      </span>
                    </td>
                    <td
                      style={getWinRateHeatStyle(s8.winRate)}
                      className="py-2.5 px-3 text-right font-mono"
                    >
                      {formatPercent(s8.winRate)}
                    </td>

                    {/* 4强 */}
                    <td
                      style={getRateHeatStyle(s4.pickRate)}
                      className="py-2.5 px-3 text-right font-mono font-medium"
                    >
                      {formatPercent(s4.pickRate)}
                      <span className="text-[10px] text-textSub block">
                        {s4.appearances}队
                      </span>
                    </td>
                    <td
                      style={getWinRateHeatStyle(s4.winRate)}
                      className="py-2.5 px-3 text-right font-mono"
                    >
                      {formatPercent(s4.winRate)}
                    </td>

                    {/* 决赛 */}
                    <td
                      style={getRateHeatStyle(s2.pickRate)}
                      className="py-2.5 px-3 text-right font-mono font-medium"
                    >
                      {formatPercent(s2.pickRate)}
                      <span className="text-[10px] text-textSub block">
                        {s2.appearances}队
                      </span>
                    </td>
                    <td
                      style={getWinRateHeatStyle(s2.winRate)}
                      className="py-2.5 px-3 text-right font-mono"
                    >
                      {formatPercent(s2.winRate)}
                    </td>

                    {/* 冠军占有率 */}
                    <td
                      style={getRateHeatStyle(sw.pickRate)}
                      className="py-2.5 px-3 text-right font-mono font-bold text-primary"
                    >
                      {formatPercent(sw.pickRate)}
                      <span className="text-[10px] text-textSub block">
                        {sw.appearances}冠
                      </span>
                    </td>

                    {/* 夺冠转化率 */}
                    <td
                      style={getWinRateHeatStyle(pet.championConversionRate)}
                      className="py-2.5 px-3 text-right font-mono font-bold"
                    >
                      {formatPercent(pet.championConversionRate)}
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
