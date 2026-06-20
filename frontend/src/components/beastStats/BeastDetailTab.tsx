import { useEffect, useMemo, useState } from 'react';
import type { BeastDetailResponse } from '../../lib/api';
import type { DetailAnomalyFilter, DetailNameMode } from './beastStatsShared';
import { DETAIL_PAGE_SIZE, EmptyState, formatNumber, formatSeasonLabel, getPetSpeciesName } from './beastStatsShared';

export function DetailTab({ source }: { source: BeastDetailResponse }) {
  const petSpeciesNameById = source.summary.petSpeciesNameById;
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [selectedServer, setSelectedServer] = useState<string>('all');
  const [anomalyFilter, setAnomalyFilter] = useState<DetailAnomalyFilter>('all');
  const [nameMode, setNameMode] = useState<DetailNameMode>('species_then_winner');
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    return source.rows.filter((row) => {
      if (selectedSeason !== 'all' && row.season !== Number(selectedSeason)) return false;
      if (selectedServer !== 'all' && row.sid !== Number(selectedServer)) return false;
      if (anomalyFilter === 'normal' && row.isAnomalyBySeasonAvg80) return false;
      if (anomalyFilter === 'anomaly' && !row.isAnomalyBySeasonAvg80) return false;
      return true;
    }).sort((left, right) => right.season - left.season || left.sid - right.sid || left.group - right.group);
  }, [anomalyFilter, selectedSeason, selectedServer, source.rows]);

  useEffect(() => {
    setPage(1);
  }, [selectedSeason, selectedServer, anomalyFilter, nameMode]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / DETAIL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * DETAIL_PAGE_SIZE;
    return filteredRows.slice(start, start + DETAIL_PAGE_SIZE);
  }, [filteredRows, safePage]);

  const pageStart = filteredRows.length === 0 ? 0 : (safePage - 1) * DETAIL_PAGE_SIZE + 1;
  const pageEnd = filteredRows.length === 0 ? 0 : Math.min(filteredRows.length, safePage * DETAIL_PAGE_SIZE);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium">赛季</div>
            <select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)} className="input w-full">
              <option value="all">全部赛季</option>
              {source.summary.seasonList.map((season) => (
                <option key={season} value={season}>{formatSeasonLabel(season)}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium">区服</div>
            <select value={selectedServer} onChange={(event) => setSelectedServer(event.target.value)} className="input w-full">
              <option value="all">全部区服</option>
              {source.summary.serverList.map((serverId) => (
                <option key={serverId} value={serverId}>{serverId} 服</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-textSub">
            <div className="mb-2 font-medium">异常状态</div>
            <select value={anomalyFilter} onChange={(event) => setAnomalyFilter(event.target.value as DetailAnomalyFilter)} className="input w-full">
              <option value="all">全部</option>
              <option value="normal">仅正常</option>
              <option value="anomaly">仅异常</option>
            </select>
          </label>

          <label className="text-sm text-textSub sm:col-span-2 xl:col-span-1">
            <div className="mb-2 font-medium">名字模式</div>
            <select value={nameMode} onChange={(event) => setNameMode(event.target.value as DetailNameMode)} className="input w-full">
              <option value="species_then_winner">种类名 + 当时名字</option>
              <option value="nickname_then_current">昵称 + 当前名字</option>
            </select>
          </label>
        </div>
      </section>

      {filteredRows.length === 0 ? <EmptyState message="没有符合条件的冠军记录" /> : null}

      {filteredRows.length > 0 ? (
        <section className="rounded-3xl border border-border bg-card p-0 shadow-sm overflow-hidden">
          <div className="overflow-auto">
            <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-surface text-textSub shadow-sm">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold">赛季</th>
                  <th className="px-4 py-3 text-left font-semibold">区服</th>
                  <th className="px-4 py-3 text-left font-semibold">UID / 主人</th>
                  <th className="px-4 py-3 text-left font-semibold">1号位</th>
                  <th className="px-4 py-3 text-left font-semibold">2号位</th>
                  <th className="px-4 py-3 text-left font-semibold">3号位</th>
                  <th className="px-4 py-3 text-left font-semibold">总战力</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-textMain">
                {pageRows.map((row) => {
          const showSpecies = nameMode === 'species_then_winner';
          const sortedPets = [...row.pets].sort((left, right) => left.slotIndex - right.slotIndex);
          const primaryOwnerName = showSpecies ? row.winnerNameAtThatTime : row.currentName;
          const secondaryOwnerLabel = showSpecies ? '当前' : '当时';
          const secondaryOwnerName = showSpecies ? row.currentName : row.winnerNameAtThatTime;
          return (
            <tr key={`${row.season}-${row.sid}-${row.uid}-${row.group}`} className="hover:bg-surface/40 align-top">
              <td className="px-4 py-4 font-semibold">{formatSeasonLabel(row.season)}</td>
              <td className="px-4 py-4">{row.sid} 服</td>
              <td className="px-4 py-4 min-w-[220px]">
                <div className="font-semibold text-textMain">{primaryOwnerName}</div>
                <div className="mt-1 font-mono text-xs text-textSub break-all">{row.uid}</div>
                <div className="mt-1 text-xs text-textSub">{secondaryOwnerLabel}：{secondaryOwnerName}</div>
              </td>
              {sortedPets.map((pet) => (
                <td key={`${row.uid}-${row.season}-${pet.slotIndex}-${pet.petId}`} className="px-4 py-4 min-w-[180px]">
                  <div className="font-semibold text-textMain break-words">{showSpecies ? getPetSpeciesName(petSpeciesNameById, pet.petId) : (pet.petNickname || getPetSpeciesName(petSpeciesNameById, pet.petId))}</div>
                  <div className="mt-1 text-xs text-textSub">{showSpecies ? '昵称' : '种类'}：{showSpecies ? (pet.petNickname || '-') : getPetSpeciesName(petSpeciesNameById, pet.petId)}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-textSub">
                    <span className="rounded-full border border-border bg-card px-2 py-1">Lv.{pet.petLevel}</span>
                    <span className="rounded-full border border-border bg-card px-2 py-1">战力 {formatNumber(pet.petPower)}</span>
                  </div>
                </td>
              ))}
              <td className="px-4 py-4 font-mono font-semibold text-primary">{formatNumber(row.petPowerSum)}</td>
            </tr>
          );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-textSub">显示第 {pageStart}-{pageEnd} 条，共 {filteredRows.length} 条</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage(1)} disabled={safePage === 1} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">首页</button>
              <button type="button" onClick={() => setPage((previous) => Math.max(1, previous - 1))} disabled={safePage === 1} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">上一页</button>
              <div className="px-2 text-sm text-textMain">{safePage} / {totalPages}</div>
              <button type="button" onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))} disabled={safePage === totalPages} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">下一页</button>
              <button type="button" onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className="rounded-lg border border-border px-3 py-2 text-sm text-textSub disabled:opacity-40">末页</button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
