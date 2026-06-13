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

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleEquipUpgrade({ dataSources }: Props) {
    const upgradeData = dataSources['role_equip_upgrade']?.data || [];

    const chartData = useMemo(() => {
        let accumulatedSoul = 0;
        return upgradeData.map((item: any) => {
            // cost 数组中一般首个为灵魂消耗
            const soulCost = item.cost && item.cost.length > 0 ? item.cost[0].count : 0;
            const expCost = item.exp || 0;
            const levelCount = item.levelEnd - item.levelStart + 1;

            accumulatedSoul += soulCost * levelCount; // 灵魂累加

            return {
                name: `${item.levelStart}-${item.levelEnd}级`,
                levelStart: item.levelStart,
                soulPerLevel: soulCost,
                expPerLevel: expCost,
                accumulatedSoul
            };
        }).sort((a: any, b: any) => a.levelStart - b.levelStart);
    }, [upgradeData]);

    if (!upgradeData.length) return null;

    return (
        <div className="card mt-8">
            <h3 className="text-lg font-bold text-textMain mb-2">装备强化消耗趋势</h3>
            <p className="text-sm text-textSub mb-6">展示每升1级所需的灵魂消耗与强化经验，以及按段累计的总量。</p>

            <div className="w-full">
                <ResponsiveContainer width="100%" height={400}>
                    <LineChart
                        data={chartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                        <XAxis dataKey="name" stroke="var(--text-sub)" fontSize={12} />

                        {/* 左侧Y轴主要服务于灵魂与经验的单次成长或小数值 */}
                        <YAxis yAxisId="left" stroke="var(--primary)" fontSize={12} tickFormatter={(val) => (val / 1000).toFixed(0) + 'k'} />
                        {/* 右侧Y轴服务于巨大的累计值 */}
                        <YAxis yAxisId="right" orientation="right" stroke="var(--cta)" fontSize={12} tickFormatter={(val) => (val / 1000000).toFixed(1) + 'm'} />

                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px' }}
                            itemStyle={{ color: 'var(--text-main)' }}
                            formatter={(value: any, name: any) => {
                                if (value === undefined) return ['-', name];
                                return [Number(value).toLocaleString(), name];
                            }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />

                        <Line yAxisId="left" type="stepAfter" dataKey="soulPerLevel" name="单级消耗灵魂" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                        <Line yAxisId="left" type="stepAfter" dataKey="expPerLevel" name="单级消耗经验" stroke="#10b981" strokeWidth={2} dot={false} />

                        <Line yAxisId="right" type="monotone" dataKey="accumulatedSoul" name="累计灵魂" stroke="var(--cta)" strokeWidth={3} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
