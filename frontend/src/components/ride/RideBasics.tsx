import CostBadge from '../ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}

export default function RideBasics({ dataSources }: Props) {
    const masteryData = dataSources['ride_mastery']?.data;
    const ridingData = dataSources['ride_riding']?.data;

    if (!masteryData && !ridingData) {
        return <div className="text-center text-textSub p-10">等待驾驭与骑术数据...</div>;
    }

    return (
        <div className="space-y-6">
            {/* 驾驭模块 */}
            <div className="card p-6 border border-border/50">
                <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-xl font-bold text-textMain">基础驾驭</h2>
                    <span className="text-sm px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                        提升所有坐骑驾驭等级
                    </span>
                </div>
                {masteryData && (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead>
                                <tr className="border-b-2 border-border text-textSub">
                                    <th className="pb-3 pr-6 font-medium">驾驭等级区间</th>
                                    <th className="pb-3 pr-6 font-medium">单级灵魂消耗</th>
                                    <th className="pb-3 pr-6 font-medium">层级共计灵魂</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {masteryData.map((tier: any, idx: number) => {
                                    const levelsInTier = tier.levelEnd - tier.levelStart + 1;
                                    const totalSoul = tier.cost * levelsInTier;
                                    return (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                            <td className="py-3 pr-6 text-textMain">
                                                Lv.{tier.levelStart} - Lv.{tier.levelEnd}
                                                <span className="text-textSub ml-2 text-xs">({levelsInTier}级)</span>
                                            </td>
                                            <td className="py-3 pr-6">
                                                <CostBadge itemId={3} name="灵魂" count={tier.cost} />
                                            </td>
                                            <td className="py-3 pr-6 text-orange-400 font-medium">
                                                {totalSoul.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 骑术模块 */}
            <div className="card p-6 border border-border/50">
                <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-xl font-bold text-textMain">专属骑术分支</h2>
                    <span className="text-sm px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                        水陆空及特殊加成
                    </span>
                </div>
                {ridingData && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {ridingData.map((group: any, idx: number) => (
                            <div key={idx} className="bg-background rounded-lg p-5 border border-border/50 shadow-inner">
                                <div className="mb-4 flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-textMain">
                                        类型 {group.ridingGroup} 骑术
                                    </h3>
                                    <div className="text-sm text-textSub bg-surface px-2 py-1 rounded">
                                        代表坐骑: <span className="text-primary">{group.mountExamples?.slice(0, 3).join(', ')}{group.mountExamples?.length > 3 ? '...' : ''}</span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead>
                                            <tr className="border-b border-border/50 text-textSub">
                                                <th className="pb-2 pr-4 font-medium">等级</th>
                                                <th className="pb-2 pr-4 font-medium">解锁技能</th>
                                                <th className="pb-2 pr-4 font-medium">消耗道具</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/20">
                                            {group.levels.map((lvl: any, lIdx: number) => (
                                                <tr key={lIdx} className="hover:bg-white/5">
                                                    <td className="py-2 pr-4 text-textMain">Lv.{lvl.level}</td>
                                                    <td className="py-2 pr-4 text-cta">
                                                        {lvl.skillId ? `技能ID: ${lvl.skillId}` : '-'}
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        {lvl.cost && lvl.cost.length > 0 ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                {lvl.cost.map((c: any, cIdx: number) => (
                                                                    <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} />
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-textSub">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
