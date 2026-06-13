import { useMemo } from 'react';
import CostBadge from '../ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}

export default function RideStar({ dataSources }: Props) {
    const starData = dataSources['ride_star']?.data; // { groups: [...] }

    // 将数据转置为以星级为行的表格数据
    const tableData = useMemo(() => {
        if (!starData || !starData.groups) return [];

        const rows: Record<number, any> = {};

        starData.groups.forEach((group: any) => {
            const cat = group.category; // "普通" 或 "凶兽"
            if (group.promoteStarCost) {
                group.promoteStarCost.forEach((stage: any) => {
                    if (!rows[stage.star]) {
                        rows[stage.star] = { star: stage.star };
                    }
                    rows[stage.star][cat] = stage.cost;
                });
            }
        });

        // 提取并排序
        return Object.values(rows).sort((a: any, b: any) => a.star - b.star);
    }, [starData]);

    if (!starData || !starData.groups) {
        return <div className="text-center text-textSub p-10">等待坐骑升星数据...</div>;
    }

    // 动态提取所有的分类名作为表头
    const categories = starData.groups.map((g: any) => g.category);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="card p-6 border border-border/50">
                <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-xl font-bold text-textMain flex items-center gap-2">
                        <span className="w-1 h-4 rounded-full bg-yellow-500 shrink-0"></span>
                        坐骑升星消耗
                    </h2>
                </div>

                <div className="overflow-x-auto custom-scrollbar border border-border/30 rounded-lg max-h-[70vh] overflow-y-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-surface sticky top-0 z-10 shadow-sm border-b border-border/50">
                            <tr className="text-textSub text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 font-bold text-textMain border-r border-border/30 bg-background/50">目标星级</th>
                                {categories.map((cat: string, idx: number) => (
                                    <th key={idx} className="px-6 py-4 font-medium text-center border-r border-border/30 last:border-0 hover:bg-white/5 transition-colors">
                                        <div className="flex items-center justify-center gap-2">
                                            {cat === '凶兽' ? '' : ''} {cat}坐骑
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30 bg-background/30">
                            {tableData.map((row: any, rIdx: number) => (
                                <tr key={rIdx} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4 font-mono font-bold text-yellow-400 text-base border-r border-border/30 text-center bg-surface/30">
                                        ★ {row.star}
                                    </td>
                                    {categories.map((cat: string, cIdx: number) => (
                                        <td key={cIdx} className="px-6 py-4 border-r border-border/30 last:border-0 align-top">
                                            {row[cat] && row[cat].length > 0 ? (
                                                <div className="flex flex-wrap items-center justify-center gap-2 group-hover:scale-[1.02] transition-transform">
                                                    {row[cat].map((c: any, cIdx: number) => (
                                                        <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} hideName={false} />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center text-textSub/50 italic py-2">无消耗数据</div>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
