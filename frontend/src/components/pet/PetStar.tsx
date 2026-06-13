import { clsx } from 'clsx';
import CostBadge from '../ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}
export default function PetStar({ dataSources }: Props) {
    const starData = (dataSources['pet_star'] as any)?.data || [];
    const matingData = (dataSources['pet_mating'] as any)?.data?.groups || [];

    return (
        <div className="space-y-6 fade-in duration-500 pb-10">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {starData.map((group: any, idx: number) => {
                    const themeColor = group.type === '神兽' ? 'text-orange-500 bg-orange-500/10 border-orange-500/30'
                        : group.type === '仙兽' ? 'text-purple-400 bg-purple-500/10 border-purple-500/30'
                            : 'text-blue-400 bg-blue-500/10 border-blue-500/30';

                    return (
                        <div key={idx} className="bg-surface border border-border shadow-sm rounded-xl overflow-hidden flex flex-col">
                            <div className={clsx("p-4 border-b flex justify-between items-center", themeColor)}>
                                <h3 className="font-bold text-xl drop-shadow-sm">{group.type}</h3>
                                <div className="text-sm font-mono opacity-80 backdrop-blur-sm px-2 py-0.5 rounded-md bg-black/20">
                                    {group.pets?.length || 0} 种
                                </div>
                            </div>

                            <div className="p-4 flex-1 space-y-6">
                                {/* 适用宠物折叠或平铺 */}
                                <div className="mb-4">
                                    <div className="text-xs text-textSub mb-2 uppercase tracking-wide">包含宠物</div>
                                    <div className="flex flex-wrap gap-1.5 h-20 overflow-y-auto custom-scrollbar">
                                        {group.pets?.map((p: string, pIdx: number) => (
                                            <span key={pIdx} className="text-xs px-2 py-1 rounded bg-textMain/5 text-textMain border border-border">
                                                {p}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* 进阶部分 (Rank 0 -> 1 -> 2) */}
                                <div className="space-y-4">
                                    <div className="text-sm font-bold text-textMain border-b border-border/50 pb-1">等阶提升</div>

                                    <div className="flex flex-col gap-3">
                                        {group.rankCost0To1 && (
                                            <div className="flex justify-between items-center bg-background p-2 rounded-lg border border-border">
                                                <span className="text-sm text-textSub">0阶 → 1阶</span>
                                                <div className="flex gap-1">
                                                    {group.rankCost0To1.map((c: any, cIdx: number) => (
                                                        <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {group.rankCost1To2 && (
                                            <div className="flex justify-between items-center bg-background p-2 rounded-lg border border-border">
                                                <span className="text-sm text-textSub">1阶 → 2阶</span>
                                                <div className="flex text-xs text-textSub italic opacity-80">
                                                    {group.rankCost1To2.note} × {group.rankCost1To2.count}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 升星与配对部分 */}
                                {(() => {
                                    const matingGroup = matingData.find((m: any) => m.type === group.type);
                                    const opt1 = matingGroup?.configs?.[0]?.systemOptions?.find((o: any) => o.option === 1)?.costByStar || [];
                                    const opt2 = matingGroup?.configs?.[0]?.systemOptions?.find((o: any) => o.option === 2)?.costByStar || [];

                                    if ((!group.starCost || group.starCost.length === 0) && opt1.length === 0 && opt2.length === 0) return null;

                                    let maxStar = 0;
                                    if (group.starCost) {
                                        group.starCost.forEach((c: any, index: number) => {
                                            const match = c.name?.match(/(\d+)星/);
                                            const sNum = match ? parseInt(match[1]) : (index + 2);
                                            maxStar = Math.max(maxStar, sNum);
                                        });
                                    }
                                    if (opt1.length) maxStar = Math.max(maxStar, Math.max(...opt1.map((c: any) => c.star + 1)));
                                    if (opt2.length) maxStar = Math.max(maxStar, Math.max(...opt2.map((c: any) => c.star + 1)));

                                    const rows = [];
                                    for (let star = 1; star <= maxStar; star++) {
                                        let stoneCost = null;
                                        if (group.starCost) {
                                            stoneCost = group.starCost.find((c: any, index: number) => {
                                                const match = c.name?.match(/(\d+)星/);
                                                const sNum = match ? parseInt(match[1]) : (index + 2);
                                                return sNum === star;
                                            });
                                        }

                                        const mOpt1 = opt1.find((c: any) => c.star + 1 === star)?.count;
                                        const mOpt2 = opt2.find((c: any) => c.star + 1 === star)?.count;

                                        if (!stoneCost && mOpt1 === undefined && mOpt2 === undefined) continue;

                                        rows.push(
                                            <tr key={star} className="hover:bg-textMain/5 transition-colors">
                                                <td className="px-4 py-2 font-mono text-textMain font-medium">{star} 星</td>
                                                <td className="px-4 py-2">
                                                    {stoneCost ? <CostBadge itemId={stoneCost.itemId} name={stoneCost.name} count={stoneCost.count} /> : <span className="text-textSub">-</span>}
                                                </td>
                                                <td className="px-4 py-2 text-textMatingNormal font-mono font-medium">
                                                    {mOpt1 !== undefined ? mOpt1 : <span className="text-textSub font-normal">-</span>}
                                                </td>
                                                <td className="px-4 py-2 text-textMatingAdvanced font-mono font-medium">
                                                    {mOpt2 !== undefined ? mOpt2 : <span className="text-textSub font-normal">-</span>}
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return (
                                        <div className="space-y-3 pt-4 border-t border-border/50">
                                            <div className="text-sm font-bold text-textMain pb-1">星级转生与配对消耗</div>
                                            <div className="overflow-x-auto custom-scrollbar border border-border/50 rounded-lg">
                                                <table className="w-full text-left text-xs whitespace-nowrap">
                                                    <thead className="bg-textMain/5 text-textSub uppercase tracking-wider border-b border-border/50">
                                                        <tr>
                                                            <th className="px-4 py-3 font-medium">目标星级</th>
                                                            <th className="px-4 py-3 font-medium">转生石消耗</th>
                                                            <th className="px-4 py-3 font-medium text-textMatingNormal">普通配对(香包)</th>
                                                            <th className="px-4 py-3 font-medium text-textMatingAdvanced">高级配对(香包)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/50">
                                                        {rows}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
