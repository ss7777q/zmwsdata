import { useMemo } from 'react';
import { Package, ArrowUpCircle } from 'lucide-react';
import CostBadge from '../ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}

export default function PetEquip({ dataSources }: Props) {
    const makeData = (dataSources['pet_equip_make'] as any)?.data || [];
    const upgradeData = (dataSources['pet_equip_upgrade'] as any)?.data || [];

    const groupedMake = useMemo(() => {
        const result: Record<number, any[]> = {};
        for (const item of makeData) {
            if (!result[item.group]) result[item.group] = [];
            result[item.group].push(item);
        }
        return Object.entries(result).sort((a, b) => Number(a[0]) - Number(b[0]));
    }, [makeData]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full fade-in zoom-in-95 duration-500">
            <div className="bg-surface border border-border shadow-sm rounded-xl overflow-hidden flex flex-col h-[750px]">
                <div className="p-4 border-b border-border bg-textMain/5 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                        <Package className="w-5 h-5" /> 宠物装备重铸
                    </h3>
                    <div className="text-sm font-mono text-textSub">套装进阶消耗</div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar p-6 space-y-8">
                    {groupedMake.map(([group, items]) => (
                        <div key={group} className="space-y-4">
                            <h4 className="flex items-center gap-2 text-textMain font-bold">
                                <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-sm shrink-0">
                                    Lv.{group}
                                </span>
                                {items[0]?.name ? `${items[0].name.substring(0, 2)}系列` : '阶段套装系列'}
                            </h4>

                            {/* 套装基础打造消耗 (从第一件提取) */}
                            {(items[0]?.cost?.length > 0 || items[0]?.costN1?.length > 0) && (
                                <div className="bg-textMain/5 border border-border/60 rounded-lg p-3 space-y-2 mb-2">
                                    <div className="text-xs font-semibold text-textMain flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary/60"></div>
                                        重铸消耗
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {items[0].cost?.map((c: any, cIdx: number) => (
                                            <CostBadge key={`base-${cIdx}`} itemId={c.itemId} name={c.name} count={c.count} />
                                        ))}
                                        {items[0].costN1?.map((c: any, cIdx: number) => (
                                            <CostBadge key={`base-n1-${cIdx}`} itemId={c.itemId} name={`N1·${c.name}`} count={c.count} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 套装统一升重消耗 */}
                            {items[0]?.recastUpgrade?.length > 0 && (
                                <div className="bg-textMain/5 border border-border/60 rounded-lg p-3 space-y-2 mb-2">
                                    <div className="text-xs font-semibold text-cta flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-cta"></div>
                                        升重消耗
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {items[0].recastUpgrade.map((stage: any, stageIdx: number) => (
                                            <div key={stageIdx} className="bg-textMain/5 rounded-md p-2 flex flex-col gap-2 border border-border/50 flex-1 min-w-[150px]">
                                                <div className="text-[11px] text-textSub font-mono bg-background w-max px-1.5 py-0.5 rounded border border-border/30">
                                                    {stageIdx + 1}重 → {stageIdx + 2}重
                                                </div>
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {stage.cost?.map((c: any, cIdx: number) => (
                                                        <CostBadge key={`stage-${stageIdx}-${cIdx}`} itemId={c.itemId} name={c.name} count={c.count} />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="bg-textMain/5 border border-border p-3 rounded-lg flex flex-col gap-2">
                                <div className="text-xs font-semibold text-textMain flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
                                    包含装备部件
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {items.map((item: any) => (
                                        <div key={item.id} className="bg-background border border-border/50 px-3 py-1.5 rounded-md text-sm font-bold text-textMain shadow-sm">
                                            {item.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-surface border border-border shadow-sm rounded-xl overflow-hidden flex flex-col h-[750px]">
                <div className="p-4 border-b border-border bg-textMain/5 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg text-cta flex items-center gap-2">
                        <ArrowUpCircle className="w-5 h-5" /> 宠物装备强化
                    </h3>
                    <div className="text-sm font-mono text-textSub">消耗强化经验以及灵魂</div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar p-0">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="sticky top-0 bg-surface z-10 shadow-sm border-b border-border">
                            <tr className="bg-textMain/5 text-textSub text-xs uppercase tracking-wider">
                                <th className="px-4 py-3 font-medium">层级段落</th>
                                <th className="px-4 py-3 font-medium">段内单级经验</th>
                                <th className="px-4 py-3 font-medium">强运保护消耗</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {upgradeData.map((tier: any, idx: number) => {
                                const costNode = tier.cost?.[0];
                                const isRange = tier.levelStart !== tier.levelEnd;

                                return (
                                    <tr key={idx} className="hover:bg-textMain/5 transition-colors">
                                        <td className="px-4 py-3 font-mono text-textMain font-medium">
                                            {isRange ? `Lv.${tier.levelStart} ~ Lv.${tier.levelEnd}` : `Lv.${tier.levelStart}`}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-textSub">
                                            {Number(tier.exp).toLocaleString()} Exp
                                        </td>
                                        <td className="px-4 py-3">
                                            {costNode ? <CostBadge itemId={costNode.itemId} name={costNode.name} count={costNode.count} /> : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
}
