import { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { buildUpgradeSteps, withCumulativeUpgradeCosts } from '../lib/upgrade-cost';

interface Props {
    dataSources: Record<string, any>;
}

export default function CultivateHeart({ dataSources }: Props) {
    const rawData = (dataSources['role_heart'] as any)?.data || [];

    const tableData = useMemo(() => {
        const maxLevel = Math.max(0, ...rawData.map((node: any) => Number(node.level) || 0));
        const steps = withCumulativeUpgradeCosts(buildUpgradeSteps({
            rows: rawData,
            getStoredLevel: (node: any) => node.level,
            getCosts: (node: any) => node.soulCost,
            maxLevel,
        }));
        return steps.map((step) => {
            const perHole = step.costs[0]?.count ?? 0;
            const perLevel = perHole * 6; // 六大属性
            const accumulated = (step.cumulativeCosts[0]?.count ?? 0) * 6;
            return {
                fromLevel: step.fromLevel,
                toLevel: step.toLevel,
                roleLevelRequired: step.source.roleLevelRequired,
                perHole,
                perLevel,
                accumulated,
            };
        });
    }, [rawData]);

    const chartData = useMemo(() => tableData.map((r: any) => ({
        name: `${r.fromLevel}→${r.toLevel}级`,
        soulCost: r.perLevel,
        accumulatedSoul: r.accumulated,
    })), [tableData]);

    if (rawData.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border/80 bg-slate-500/[0.01] dark:bg-white/[0.01] rounded-xl">
                <div className="relative flex items-center justify-center w-12 h-12 mb-3">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-slate-500/10 animate-ping opacity-60"></span>
                    <div className="relative inline-flex rounded-full h-8 w-8 bg-slate-500/15 border border-slate-500/30 items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"></span>
                    </div>
                </div>
                <h3 className="text-xs text-textSub font-medium tracking-wider">未获取到大圆满修心卷轴 (role_heart)</h3>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            {/* Chart */}
            <div className="card">
                <h3 className="text-base font-bold text-textMain mb-1.5">修心消耗趋势</h3>
                <p className="text-xs text-textSub mb-6">展示每级升满所需的灵魂消耗，以及累计的总量。</p>
                <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                            <XAxis dataKey="name" stroke="var(--text-sub)" fontSize={10} minTickGap={30} />
                            <YAxis yAxisId="left" stroke="var(--primary)" fontSize={10} tickFormatter={(v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v} />
                            <YAxis yAxisId="right" orientation="right" stroke="var(--cta)" fontSize={10} tickFormatter={(v) => (v / 1000000).toFixed(1) + 'm'} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: 11 }}
                                itemStyle={{ color: 'var(--text-main)' }}
                                formatter={(value: any, name: any) => [Number(value).toLocaleString(), name]}
                            />
                            <Legend wrapperStyle={{ paddingTop: '12px', fontSize: 11 }} />
                            <Line yAxisId="left" type="monotone" dataKey="soulCost" name="本次升级消耗" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                            <Line yAxisId="right" type="monotone" dataKey="accumulatedSoul" name="累计灵魂" stroke="var(--cta)" strokeWidth={2.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Note */}
            <div className="text-[11px] text-textSub bg-slate-500/[0.02] dark:bg-white/[0.01] border border-border/40 rounded-lg px-4 py-2 flex items-center gap-2">
                <span className="text-primary font-mono font-bold">提示</span>
                <span><span className="font-semibold text-textMain">单次消耗</span> = 本次升级消耗 ÷ 6（修心共六项属性，每项升级消耗相同）。窄屏下该列自动隐藏。</span>
            </div>

            {/* Table */}
            <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full text-xs text-left">
                        <thead className="sticky top-0 z-10 bg-slate-500/[0.04] dark:bg-white/[0.02] border-b border-border/40 text-[10px] uppercase tracking-wider text-textSub shadow-sm">
                            <tr>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">升级阶段</th>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">本次升级要求</th>
                                <th className="hidden sm:table-cell px-4 py-3 font-semibold whitespace-nowrap">单次消耗</th>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">本次升级消耗</th>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap text-cta">升至目标等级累计</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20 font-mono">
                            {tableData.map((row: any) => {
                                const isMilestone = row.toLevel > 0 && row.toLevel % 10 === 0;
                                return (
                                    <tr
                                        key={`${row.fromLevel}-${row.toLevel}`}
                                        className={`hover:bg-purple-500/[0.02] transition-colors ${isMilestone ? 'bg-purple-500/[0.04]' : ''}`}
                                    >
                                        <td className={`px-4 py-2.5 font-bold ${isMilestone ? 'text-purple-600 dark:text-purple-400' : 'text-textMain'}`}>
                                            Lv.{row.fromLevel} → Lv.{row.toLevel}
                                        </td>
                                        <td className="px-4 py-2.5 text-textSub">
                                            {row.roleLevelRequired > 0 ? `Lv.${row.roleLevelRequired}` : '—'}
                                        </td>
                                        <td className="hidden sm:table-cell px-4 py-2.5 text-textMain">
                                            {row.perHole > 0 ? row.perHole.toLocaleString() : <span className="text-textSub text-[10px] italic">免费</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-textMain">
                                            {row.perLevel > 0 ? row.perLevel.toLocaleString() : <span className="text-textSub text-[10px] italic">免费</span>}
                                        </td>
                                        <td className="px-4 py-2.5 font-semibold text-cta">
                                            {row.accumulated.toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
