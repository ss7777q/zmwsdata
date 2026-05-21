import { useMemo } from 'react';
import CostBadge from '../ui/CostBadge';
import { Hammer, ArrowRight } from 'lucide-react';

interface Props {
    dataSources: Record<string, any>;
}

export default function RideEquipMake({ dataSources }: Props) {
    const makeData = dataSources['ride_equip_make']?.data || [];
    const recastData = dataSources['ride_equip_recast']?.data || [];

    // process makeData -> group by "group"
    const makeGroups = useMemo(() => {
        const groupsMap: Record<number, any> = {};
        makeData.forEach((eq: any) => {
            if (!groupsMap[eq.group]) {
                groupsMap[eq.group] = {
                    level: eq.group,
                    cost: eq.cost || [],
                    parts: []
                };
            }
            groupsMap[eq.group].parts.push(eq.name);
        });
        return Object.values(groupsMap).sort((a: any, b: any) => a.level - b.level);
    }, [makeData]);

    if (!makeData.length || !recastData.length) {
        return <div className="text-center text-textSub p-10">等待坐骑装备锻造 / 重铸数据...</div>;
    }

    return (
        <div className="card p-6 border border-border/50">
            <div className="flex items-center gap-3 mb-6">
                <h2 className="text-xl font-bold text-textMain">坐骑装备 打造/重铸</h2>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* 打造面板 */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                        <div className="p-2 rounded bg-primary/20 text-primary">
                            <Hammer className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-textMain">装备打造</h3>
                            <p className="text-xs text-textSub">打造所需材料</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto custom-scrollbar border border-border/30 rounded-lg max-h-[70vh] overflow-y-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-surface sticky top-0 z-10 shadow-sm border-b border-border/50">
                                <tr className="text-textSub text-xs uppercase tracking-wider">
                                    <th className="px-4 py-3 font-medium">基准防具等阶</th>
                                    <th className="px-4 py-3 font-medium">涵盖部位组合</th>
                                    <th className="px-4 py-3 font-medium">单件系统配方开销</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30 bg-background/30">
                                {makeGroups.map((g: any, i: number) => (
                                    <tr key={i} className="hover:bg-white/5 transition-colors group/row">
                                        <td className="px-4 py-4 font-mono text-orange-400 font-bold align-top">
                                            Lv.{g.level}
                                        </td>
                                        <td className="px-4 py-4 text-textSub text-xs align-top">
                                            <div className="flex flex-col gap-1.5">
                                                {g.parts.map((p: string, idx: number) => (
                                                    <span key={idx} className="flex items-center before:content-[''] before:w-1 before:h-1 before:bg-border before:rounded-full before:mr-2">
                                                        {p}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 align-top">
                                            <div className="flex flex-wrap items-center gap-2">
                                                {g.cost.map((c: any, cIdx: number) => (
                                                    <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} hideName={false} />
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 神铸面板 */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                        <div className="p-2 rounded bg-purple-500/20 text-purple-400">
                            <ArrowRight className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-textMain">装备神铸</h3>
                            <p className="text-xs text-textSub">神铸消耗数据</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto custom-scrollbar border border-border/30 rounded-lg max-h-[70vh] overflow-y-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-surface sticky top-0 z-10 shadow-sm border-b border-border/50">
                                <tr className="text-textSub text-xs uppercase tracking-wider">
                                    <th className="px-4 py-3 font-medium">跃阶基准</th>
                                    <th className="px-4 py-3 font-medium">对应部位名</th>
                                    <th className="px-4 py-3 font-medium">神铸消耗</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-border/60 bg-background/30">
                                {recastData.map((node: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors group/row">
                                        <td className="px-4 py-4 font-mono font-bold align-top">
                                            <span className="text-textSub">Lv.{node.sourceLevel}</span>
                                            {node.sourceLevel !== node.targetLevel && (
                                                <>
                                                    <span className="mx-1 text-textSub/50">→</span>
                                                    <span className="text-purple-400">Lv.{node.targetLevel}</span>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-textSub text-xs align-top">
                                            <div className="flex flex-col gap-1.5">
                                                {node.parts.map((p: any, pIdx: number) => (
                                                    <span key={pIdx} className="flex items-center gap-1 before:content-[''] before:w-1 before:h-1 before:bg-border before:rounded-full before:mr-1">
                                                        <span>{p.sourceName}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 align-top">
                                            <div className="flex flex-col gap-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {node.cost.map((c: any, cIdx: number) => (
                                                        <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} hideName={false} />
                                                    ))}
                                                </div>
                                                <div className="pt-2 border-t border-border/30">
                                                    <div className="text-xs text-textSub mb-1.5 flex items-center gap-1">
                                                        四部位总计:
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {node.cost.map((c: any, cIdx: number) => (
                                                            <CostBadge key={`total-${cIdx}`} itemId={c.itemId} name={c.name} count={c.count * 4} hideName={false} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
