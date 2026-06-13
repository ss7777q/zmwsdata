import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';

const QUALITY_NAMES: Record<number, string> = {
    2: '优秀',
    3: '精良',
    4: '史诗',
    5: '传说',
    6: '上古'
};

const QUALITY_COLORS: Record<number, string> = {
    2: 'text-green-500 border-green-500/20 group-hover:border-green-500/40 hover:shadow-[0_8px_30px_rgba(34,197,94,0.04)]',
    3: 'text-blue-500 border-blue-500/20 group-hover:border-blue-500/40 hover:shadow-[0_8px_30px_rgba(59,130,246,0.04)]',
    4: 'text-purple-500 border-purple-500/20 group-hover:border-purple-500/40 hover:shadow-[0_8px_30px_rgba(168,85,247,0.04)]',
    5: 'text-yellow-600 dark:text-yellow-500 border-yellow-500/20 group-hover:border-yellow-500/40 hover:shadow-[0_8px_30px_rgba(234,179,8,0.04)]',
    6: 'text-red-500 border-red-500/20 group-hover:border-red-500/40 hover:shadow-[0_8px_30px_rgba(239,68,68,0.04)]'
};

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleMatrix({ dataSources }: Props) {
    const fqData = dataSources['role_matrix_fq']?.data || [];
    const zhData = dataSources['role_matrix_zh']?.data || [];
    const skillData = dataSources['role_matrix_skill']?.data || [];

    const [expandedSkillCards, setExpandedSkillCards] = useState<Record<string, boolean>>({});
    const [expandedFqCards, setExpandedFqCards] = useState<Record<string, boolean>>({});
    const [expandedZhCards, setExpandedZhCards] = useState<Record<string, boolean>>({});

    const toggleSkillExpand = (cardId: string) => {
        setExpandedSkillCards(prev => ({
            ...prev,
            [cardId]: !prev[cardId]
        }));
    };

    const toggleFqExpand = (cardId: string) => {
        setExpandedFqCards(prev => ({
            ...prev,
            [cardId]: !prev[cardId]
        }));
    };

    const toggleZhExpand = (cardId: string) => {
        setExpandedZhCards(prev => ({
            ...prev,
            [cardId]: !prev[cardId]
        }));
    };

    const cards = useMemo(() => {
        const allFqRecords = fqData.flatMap((qObj: any) => (qObj.records || []).map((r: any) => ({ ...r, quality: qObj.quality })));
        const allZhRecords = zhData.flatMap((qObj: any) => (qObj.records || []).map((r: any) => ({ ...r, quality: qObj.quality })));

        return skillData.map((skillItem: any) => {
            const matrixId = skillItem.matrixSkill;
            const quality = skillItem.quality;
            const uid = `${matrixId}-${quality}`;
            const name = `${skillItem.desName} · ${QUALITY_NAMES[quality] || `品质${quality}`}`;

            const myFq = allFqRecords.filter((r: any) => r.matrix === matrixId && r.quality === quality);
            const myZh = allZhRecords.filter((r: any) => r.matrix === matrixId && r.quality === quality);

            // 1. 计算阵图技能消耗 (含明细)
            const skillCostMap = new Map<number, { name: string, count: number }>();
            const skillDetails: any[] = [];
            skillItem.levels?.forEach((lvl: any) => {
                if (Array.isArray(lvl.nextCost)) {
                    const rowCosts: any[] = [];
                    lvl.nextCost.forEach((c: any) => {
                        if (c.itemId === 1 || !c.itemId) return;
                        const exist = skillCostMap.get(c.itemId) || { name: c.name, count: 0 };
                        exist.count += c.count;
                        skillCostMap.set(c.itemId, exist);
                        rowCosts.push(c);
                    });
                    if (rowCosts.length > 0) {
                        skillDetails.push({ level: lvl.level, costs: rowCosts });
                    }
                }
            });

            // 2. 辅助函数：计算装备部件(法器/镇魂)各类消耗单次组合汇总
            const sumPartsCost = (parts: any[]) => {
                const upMap = new Map();
                const clearMap = new Map();
                const luckMap = new Map();

                const details: any[] = [];

                parts.forEach(part => {
                    const limit = part.levelLimit || 0;
                    const partUpCosts: any[] = [];
                    const partLuckCosts: any[] = [];

                    if (Array.isArray(part.upLevelCost)) {
                        part.upLevelCost.forEach((c: any) => {
                            if (c.itemId === 1 || !c.itemId) return;
                            const exist = upMap.get(c.itemId) || { name: c.name, count: 0 };
                            exist.count += c.count * limit; // 获取拉满的材料总量
                            upMap.set(c.itemId, exist);

                            partUpCosts.push({ ...c, count: c.count * limit });
                        });
                    }
                    if (Array.isArray(part.clearCost)) {
                        part.clearCost.forEach((c: any) => {
                            if (c.itemId === 1 || !c.itemId) return;
                            const exist = clearMap.get(c.itemId) || { name: c.name, count: 0 };
                            exist.count += c.count;
                            clearMap.set(c.itemId, exist);
                        });
                    }
                    if (part.luckClear) {
                        Object.entries(part.luckClear).forEach(([key, c]: [string, any]) => {
                            if (c.itemId === 1 || !c.itemId) return;
                            const luckType = key === '0' ? '全部' : '单条';
                            const mapKey = `${c.itemId}_${luckType}`;

                            const exist = luckMap.get(mapKey) || { itemId: c.itemId, name: `${c.name}(${luckType})`, count: 0 };
                            exist.count += c.count;
                            luckMap.set(mapKey, exist);

                            partLuckCosts.push({ ...c, luckLabel: luckType });
                        });
                    }

                    details.push({
                        name: part.name, // 例如 "天"
                        upCosts: partUpCosts,
                        luckCosts: partLuckCosts
                    });
                });

                return {
                    upCosts: Array.from(upMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
                    clearCosts: Array.from(clearMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
                    luckCosts: Array.from(luckMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
                    details
                };
            };

            const fqCosts = sumPartsCost(myFq);
            const zhCosts = sumPartsCost(myZh);

            return {
                id: uid,
                name,
                quality,
                skillCosts: Array.from(skillCostMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
                skillDetails,
                fqCosts,
                zhCosts
            };
        });
    }, [fqData, zhData, skillData]);

    if (!skillData.length) {
        return <div className="text-textSub p-8 text-center bg-card rounded-xl animate-pulse">正在拉取阵法配置流...</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {cards.map((card: any) => {
                    const borderClass = QUALITY_COLORS[card.quality] || QUALITY_COLORS[2];

                    return (
                        <div
                            key={card.id}
                            className={clsx(
                                "group relative bg-card rounded-2xl border transition-all duration-200 overflow-hidden",
                                borderClass
                            )}
                        >
                            <div className="relative p-6 space-y-5">
                                {/* 标题区 */}
                                <h3 className="text-base font-bold transition-colors flex items-center gap-2 text-textMain">
                                    {card.name}
                                </h3>

                                <hr className="border-border/40" />

                                <div className="space-y-4">
                                    {/* 阵法技能部位 */}
                                    {card.skillCosts.length > 0 && (
                                        <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 space-y-3 border-l-2 border-l-purple-500/50">
                                            <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSkillExpand(card.id)}>
                                                <div className="text-[10px] font-bold text-textMain/80 uppercase tracking-wider">
                                                    阵图满级消耗
                                                </div>
                                                <button className="text-textSub hover:text-purple-500 transition-colors p-0.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-white/5">
                                                    {expandedSkillCards[card.id] ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {card.skillCosts.map((c: any, i: number) => (
                                                    <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                ))}
                                            </div>

                                            {/* 技能展开面板 */}
                                            <div className={clsx(
                                                "grid gap-2 overflow-hidden transition-all duration-300",
                                                expandedSkillCards[card.id] ? "max-h-[500px] overflow-y-auto custom-scrollbar mt-3 pt-3 border-t border-border/30 opacity-100" : "max-h-0 opacity-0"
                                            )}>
                                                {card.skillDetails.map((detail: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-1.5 bg-slate-500/[0.04] dark:bg-black/20 rounded-lg p-2.5 border border-border/10">
                                                        <span className="text-[10px] text-textSub font-mono tracking-wider">
                                                            技能 Lv.{detail.level} ➜ Lv.{detail.level + 1} 消耗:
                                                        </span>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {detail.costs.map((c: any, j: number) => (
                                                                <CostBadge key={j} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 法器消耗部位 */}
                                    {(card.fqCosts.upCosts.length > 0 || card.fqCosts.clearCosts.length > 0) && (
                                        <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 space-y-3 border-l-2 border-l-cyan-500/50">
                                            <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleFqExpand(card.id)}>
                                                <div className="text-[10px] font-bold text-textMain/80 uppercase tracking-wider">
                                                    本阵全法器汇总 (含天地人剑)
                                                </div>
                                                <button className="text-textSub hover:text-cyan-500 transition-colors p-0.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-white/5">
                                                    {expandedFqCards[card.id] ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
                                                </button>
                                            </div>
                                            <div className="space-y-2.5 pt-1">
                                                {card.fqCosts.upCosts.length > 0 && (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                                        <span className="text-textSub">等级拉满:</span>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {card.fqCosts.upCosts.map((c: any, i: number) => (
                                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {card.fqCosts.luckCosts.length > 0 && (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border/20 pt-2 text-xs">
                                                        <span className="text-textSub">强运累计:</span>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {card.fqCosts.luckCosts.map((c: any, i: number) => (
                                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 法器详情折叠面板 */}
                                            <div className={clsx(
                                                "grid gap-2 overflow-hidden transition-all duration-300",
                                                expandedFqCards[card.id] ? "max-h-[800px] overflow-y-auto custom-scrollbar mt-3 pt-3 border-t border-border/30 opacity-100" : "max-h-0 opacity-0"
                                            )}>
                                                {card.fqCosts.details.map((detail: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-2 bg-slate-500/[0.04] dark:bg-black/20 rounded-lg p-2.5 border border-border/10">
                                                        <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 font-mono flex items-center gap-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-600 dark:bg-cyan-400" />
                                                            {card.name.split('·')[0]} · {detail.name}
                                                        </span>

                                                        <div className="pl-3 space-y-1.5 border-l border-border/20">
                                                            {detail.upCosts.length > 0 && (
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    <span className="text-[9px] text-textSub w-12 shrink-0">满级:</span>
                                                                    {detail.upCosts.map((c: any, j: number) => (
                                                                        <CostBadge key={j} itemId={c.itemId} name={c.name} count={c.count} />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {detail.luckCosts.length > 0 && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[9px] text-textSub w-12 shrink-0">洗练消耗:</span>
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        {detail.luckCosts.map((c: any, j: number) => (
                                                                            <CostBadge key={j} itemId={c.itemId} name={`${c.name}(${c.luckLabel})`} count={c.count} />
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 镇魂消耗部位 */}
                                    {(card.zhCosts.upCosts.length > 0 || card.zhCosts.clearCosts.length > 0) && (
                                        <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 space-y-3 border-l-2 border-l-indigo-500/50">
                                            <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleZhExpand(card.id)}>
                                                <div className="text-[10px] font-bold text-textMain/80 uppercase tracking-wider">
                                                    本阵全镇魂汇总 (含主生觉)
                                                </div>
                                                <button className="text-textSub hover:text-indigo-500 transition-colors p-0.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-white/5">
                                                    {expandedZhCards[card.id] ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
                                                </button>
                                            </div>
                                            <div className="space-y-2.5 pt-1">
                                                {card.zhCosts.upCosts.length > 0 && (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                                        <span className="text-textSub">等级拉满:</span>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {card.zhCosts.upCosts.map((c: any, i: number) => (
                                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {card.zhCosts.luckCosts.length > 0 && (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border/20 pt-2 text-xs">
                                                        <span className="text-textSub">强运累计:</span>
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {card.zhCosts.luckCosts.map((c: any, i: number) => (
                                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 镇魂详情折叠面板 */}
                                            <div className={clsx(
                                                "grid gap-2 overflow-hidden transition-all duration-300",
                                                expandedZhCards[card.id] ? "max-h-[800px] overflow-y-auto custom-scrollbar mt-3 pt-3 border-t border-border/30 opacity-100" : "max-h-0 opacity-0"
                                            )}>
                                                {card.zhCosts.details.map((detail: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-2 bg-slate-500/[0.04] dark:bg-black/20 rounded-lg p-2.5 border border-border/10">
                                                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 font-mono flex items-center gap-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
                                                            {card.name.split('·')[0]} · {detail.name}
                                                        </span>

                                                        <div className="pl-3 space-y-1.5 border-l border-border/20">
                                                            {detail.upCosts.length > 0 && (
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    <span className="text-[9px] text-textSub w-12 shrink-0">满级:</span>
                                                                    {detail.upCosts.map((c: any, j: number) => (
                                                                        <CostBadge key={j} itemId={c.itemId} name={c.name} count={c.count} />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {detail.luckCosts.length > 0 && (
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    <span className="text-[9px] text-textSub w-12 shrink-0">单次强运:</span>
                                                                    {detail.luckCosts.map((c: any, j: number) => (
                                                                        <CostBadge key={j} itemId={c.itemId} name={c.name} count={c.count} />
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
