import { useEffect, useMemo, useState } from 'react';
import type { BeastDetailResponse, BeastPlayerAnalysisResponse } from '../../lib/api';
import { DETAIL_PAGE_SIZE, EmptyState, formatSeasonLabel, getPetSpeciesName, normalizeAliasList } from './beastStatsShared';

type PlayerSeasonWin = { season: number; sid: number; winnerNameAtThatTime: string };

function compareSeasonWin(left: PlayerSeasonWin, right: PlayerSeasonWin) {
  return left.season - right.season || left.sid - right.sid;
}

function compareNullableSeasonDesc(left: number | null, right: number | null) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

export function PlayerTab({ source, detailSource }: { source: BeastPlayerAnalysisResponse; detailSource: BeastDetailResponse }) {
  const petSpeciesNameById = detailSource.summary.petSpeciesNameById;
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [selectedServer, setSelectedServer] = useState<string>('all');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const championLineupMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of detailSource.rows) {
      const speciesList = [...row.pets]
        .sort((left, right) => left.slotIndex - right.slotIndex)
        .map((pet) => getPetSpeciesName(petSpeciesNameById, pet.petId))
        .join(' / ');
      map.set(`${row.uid}-${row.season}`, speciesList);
    }

    return map;
  }, [detailSource.rows, petSpeciesNameById]);

  const aliasMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of detailSource.rows) {
      const list = normalizeAliasList(map.get(row.uid), row.winnerNameAtThatTime);
      map.set(row.uid, list);
    }
    return map;
  }, [detailSource.rows]);

  useEffect(() => {
    setPage(1);
    setExpandedUid(null);
  }, [selectedSeason, selectedServer]);

  const rows = useMemo(() => {
    const filteredRecords = detailSource.rows.filter((row) => {
      if (selectedSeason !== 'all' && row.season !== Number(selectedSeason)) return false;
      if (selectedServer !== 'all' && row.sid !== Number(selectedServer)) return false;
      return true;
    });

    const playerMap = new Map<string, {
      uid: string;
      currentName: string;
      winnerAliasList: string[];
      championCount: number;
      seasonWins: PlayerSeasonWin[];
      sidCoverage: number[];
      firstChampionSeason: number | null;
      latestChampionSeason: number | null;
    }>();

    for (const record of filteredRecords) {
      const existing = playerMap.get(record.uid);
      if (!existing) {
        playerMap.set(record.uid, {
          uid: record.uid,
          currentName: record.currentName,
          winnerAliasList: normalizeAliasList(aliasMap.get(record.uid), record.winnerNameAtThatTime),
          championCount: 1,
          seasonWins: [{ season: record.season, sid: record.sid, winnerNameAtThatTime: record.winnerNameAtThatTime }],
          sidCoverage: [record.sid],
          firstChampionSeason: null,
          latestChampionSeason: null,
        });
        continue;
      }

      existing.currentName = record.currentName;
      existing.championCount += 1;
      existing.seasonWins.push({ season: record.season, sid: record.sid, winnerNameAtThatTime: record.winnerNameAtThatTime });
      if (!existing.sidCoverage.includes(record.sid)) {
        existing.sidCoverage.push(record.sid);
        existing.sidCoverage.sort((left, right) => left - right);
      }
      for (const alias of normalizeAliasList(aliasMap.get(record.uid), record.winnerNameAtThatTime)) {
        if (!existing.winnerAliasList.includes(alias)) {
          existing.winnerAliasList.push(alias);
        }
      }
    }

    const playerRows = [...playerMap.values()].map((row) => {
      const seasonWins = [...row.seasonWins].sort(compareSeasonWin);

      return {
        ...row,
        seasonWins,
        firstChampionSeason: seasonWins[0]?.season ?? null,
        latestChampionSeason: seasonWins[seasonWins.length - 1]?.season ?? null,
      };
    });

    return playerRows
      .sort((left, right) => right.championCount - left.championCount || compareNullableSeasonDesc(left.latestChampionSeason, right.latestChampionSeason) || left.uid.localeCompare(right.uid))
      .map((row, index) => ({
        ...row,
        winnerAliasList: normalizeAliasList(row.winnerAliasList),
        rank: index + 1,
      }));
  }, [aliasMap, detailSource.rows, selectedSeason, selectedServer]);

  const totalPages = Math.max(1, Math.ceil(rows.length / DETAIL_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * DETAIL_PAGE_SIZE;
    return rows.slice(start, start + DETAIL_PAGE_SIZE);
  }, [rows, safePage]);
  const pageStart = rows.length === 0 ? 0 : (safePage - 1) * DETAIL_PAGE_SIZE + 1;
  const pageEnd = rows.length === 0 ? 0 : Math.min(rows.length, safePage * DETAIL_PAGE_SIZE);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid w-full max-w-[760px] grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block min-w-0 text-sm text-textSub">
            <div className="mb-2 font-medium">赛季</div>
            <select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)} className="input w-full">
              <option value="all">全部赛季</option>
              {source.summary.seasonList.map((season) => (
                <option key={season} value={season}>{formatSeasonLabel(season)}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0 text-sm text-textSub">
            <div className="mb-2 font-medium">区服</div>
            <select value={selectedServer} onChange={(event) => setSelectedServer(event.target.value)} className="input w-full">
              <option value="all">全部区服</option>
              {source.summary.serverList.map((serverId) => (
                <option key={serverId} value={serverId}>{serverId} 服</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {rows.length === 0 ? <EmptyState message="没有符合条件的兽王玩家数据" /> : null}

      {rows.length > 0 ? (
        <section className="rounded-3xl border border-border bg-card p-0 shadow-sm overflow-hidden">
          <div className="divide-y divide-border md:hidden">
            {pageRows.map((row) => {
              const expanded = expandedUid === row.uid;
              return (
                <div key={row.uid} className="p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedUid((previous) => previous === row.uid ? null : row.uid)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <div className="text-lg font-semibold text-textMain">#{row.rank}</div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-primary">{row.currentName}</div>
                            <div className="mt-1 break-all font-mono text-xs text-textSub">{row.uid}</div>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-textSub">兽王次数</div>
                        <div className="mt-1 font-mono text-lg font-semibold text-textMain">{row.championCount}</div>
                      </div>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      <div className="rounded-2xl border border-border bg-surface p-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-textSub">区服覆盖</div>
                            <div className="mt-1 font-semibold text-textMain">{row.sidCoverage.join('、')} 服</div>
                          </div>
                          <div>
                            <div className="text-xs text-textSub">兽王获得次数</div>
                            <div className="mt-1 font-semibold text-textMain">{row.championCount}</div>
                          </div>
                          <div>
                            <div className="text-xs text-textSub">首次夺冠</div>
                            <div className="mt-1 font-semibold text-textMain">{row.firstChampionSeason == null ? '-' : formatSeasonLabel(row.firstChampionSeason)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-textSub">最近夺冠</div>
                            <div className="mt-1 font-semibold text-textMain">{row.latestChampionSeason == null ? '-' : formatSeasonLabel(row.latestChampionSeason)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card p-3">
                        <div className="text-sm font-semibold text-textMain">曾用名</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {normalizeAliasList(row.winnerAliasList).map((alias) => (
                            <span key={`${row.uid}-${alias}`} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-textSub">{alias}</span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-textMain">夺冠赛季记录</div>
                          <div className="text-xs text-textSub">共 {row.seasonWins.length} 次</div>
                        </div>
                        <div className="mt-3 overflow-auto rounded-xl border border-border">
                          <table className="min-w-[520px] w-full text-sm">
                            <thead className="bg-surface text-textSub">
                              <tr className="border-b border-border">
                                <th className="px-3 py-3 text-left font-semibold">赛季</th>
                                <th className="px-3 py-3 text-left font-semibold">当时昵称</th>
                                <th className="px-3 py-3 text-left font-semibold">宠物配置</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border text-textMain">
                              {row.seasonWins.map((item) => (
                                <tr key={`${row.uid}-${item.season}-${item.sid}-${item.winnerNameAtThatTime}`} className="hover:bg-surface/60">
                                  <td className="px-3 py-3 font-semibold">{formatSeasonLabel(item.season)}</td>
                                  <td className="px-3 py-3 text-textSub">{item.winnerNameAtThatTime}</td>
                                  <td className="px-3 py-3 text-textSub">{championLineupMap.get(`${row.uid}-${item.season}`) || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-auto md:block">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-surface text-textSub shadow-sm">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold">名次</th>
                  <th className="px-4 py-3 text-left font-semibold">UID</th>
                  <th className="px-4 py-3 text-left font-semibold">名字</th>
                  <th className="px-4 py-3 text-left font-semibold">兽王获得次数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-textMain">
                {pageRows.map((row) => {
                  const expanded = expandedUid === row.uid;
                  return (
                    <>
                      <tr key={row.uid} className="hover:bg-surface/60">
                        <td className="px-4 py-3 font-semibold">{row.rank}</td>
                        <td className="px-4 py-3 font-mono text-textSub">{row.uid}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setExpandedUid((previous) => previous === row.uid ? null : row.uid)} className="text-left font-semibold text-primary">
                            {row.currentName}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono">{row.championCount}</td>
                      </tr>

                      {expanded ? (
                        <tr key={`${row.uid}-expanded`} className="bg-surface/40">
                          <td colSpan={4} className="px-4 py-4">
                            <div className="space-y-4">
                              <div className="rounded-2xl border border-border bg-card p-4">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                  <div>
                                    <div className="text-lg font-semibold text-textMain">{row.currentName}</div>
                                    <div className="mt-1 font-mono text-xs text-textSub break-all">{row.uid}</div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[560px] xl:max-w-[720px]">
                                    <div className="rounded-xl border border-border bg-surface px-3 py-3">
                                      <div className="text-xs text-textSub">兽王获得次数</div>
                                      <div className="mt-1 font-semibold text-textMain">{row.championCount}</div>
                                    </div>
                                    <div className="rounded-xl border border-border bg-surface px-3 py-3">
                                      <div className="text-xs text-textSub">区服覆盖</div>
                                      <div className="mt-1 font-semibold text-textMain">{row.sidCoverage.join('、')} 服</div>
                                    </div>
                                    <div className="rounded-xl border border-border bg-surface px-3 py-3">
                                      <div className="text-xs text-textSub">首次夺冠</div>
                                      <div className="mt-1 font-semibold text-textMain">{row.firstChampionSeason == null ? '-' : formatSeasonLabel(row.firstChampionSeason)}</div>
                                    </div>
                                    <div className="rounded-xl border border-border bg-surface px-3 py-3">
                                      <div className="text-xs text-textSub">最近夺冠</div>
                                      <div className="mt-1 font-semibold text-textMain">{row.latestChampionSeason == null ? '-' : formatSeasonLabel(row.latestChampionSeason)}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-border bg-card p-4">
                                <div className="text-sm font-semibold text-textMain">曾用名</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {normalizeAliasList(row.winnerAliasList).map((alias) => (
                                    <span key={`${row.uid}-${alias}`} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-textSub">{alias}</span>
                                  ))}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-border bg-card p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-textMain">夺冠赛季记录</div>
                                  <div className="text-xs text-textSub">共 {row.seasonWins.length} 次</div>
                                </div>
                                <div className="mt-3 overflow-auto rounded-xl border border-border">
                                  <table className="min-w-[680px] w-full text-sm">
                                    <thead className="bg-surface text-textSub">
                                      <tr className="border-b border-border">
                                        <th className="px-3 py-3 text-left font-semibold">赛季</th>
                                        <th className="px-3 py-3 text-left font-semibold">当时昵称</th>
                                        <th className="px-3 py-3 text-left font-semibold">宠物配置</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border text-textMain">
                                      {row.seasonWins.map((item) => (
                                        <tr key={`${row.uid}-${item.season}-${item.sid}-${item.winnerNameAtThatTime}`} className="hover:bg-surface/60">
                                          <td className="px-3 py-3 font-semibold">{formatSeasonLabel(item.season)}</td>
                                          <td className="px-3 py-3 text-textSub">{item.winnerNameAtThatTime}</td>
                                          <td className="px-3 py-3 text-textSub">{championLineupMap.get(`${row.uid}-${item.season}`) || '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-textSub">显示第 {pageStart}-{pageEnd} 条，共 {rows.length} 条</div>
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
