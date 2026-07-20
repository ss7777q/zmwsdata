import CostBadge from '../ui/CostBadge';
import { buildUpgradeSteps, withCumulativeUpgradeCosts } from '../../lib/upgrade-cost';

interface Props {
    dataSources: Record<string, any>;
}

export default function RideSkill({ dataSources }: Props) {
    const skillData = dataSources['ride_skill']?.data;

    if (!skillData || !skillData.byItem) {
        return <div className="text-center text-textSub p-10">等待坐骑技能数据...</div>;
    }

    const { byItem } = skillData;

    return (
        <div className="card p-6 border border-border/50">
            <div className="flex items-center gap-3 mb-6">
                <h2 className="text-xl font-bold text-textMain">坐骑技能升级规律</h2>
            </div>

            <div className="flex gap-4 mb-6 text-sm text-textSub bg-surface p-3 rounded border border-border/30">
                <p>
                    <span className="font-bold text-textMain">规则概览：</span>分别为绿厕纸与红厕纸,主要差别是41,42级技能升级消耗异常降低
                </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {byItem.map((group: any) => {
                    const levels = Array.isArray(group.levels) ? group.levels : [];
                    const maxLevel = Math.max(1, ...levels.map((level: any) => Number(level.level) || 0));
                    const steps = withCumulativeUpgradeCosts(buildUpgradeSteps({
                        rows: levels,
                        getStoredLevel: (level: any) => level.level,
                        getCosts: (level: any) => [{ itemId: group.itemId, name: group.name, count: level.count }],
                        // 骑技配置记录的是当前等级升下一级的消耗，Lv.1 行对应 Lv.1 → Lv.2。
                        maxLevel,
                    }));

                    return <div key={group.itemId} className="space-y-4">
                        <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                            <CostBadge itemId={group.itemId} name={group.name} count={1} hideName={true} />
                            <div>
                                <h3 className="text-lg font-bold text-textMain">{group.name}系列技能升级消耗</h3>
                                <p className="text-xs text-textSub">包含 <span className="font-medium text-blue-400">{group.skillCount}</span> 种坐骑独属技能分支</p>
                            </div>
                        </div>

                        <div className="overflow-x-auto custom-scrollbar border border-border/30 rounded-lg max-h-[600px] overflow-y-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-surface sticky top-0 z-10 shadow-sm">
                                    <tr className="border-b border-border text-textSub text-xs uppercase tracking-wider">
                                        <th className="px-4 py-3 font-medium">升级阶段</th>
                                        <th className="px-4 py-3 font-medium">本次升级要求</th>
                                        <th className="px-4 py-3 font-medium">{group.name}单次消耗</th>
                                        <th className="px-4 py-3 font-medium text-cta">升至目标等级总计</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30 bg-background/30">
                                    {steps.map((step) => (
                                                <tr key={`${step.fromLevel}-${step.toLevel}`} className="hover:bg-white/5 transition-colors group/row">
                                                    <td className="px-4 py-2.5 font-mono text-textMain font-medium">Lv.{step.fromLevel} → Lv.{step.toLevel}</td>
                                                    <td className="px-4 py-2.5 text-textSub">
                                                        {step.source.roleLevel > 0 ? `角色 Lv.${step.source.roleLevel}` : '-'}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-orange-400 group-hover/row:font-bold transition-all">
                                                                ×{step.costs[0].count}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-cta font-semibold">
                                                                ×{step.cumulativeCosts[0].count}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                    ))}
                                    {steps.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-4 text-center text-textSub">暂无数据记录</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>;
                })}
            </div>
        </div>
    );
}
