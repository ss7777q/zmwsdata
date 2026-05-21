import { useMemo } from 'react';
import CostBadge from '../ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}

export default function RideEquip({ dataSources }: Props) {
    const makeData = dataSources['ride_equip_make']?.data;
    const upgradeData = dataSources['ride_equip_upgrade']?.data;

    // 按坐骑套装阶段分组
    const groupedMakeData = useMemo(() => {
        if (!makeData) return {};
        const groups: Record<string, any[]> = {};
        makeData.forEach((item: any) => {
            const groupName = item.group ? `Lv.${item.group} 装备组` : `通用 / 神化 / 其他`;
            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(item);
        });
        return groups;
    }, [makeData]);

    if (!makeData && !upgradeData) {
        return <div className="text-center text-textSub p-10">等待坐骑装备数据...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* 装备打造部分 */}
                <div className="card p-6 border border-border/50">
                    <div className="flex items-center gap-3 mb-6">
                        <h2 className="text-xl font-bold text-textMain">专属防具铸造</h2>
                        <span className="text-sm px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            打造成本
                        </span>
                    </div>

                    {makeData && (
                        <div className="space-y-6">
                            {Object.entries(groupedMakeData).map(([groupName, items]) => (
                                <div key={groupName} className="bg-background rounded-lg p-5 border border-border/50 shadow-inner">
                                    <h3 className="text-lg font-bold text-textMain mb-4">{groupName}</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {items.map((item, idx) => (
                                            <div key={idx} className="bg-surface border border-border/30 rounded p-3">
                                                <div className="font-bold text-textMain mb-2">{item.name}</div>
                                                <div className="space-y-1">
                                                    {item.cost && item.cost.map((c: any, cIdx: number) => (
                                                        <div key={cIdx} className="flex items-center justify-between text-sm">
                                                            <span className="text-textSub flex items-center gap-1">
                                                                <CostBadge itemId={c.itemId} name={c.name} count={1} hideName />
                                                                {c.name}
                                                            </span>
                                                            <span className="font-medium text-cta">{c.count}</span>
                                                        </div>
                                                    ))}
                                                    {(!item.cost || item.cost.length === 0) && (
                                                        <span className="text-textSub text-sm">-</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 装备强化部分 */}
                <div className="card p-6 border border-border/50">
                    <div className="flex items-center gap-3 mb-6">
                        <h2 className="text-xl font-bold text-textMain">装备强化共鸣区间</h2>
                        <span className="text-sm px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            强化经验与灵魂
                        </span>
                    </div>

                    {upgradeData && (
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead>
                                    <tr className="border-b-2 border-border text-textSub">
                                        <th className="pb-3 pr-6 font-medium">提升段位</th>
                                        <th className="pb-3 pr-6 font-medium">层级共计灵魂</th>
                                        <th className="pb-3 pr-6 font-medium">总计经验 Exp</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                    {upgradeData.map((tier: any, idx: number) => {
                                        const levels = tier.levelEnd - tier.levelStart + 1;
                                        // 假设灵魂消耗为主材料，提取灵魂总量
                                        const soulCost = tier.cost?.find((c: any) => c.itemId === 3)?.count || 0;
                                        const totalSoul = soulCost * levels;
                                        const totalExp = tier.exp * levels;

                                        return (
                                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                <td className="py-3 pr-6 text-textMain font-medium">
                                                    Lv.{tier.levelStart} - Lv.{tier.levelEnd}
                                                    <span className="text-textSub font-normal ml-2 text-xs">
                                                        ({levels}阶段)
                                                    </span>
                                                </td>
                                                <td className="py-3 pr-6">
                                                    <div className="flex items-center gap-2">
                                                        <CostBadge itemId={3} name="灵魂" count={totalSoul} />
                                                        <span className="text-xs text-textSub">(单 {soulCost})</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 pr-6 font-mono text-green-400">
                                                    {totalExp.toLocaleString()}
                                                    <span className="text-xs text-textSub ml-1 font-sans">
                                                        pt
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
