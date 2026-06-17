import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';

interface RoleEquipProps {
    dataSources: Record<string, any>;
}

import RoleEquipUpgrade from './RoleEquipUpgrade';
// import RoleEquipSmelt from './RoleEquipSmelt';
// import RoleEquipStone from './RoleEquipStone';

export default function RoleEquip({ dataSources }: RoleEquipProps) {
    const makeData = dataSources['role_equip_make'];
    const [activeGroup, setActiveGroup] = useState<number | 'none' | null>(null);
    const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

    const toggleExpand = (cardIndex: number) => {
        setExpandedCards(prev => ({
            ...prev,
            [cardIndex]: !prev[cardIndex]
        }));
    };

    const formatAffixStage = (stage: any, index: number) => {
        if (stage.stageLabel) return stage.stageLabel;
        const fromWeight = typeof stage.fromWeight === 'number' ? stage.fromWeight : index;
        const toWeight = typeof stage.toWeight === 'number' ? stage.toWeight : fromWeight + 1;
        return `${fromWeight}重 → ${toWeight}重`;
    };

    // 简单的解析与展示
    const list = makeData?.data || [];

    // 按照套装 group 进行简单分组 (例如天煞套装 group=20)
    const groupedData = useMemo(() => {
        const map = new Map<number | 'none', any[]>();
        list.forEach((item: any) => {
            const g = item.group == null ? 'none' : item.group;
            if (!map.has(g)) map.set(g, []);
            map.get(g)!.push(item);
        });
        return map;
    }, [list]);

    // 初始化默认选中
    useMemo(() => {
        if (activeGroup === null && groupedData.size > 0) {
            const firstKey = Array.from(groupedData.keys())[0];
            setActiveGroup(firstKey);
        }
    }, [groupedData, activeGroup]);

    if (!makeData) return <div className="text-textSub p-8 text-center bg-card rounded-xl animate-pulse">正在加载装备数据...</div>;

    return (
        <div className="space-y-8">
            {/* 顶层图表与汇总区 */}
            <RoleEquipUpgrade dataSources={dataSources} />

            {/* 分组选择器 */}
            <div className="bg-card border border-border/60 p-4 rounded-xl shadow-sm">
                <div className="text-xs font-bold text-textMain mb-3.5 flex items-center gap-2 uppercase tracking-wider">
                    <span className="w-1 h-3.5 bg-purple-500 rounded-full"></span>
                    选择特定等级/套装后加载详情
                </div>
                <div className="flex flex-wrap gap-2">
                    {Array.from(groupedData.entries()).sort((a, b) => {
                        if (a[0] === 'none') return 1;
                        if (b[0] === 'none') return -1;
                        return (b[0] as number) - (a[0] as number); // 大数字（高等级/高阶）排在前面
                    }).map(([groupId, items]) => {
                        const selected = activeGroup === groupId;
                        return (
                            <button
                                key={groupId}
                                onClick={() => setActiveGroup(groupId)}
                                className={clsx(
                                    "px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                                    selected
                                        ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                                        : "text-textSub hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-border/50"
                                )}
                            >
                                {groupId === 'none' ? '神化/魔化及升重消耗' : `${groupId}级套装`}
                                <span className={clsx("ml-1.5 text-[9px] px-1.5 py-0.5 rounded transition-colors font-mono font-medium", selected ? "bg-purple-500/20 text-purple-600 dark:text-purple-300" : "bg-black/10 dark:bg-white/5")}>
                                    {items.length}件
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 选中的套装详情呈现 */}
            {activeGroup !== null && groupedData.has(activeGroup) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-base font-bold text-textMain border-b border-border/40 pb-2.5 flex items-center justify-between">
                        <span>
                            {activeGroup === 'none' ? '重铸需求 以戒指为例' : `${activeGroup} 级套装`}
                        </span>
                        <span className="text-[10px] text-textSub font-medium bg-slate-500/[0.04] dark:bg-black/20 px-2.5 py-0.5 rounded border border-border/40 font-mono">
                            共渲染 {groupedData.get(activeGroup)?.length} 个结构件
                        </span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {groupedData.get(activeGroup)?.map((item, idx) => {
                            const recastTotalMap = new Map<number, { name: string, count: number }>();
                            if (item.recastUpgrade) {
                                item.recastUpgrade.forEach((stage: any) => {
                                    stage.cost?.forEach((c: any) => {
                                        const exist = recastTotalMap.get(c.itemId) || { name: c.name, count: 0 };
                                        exist.count += c.count;
                                        recastTotalMap.set(c.itemId, exist);
                                    });
                                });
                            }
                            const recastTotalCosts = Array.from(recastTotalMap.entries()).map(([itemId, v]) => ({ itemId, ...v }));

                            return (
                                <div key={idx} className="card group hover:!border-purple-500/30 hover:shadow-[0_8px_30px_rgba(168,85,247,0.06)] transition-all duration-200">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="text-sm font-bold text-textMain mt-1.5 transition-colors group-hover:text-purple-600 dark:group-hover:text-purple-400">{item.name || `未名装备 ${item.itemId}`}</h4>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {/* cost */}
                                        {item.cost && item.cost.length > 0 && (
                                            <div className="space-y-2 bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 border-l-2 border-l-purple-500/50">
                                                <div className="text-[10px] text-textSub font-bold flex items-center gap-1.5 uppercase tracking-wide">
                                                    <span className="tracking-wide">打造/重铸需求</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {item.cost.map((c: any, i: number) => (
                                                        <CostBadge key={i} itemId={c.itemId} count={c.count} name={c.name} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* recastUpgrade (神化/魔化/进阶消耗) */}
                                        {item.recastUpgrade && item.recastUpgrade.length > 0 && (
                                            <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 space-y-3 mt-4 border-l-2 border-l-indigo-500/50">
                                                <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleExpand(idx)}>
                                                    <div className="text-[10px] font-bold text-textMain/80 flex flex-row items-center gap-1.5 opacity-90 uppercase tracking-wider">
                                                        升重总计 (共{item.recastUpgrade.length}段)
                                                    </div>
                                                    <button className="text-textSub hover:text-indigo-500 transition-colors p-0.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-white/5 cursor-pointer">
                                                        {expandedCards[idx] ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
                                                    </button>
                                                </div>

                                                {/* 总计消耗 */}
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {recastTotalCosts.map((c: any, i: number) => (
                                                        <CostBadge key={`total-${i}`} itemId={c.itemId} count={c.count} name={c.name} />
                                                    ))}
                                                </div>

                                                {/* 各重明细 */}
                                                <div className={clsx(
                                                    "grid gap-2.5 overflow-hidden transition-all duration-300",
                                                    expandedCards[idx] ? "max-h-[500px] mt-3 pt-3 border-t border-border/30 opacity-100 overflow-y-auto custom-scrollbar" : "max-h-0 opacity-0"
                                                )}>
                                                    {item.recastUpgrade.map((stage: any, stageIdx: number) => (
                                                        <div key={`stage-${stageIdx}`} className="flex flex-col gap-2 bg-slate-500/[0.04] dark:bg-black/20 rounded-lg p-2.5 border border-border/10">
                                                            <span className="text-[10px] text-textSub uppercase font-mono bg-black/5 dark:bg-white/5 w-max px-2 py-0.5 rounded">
                                                                {formatAffixStage(stage, stageIdx)} 消耗:
                                                            </span>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                {stage.cost.map((c: any, cIdx: number) => (
                                                                    <CostBadge key={`stage-${stageIdx}-cost-${cIdx}`} itemId={c.itemId} count={c.count} name={c.name} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
