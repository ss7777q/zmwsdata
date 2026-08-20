import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import CostBadge from '../ui/CostBadge';
import { buildUpgradeSteps, withCumulativeUpgradeCosts } from '../../lib/upgrade-cost';
import { METRIC_COLORS, METRIC_LABELS } from '../../lib/boss-stats';

interface Props {
    dataSources: Record<string, any>;
}

export default function PetSkill({ dataSources }: Props) {
    const skillData = (dataSources['pet_skill'] as any)?.data || { levels: [] };
    const potentialData = (dataSources['pet_potential'] as any)?.data || { sharedCostByLevel: [], potentials: [], maxLevelBonus: null };
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
    const potentials = Array.isArray(potentialData.potentials) ? potentialData.potentials : [];
    const [selectedPotentialId, setSelectedPotentialId] = useState<number | null>(null);
    const selectedPotential = potentials.find((potential: any) => potential.potentialId === selectedPotentialId) || potentials[0] || null;
    const potentialLevelMap = useMemo(
        () => new Map((selectedPotential?.levels || []).map((level: any) => [Number(level.level), level])),
        [selectedPotential]
    );
    const firstPotentialLevel = selectedPotential?.levels?.[0] || null;
    const lastPotentialLevel = selectedPotential?.levels?.at(-1) || null;

    const formatAttributes = (attributes: any[] = []) => (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
            {attributes.map((attribute: any) => (
                <span
                    key={attribute.key}
                    className={clsx('font-mono font-semibold whitespace-nowrap', METRIC_COLORS[attribute.key] || 'text-textMain')}
                >
                    {attribute.label || METRIC_LABELS[attribute.key] || attribute.key} +{Number(attribute.value).toLocaleString()}
                </span>
            ))}
        </div>
    );

    return (
        <div className="grid grid-cols-1 gap-6 w-full fade-in zoom-in-95 duration-500">
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
                <div className="p-4 border-b border-border bg-textMain/5 shrink-0 space-y-3">
                    <div className="flex flex-wrap justify-between items-center gap-3">
                        <div>
                            <h3 className="font-bold text-lg text-orange-500">宠物潜能升级</h3>
                            <div className="mt-0.5 text-xs text-textSub">所有潜能残页消耗相同</div>
                        </div>
                        {selectedPotential && (
                            <label className="flex items-center gap-2 text-xs text-textSub">
                                <span>查看潜能</span>
                                <select
                                    value={selectedPotential.potentialId}
                                    onChange={(event) => setSelectedPotentialId(Number(event.target.value))}
                                    className="min-w-[160px] rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-textMain outline-none transition-colors focus:border-orange-500/60"
                                >
                                    <optgroup label="基础潜能">
                                        {potentials.filter((potential: any) => potential.type === 1).map((potential: any) => (
                                            <option key={potential.potentialId} value={potential.potentialId}>{potential.name}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="专属潜能">
                                        {potentials.filter((potential: any) => potential.type !== 1).map((potential: any) => (
                                            <option key={potential.potentialId} value={potential.potentialId}>{potential.name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                            </label>
                        )}
                    </div>
                    {selectedPotential && (
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 pt-3 text-xs">
                            <span className="rounded bg-orange-500/10 px-2 py-1 font-medium text-orange-600 dark:text-orange-400">
                                {selectedPotential.typeLabel}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-textSub">Lv.{firstPotentialLevel?.level} 初始</span>
                                {formatAttributes(firstPotentialLevel?.attributes)}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-textSub">Lv.{lastPotentialLevel?.level} 最高</span>
                                {formatAttributes(lastPotentialLevel?.attributes)}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar p-0">
                    <table className="w-full min-w-[760px] text-left text-sm whitespace-nowrap">
                        <thead className="sticky top-0 bg-surface z-10 shadow-sm border-b border-border">
                            <tr className="bg-textMain/5 text-textSub text-xs uppercase tracking-wider">
                                <th className="px-4 py-3 font-medium">升级阶段</th>
                                <th className="px-4 py-3 font-medium">宠物等级要求</th>
                                <th className="px-4 py-3 font-medium">目标等级属性</th>
                                <th className="px-4 py-3 font-medium">单项单级开支</th>
                                <th className="px-4 py-3 font-medium text-cta">升至目标等级总计</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {potentialSteps.map((step) => {
                                    const costNode = step.costs[0];
                                    const cumulativeCost = step.cumulativeCosts[0];
                                    const targetLevel = potentialLevelMap.get(step.toLevel) as any;
                                    return (
                                        <tr key={`${step.fromLevel}-${step.toLevel}`} className="hover:bg-textMain/5 transition-colors">
                                            <td className="px-4 py-3 font-mono text-textMain">Lv.{step.fromLevel} → Lv.{step.toLevel}</td>
                                            <td className="px-4 py-3 font-mono text-textSub">
                                                {targetLevel?.levelLimit != null ? `Lv.${targetLevel.levelLimit}` : '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {targetLevel ? formatAttributes(targetLevel.attributes) : <span className="text-textSub">-</span>}
                                            </td>
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
