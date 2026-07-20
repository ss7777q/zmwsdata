import CostBadge from '../ui/CostBadge';
import { buildUpgradeSteps, withCumulativeUpgradeCosts } from '../../lib/upgrade-cost';

interface Props {
    dataSources: Record<string, any>;
}

export default function PetSkill({ dataSources }: Props) {
    const skillData = (dataSources['pet_skill'] as any)?.data || { levels: [] };
    const potentialData = (dataSources['pet_potential'] as any)?.data || { sharedCostByLevel: [], maxLevelBonus: null };
    const skillLevels = Array.isArray(skillData.levels) ? skillData.levels : [];
    const skillMaxLevel = Math.max(1, ...skillLevels.map((level: any) => Number(level.level) || 0));
    const skillSteps = withCumulativeUpgradeCosts(buildUpgradeSteps({
        rows: skillLevels,
        getStoredLevel: (level: any) => level.level,
        getCosts: (level: any) => level.upgradeCost,
        // 普通宠技的 skillLevel.soulCost 属于目标等级；Lv.1 是学习成本，
        // Lv.2 才是玩家实际执行的 Lv.1 → Lv.2 升级消耗。
        storedLevelOffset: -1,
        maxLevel: skillMaxLevel,
    }));
    const potentialLevels = Array.isArray(potentialData.sharedCostByLevel) ? potentialData.sharedCostByLevel : [];
    const potentialMaxLevel = Math.max(1, ...potentialLevels.map((level: any) => Number(level.level) || 0));
    const potentialSteps = withCumulativeUpgradeCosts(buildUpgradeSteps({
        rows: potentialLevels,
        getStoredLevel: (level: any) => level.level,
        getCosts: (level: any) => level.upgradeCost,
        maxLevel: potentialMaxLevel,
    }));

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
                                <th className="px-4 py-3 font-medium">升级阶段</th>
                                <th className="px-4 py-3 font-medium">本次升级要求</th>
                                <th className="px-4 py-3 font-medium">单级升级消耗</th>
                                <th className="px-4 py-3 font-medium text-cta">升至目标等级总计</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {skillSteps.map((step) => (
                                        <tr key={`${step.fromLevel}-${step.toLevel}`} className="hover:bg-textMain/5 transition-colors">
                                            <td className="px-4 py-3 font-mono text-textMain">Lv.{step.fromLevel} → Lv.{step.toLevel}</td>
                                            <td className="px-4 py-3 font-mono text-textSub">
                                                {step.source.roleLevel > 0 ? `角色 Lv.${step.source.roleLevel}` : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {step.costs.map((c, i) => (
                                                        <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {step.cumulativeCosts.map((c) => (
                                                        <CostBadge key={`${c.itemId}-${c.name}`} itemId={c.itemId} name={c.name} count={c.count} />
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                            ))}
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
                                <th className="px-4 py-3 font-medium">升级阶段</th>
                                <th className="px-4 py-3 font-medium">单项单级开支</th>
                                <th className="px-4 py-3 font-medium text-cta">升至目标等级总计</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {potentialSteps.map((step) => {
                                    const costNode = step.costs[0];
                                    const cumulativeCost = step.cumulativeCosts[0];
                                    return (
                                        <tr key={`${step.fromLevel}-${step.toLevel}`} className="hover:bg-textMain/5 transition-colors">
                                            <td className="px-4 py-3 font-mono text-textMain">Lv.{step.fromLevel} → Lv.{step.toLevel}</td>
                                            <td className="px-4 py-3">
                                                {costNode ? <CostBadge itemId={costNode.itemId} name={costNode.name} count={costNode.count} /> : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {cumulativeCost ? <CostBadge itemId={cumulativeCost.itemId} name={cumulativeCost.name} count={cumulativeCost.count} /> : '-'}
                                            </td>
                                        </tr>
                                    );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
