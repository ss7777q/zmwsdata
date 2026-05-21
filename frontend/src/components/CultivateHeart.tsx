import { useMemo } from 'react';
import { Shield } from 'lucide-react';
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

interface Props {
    dataSources: Record<string, any>;
}

export default function CultivateHeart({ dataSources }: Props) {
    const rawData = (dataSources['role_heart'] as any)?.data || [];

    const tableData = useMemo(() => {
        let accumulated = 0;
        return rawData.map((node: any) => {
            const perHole = node.soulCost?.[0]?.count ?? 0;
            const perLevel = perHole * 6; // 六大属性
            accumulated += perLevel;
            return {
                level: node.level,
                roleLevelRequired: node.roleLevelRequired,
                perHole,
                perLevel,
                accumulated,
            };
        });
    }, [rawData]);

    const chartData = useMemo(() => tableData.map((r: any) => ({
        name: `${r.level}级`,
        soulCost: r.perLevel,
        accumulatedSoul: r.accumulated,
    })), [tableData]);

    if (rawData.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/10 rounded-xl bg-surface/50">
                <Shield className="w-12 h-12 text-textSub mb-4 opacity-50" />
                <h3 className="text-xl text-textSub font-medium tracking-wider">未获取到大圆满修心卷轴 (role_heart)</h3>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            {/* Chart */}
            <div className="card">
                <h3 className="text-lg font-bold text-textMain mb-2">修心消耗趋势</h3>
                <p className="text-sm text-textSub mb-6">展示每级升满所需的灵魂消耗，以及累计的总量。</p>
                <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                            <XAxis dataKey="name" stroke="var(--text-sub)" fontSize={11} minTickGap={30} />
                            <YAxis yAxisId="left" stroke="var(--primary)" fontSize={11} tickFormatter={(v) => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v} />
                            <YAxis yAxisId="right" orientation="right" stroke="var(--cta)" fontSize={11} tickFormatter={(v) => (v / 1000000).toFixed(1) + 'm'} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: 12 }}
                                itemStyle={{ color: 'var(--text-main)' }}
                                formatter={(value: any, name: any) => [Number(value).toLocaleString(), name]}
                            />
                            <Legend wrapperStyle={{ paddingTop: '12px', fontSize: 12 }} />
                            <Line yAxisId="left" type="monotone" dataKey="soulCost" name="本级升满消耗" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                            <Line yAxisId="right" type="monotone" dataKey="accumulatedSoul" name="累计灵魂" stroke="var(--cta)" strokeWidth={2.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Note */}
            <div className="text-xs text-textSub bg-surface/50 border border-border/50 rounded-lg px-4 py-2 flex items-center gap-2">
                <span className="text-primary font-mono font-bold">提示</span>
                <span><span className="font-semibold text-textMain">单次消耗</span> = 本级消耗 ÷ 6（修心共六项属性，每项升级消耗相同）。窄屏下该列自动隐藏。</span>
            </div>

            {/* Table */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full text-sm text-left">
                        <thead className="sticky top-0 z-10 bg-textMain/5 border-b border-border text-xs uppercase tracking-wider text-textSub shadow-sm">
                            <tr>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">修心等级</th>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">解锁角色等级</th>
                                <th className="hidden sm:table-cell px-4 py-3 font-semibold whitespace-nowrap">单次消耗</th>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap">本级消耗</th>
                                <th className="px-4 py-3 font-semibold whitespace-nowrap text-cta">累计消耗</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {tableData.map((row: any) => {
                                const isMilestone = row.level > 0 && row.level % 10 === 0;
                                return (
                                    <tr
                                        key={row.level}
                                        className={`hover:bg-textMain/5 transition-colors ${isMilestone ? 'bg-primary/5' : ''}`}
                                    >
                                        <td className={`px-4 py-2.5 font-mono font-bold ${isMilestone ? 'text-primary' : 'text-textMain'}`}>
                                            {row.level}
                                        </td>
                                        <td className="px-4 py-2.5 font-mono text-textSub">
                                            {row.roleLevelRequired > 0 ? `Lv.${row.roleLevelRequired}` : '—'}
                                        </td>
                                        <td className="hidden sm:table-cell px-4 py-2.5 font-mono text-textMain">
                                            {row.perHole > 0 ? row.perHole.toLocaleString() : <span className="text-textSub text-xs italic">免费</span>}
                                        </td>
                                        <td className="px-4 py-2.5 font-mono text-textMain">
                                            {row.perLevel > 0 ? row.perLevel.toLocaleString() : <span className="text-textSub text-xs italic">免费</span>}
                                        </td>
                                        <td className="px-4 py-2.5 font-mono font-semibold text-cta">
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
