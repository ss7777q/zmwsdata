import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
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

    const numToChinese = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const formatAffixLevel = (level: number | string) => {
        const str = String(level);
        const lastDigit = str.slice(-1);
        const num = parseInt(lastDigit, 10);
        if (!isNaN(num) && numToChinese[num]) {
            return `目标${numToChinese[num]}重`;
        }
        return `目标重铸重数: ${level}`;
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
            <div className="bg-surface/50 border border-border/50 p-4 rounded-xl">
                <div className="text-sm font-bold text-textMain mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                    选择特定等级/套装后加载详情
                </div>
                <div className="flex flex-wrap gap-2">
                    {Array.from(groupedData.entries()).sort((a, b) => {
                        if (a[0] === 'none') return 1;
                        if (b[0] === 'none') return -1;
                        return (b[0] as number) - (a[0] as number); // 大数字（高等级/高阶）排在前面
                    }).map(([groupId, items]) => (
                        <button
                            key={groupId}
                            onClick={() => setActiveGroup(groupId)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${activeGroup === groupId
                                ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                                : 'bg-background text-textSub hover:bg-white/5 border-border/50 hover:border-textSub/30'
                                }`}
                        >
                            {groupId === 'none' ? '神化/魔化及升重消耗' : `${groupId}级套装`}
                            <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded ${activeGroup === groupId ? 'bg-black/20 text-white/90' : 'bg-black/30'}`}>
                                {items.length}件
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 选中的套装详情呈现 */}
            {activeGroup !== null && groupedData.has(activeGroup) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-lg font-semibold text-textMain border-b border-border pb-2 flex items-center justify-between">
                        <span>
                            {activeGroup === 'none' ? '重铸需求  以戒指为例' : `${activeGroup} 级套装`}
                        </span>
                        <span className="text-sm text-textSub font-normal bg-surface px-3 py-1 rounded border border-border/30">
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
                                <div key={idx} className="card group hover:!border-cta/30">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="font-bold text-textMain mt-1.5">{item.name || `未名装备 ${item.itemId}`}</h4>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {/* cost */}
                                        {item.cost && item.cost.length > 0 && (
                                            <div className="space-y-2 bg-black/10 p-2.5 rounded border border-white/5">
                                                <div className="text-xs text-textSub font-semibold flex items-center gap-1">
                                                    <div className="w-1 h-1 rounded-full bg-orange-400"></div> 打造/重铸需求
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {item.cost.map((c: any, i: number) => (
                                                        <CostBadge key={i} itemId={c.itemId} count={c.count} name={c.name} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* recastUpgrade (神化/魔化/进阶消耗) */}
                                        {item.recastUpgrade && item.recastUpgrade.length > 0 && (
                                            <div className="bg-surface p-3 rounded-lg border border-border/40 space-y-3 mt-4">
                                                <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleExpand(idx)}>
                                                    <div className="text-xs font-bold text-cta flex flex-row items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                                        <Sparkles className="w-3.5 h-3.5" /> 升重总计 (共{item.recastUpgrade.length}重)
                                                    </div>
                                                    <button className="text-textSub hover:text-cta transition-colors p-1 rounded-full hover:bg-black/20">
                                                        {expandedCards[idx] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </button>
                                                </div>

                                                {/* 总计消耗 */}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {recastTotalCosts.map((c: any, i: number) => (
                                                        <CostBadge key={`total-${i}`} itemId={c.itemId} count={c.count} name={c.name} />
                                                    ))}
                                                </div>

                                                {/* 各重明细 */}
                                                <div className={clsx(
                                                    "grid gap-2 overflow-hidden transition-all duration-300",
                                                    expandedCards[idx] ? "max-h-[500px] mt-2 pt-3 border-t border-border/50 opacity-100 overflow-y-auto custom-scrollbar" : "max-h-0 opacity-0"
                                                )}>
                                                    {item.recastUpgrade.map((stage: any, stageIdx: number) => (
                                                        <div key={`stage-${stageIdx}`} className="flex flex-col gap-1.5 bg-black/5 dark:bg-black/20 p-2 rounded">
                                                            <span className="text-[10px] text-textSub uppercase font-mono bg-black/5 dark:bg-white/5 w-max px-1.5 py-0.5 rounded">
                                                                {formatAffixLevel(stage.toAffixLevel)} 消耗:
                                                            </span>
                                                            <div className="flex flex-wrap items-center gap-2">
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

            {/* 其他装备系统附属模块 (用户要求暂时隐藏)

            <RoleEquipSmelt dataSources={dataSources} />
            <RoleEquipStone dataSources={dataSources} />
            */}
        </div>
    );
}
