import CostBadge from '../ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}

export default function PetSkill({ dataSources }: Props) {
    const skillData = (dataSources['pet_skill'] as any)?.data || { levels: [] };
    const potentialData = (dataSources['pet_potential'] as any)?.data || { sharedCostByLevel: [], maxLevelBonus: null };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full fade-in zoom-in-95 duration-500">
            {/* 宠物技能消耗面板 */}
            <div className="bg-surface border border-border shadow-sm rounded-xl overflow-hidden flex flex-col h-[700px]">
                <div className="p-4 border-b border-border bg-textMain/5 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg text-primary">宠物技能培养</h3>
                    <div className="text-sm font-mono text-textSub">宠技要诀消耗</div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar p-0">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="sticky top-0 bg-surface z-10 shadow-sm border-b border-border">
                            <tr className="bg-textMain/5 text-textSub text-xs uppercase tracking-wider">
                                <th className="px-4 py-3 font-medium">技能等级</th>
                                <th className="px-4 py-3 font-medium">角色要求</th>
                                <th className="px-4 py-3 font-medium">单级升级消耗</th>
                                <th className="px-4 py-3 font-medium text-cta">到本级总计消耗</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {(() => {
                                const cumulativeCosts = new Map<string, { itemId: number; name: string; count: number }>();

                                return skillData.levels.map((lvl: any) => {
                                    const upgradeCosts = Array.isArray(lvl.upgradeCost) ? lvl.upgradeCost : [];

                                    for (const cost of upgradeCosts) {
                                        const key = `${cost.itemId}-${cost.name}`;
                                        const existing = cumulativeCosts.get(key);
                                        cumulativeCosts.set(key, {
                                            itemId: cost.itemId,
                                            name: cost.name,
                                            count: (existing?.count || 0) + Number(cost.count || 0),
                                        });
                                    }

                                    return (
                                        <tr key={lvl.level} className="hover:bg-textMain/5 transition-colors">
                                            <td className="px-4 py-3 font-mono text-textMain">Lv.{lvl.level}</td>
                                            <td className="px-4 py-3 font-mono text-textSub">
                                                {lvl.roleLevel > 0 ? `Lv.${lvl.roleLevel}` : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {upgradeCosts.length > 0 ? upgradeCosts.map((c: any, i: number) => (
                                                        <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                    )) : '-'}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {cumulativeCosts.size > 0 ? Array.from(cumulativeCosts.values()).map((c) => (
                                                        <CostBadge key={`${c.itemId}-${c.name}`} itemId={c.itemId} name={c.name} count={c.count} />
                                                    )) : '-'}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 宠物潜能消耗面板 */}
            <div className="bg-surface border border-border shadow-sm rounded-xl overflow-hidden flex flex-col h-[700px]">
                <div className="p-4 border-b border-border bg-textMain/5 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg text-orange-500">宠物潜能升级</h3>
                    <div className="text-sm font-mono text-textSub">所有潜能残页消耗相同</div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar p-0">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="sticky top-0 bg-surface z-10 shadow-sm border-b border-border">
                            <tr className="bg-textMain/5 text-textSub text-xs uppercase tracking-wider">
                                <th className="px-4 py-3 font-medium">潜能等级</th>
                                <th className="px-4 py-3 font-medium">单项单级开支</th>
                                <th className="px-4 py-3 font-medium text-cta">到本级总计消耗</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {(() => {
                                let cumulativeCost = 0;
                                return potentialData.sharedCostByLevel.map((lvl: any) => {
                                    const costNode = lvl.upgradeCost?.[0];
                                    if (costNode) {
                                        cumulativeCost += costNode.count;
                                    }
                                    return (
                                        <tr key={lvl.level} className="hover:bg-textMain/5 transition-colors">
                                            <td className="px-4 py-3 font-mono text-textMain">Lv.{lvl.level} → Lv.{lvl.level + 1}</td>
                                            <td className="px-4 py-3">
                                                {costNode ? <CostBadge itemId={costNode.itemId} name={costNode.name} count={costNode.count} /> : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {costNode ? <CostBadge itemId={costNode.itemId} name={costNode.name} count={cumulativeCost} /> : '-'}
                                            </td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
