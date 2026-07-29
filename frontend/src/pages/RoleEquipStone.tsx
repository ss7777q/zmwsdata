import CostBadge from '../components/ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleEquipStone({ dataSources }: Props) {
    const stoneData = dataSources['role_equip_stone']?.data || [];

    if (!stoneData.length) return null;

    return (
        <div className="card mt-8">
            <h3 className="text-lg font-bold text-textMain mb-2">宝石合成进阶</h3>
            <p className="text-sm text-textSub mb-6">不同属性的宝石从 1 级合成至顶级（通常为 10 或 11 级），低级+材料可合成高级宝石。</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {stoneData.map((groupData: any, idx: number) => (
                    <div key={idx} className="bg-surface rounded-xl overflow-hidden border border-border">
                        <div className="bg-gradient-to-r from-border/50 to-transparent px-4 py-3 border-b border-border">
                            <h4 className="font-bold text-primary">{groupData.groupName}</h4>
                            <p className="text-xs text-textSub">套装/类型 ID: {groupData.group}</p>
                        </div>

                        <div className="p-4 space-y-3">
                            {[...(groupData.levels || [])].sort((a: any, b: any) => a.level - b.level).map((levelItem: any, lIdx: number) => (
                                <div key={lIdx} className="flex flex-col gap-2 py-2 border-b border-border/50 last:border-0 last:pb-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold flex items-center gap-2">
                                            {levelItem.name}
                                            <span className="text-[10px] bg-background px-1.5 py-0.5 rounded text-textSub">LV.{levelItem.level}</span>
                                        </span>
                                        <span className="text-xs font-mono text-green-500/90 tracking-tight">
                                            {levelItem.attribute}: +{levelItem.attributeValue}
                                        </span>
                                    </div>

                                    {levelItem.sellCost && levelItem.sellCost.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {levelItem.sellCost.map((c: any, cIdx: number) => {
                                                let countDisplay = c.count;
                                                if (typeof c.count === 'object' && c.count.min !== undefined) {
                                                    countDisplay = `${c.count.min}~${c.count.max}`;
                                                }
                                                return <CostBadge key={cIdx} itemId={c.itemId} count={countDisplay} name={c.name} />
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
