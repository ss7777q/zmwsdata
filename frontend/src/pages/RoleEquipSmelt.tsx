import { useMemo } from 'react';

interface Props {
    dataSources: Record<string, any>;
}

const PART_MAP: Record<string, string> = {
    weapon: '武器',
    head: '头盔',
    armor: '防具',
    hand: '护腕',
    foot: '鞋子',
    jewelry: '饰品'
};

export default function RoleEquipSmelt({ dataSources }: Props) {
    const smeltData = dataSources['role_equip_smelt']?.data || [];

    const smeltMatrix = useMemo(() => {
        // 聚合 品质 -> 部位 -> 熔炼等级消耗
        const qMap = new Map<number, any>();
        smeltData.forEach((item: any) => {
            const q = item.quality;
            if (!qMap.has(q)) qMap.set(q, { quality: q, parts: {} });
            const record = qMap.get(q);

            if (!record.parts[item.part]) record.parts[item.part] = [];
            record.parts[item.part].push(item);
        });

        return Array.from(qMap.values()).sort((a, b) => b.quality - a.quality); // 高品质在前
    }, [smeltData]);

    if (!smeltData.length) return null;

    return (
        <div className="card mt-8">
            <h3 className="text-lg font-bold text-textMain mb-2">装备熔炼阶段图</h3>
            <p className="text-sm text-textSub mb-6">不同品质和部位的装备，其熔炼解锁等级存在差异。所有熔炼固定消耗角色经验与宠物经验。</p>

            <div className="space-y-8">
                {smeltMatrix.map((qGroup, idx) => (
                    <div key={idx} className="border border-border rounded-lg p-5">
                        <h4 className="text-md font-bold text-primary mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center text-xs">Q{qGroup.quality}</span>
                            品质 {qGroup.quality} 装备
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Object.entries(qGroup.parts).map(([partKey, stages]: [string, any], pIdx) => (
                                <div key={pIdx} className="bg-background rounded-md p-4 border border-border/50">
                                    <h5 className="font-semibold text-textMain mb-3 pb-2 border-b border-border/50 text-sm">
                                        {PART_MAP[partKey] || partKey}
                                    </h5>
                                    <div className="space-y-2">
                                        {stages.sort((a: any, b: any) => a.smeltLv - b.smeltLv).map((stage: any, sIdx: number) => {
                                            // 针对固定的角色(6) 宠物经验(7) 简化写死
                                            const expCost = stage.cost && stage.cost.length > 0 ? stage.cost[0].count : 0;

                                            return (
                                                <div key={sIdx} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-full bg-surface text-textSub flex items-center justify-center font-mono">{stage.smeltLv}</div>
                                                        <span className="text-textSub">解锁 LV.{stage.unlockLv}</span>
                                                    </div>
                                                    <div className="text-green-500/80 font-mono text-[10px] tracking-tight">Exp -{expCost}</div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                    </div>
                ))}
            </div>
        </div>
    );
}
