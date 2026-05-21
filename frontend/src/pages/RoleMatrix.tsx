import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { Sparkles, Hexagon, Crosshair, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';

const QUALITY_NAMES: Record<number, string> = {
    2: '优秀',
    3: '精良',
    4: '史诗',
    5: '传说',
    6: '上古'
};

const QUALITY_COLORS: Record<number, string> = {
    2: 'text-green-500 border-green-500/30 group-hover:border-green-500/60',
    3: 'text-blue-500 border-blue-500/30 group-hover:border-blue-500/60',
    4: 'text-purple-500 border-purple-500/30 group-hover:border-purple-500/60',
    5: 'text-yellow-500 border-yellow-500/30 group-hover:border-yellow-500/60',
    6: 'text-red-500 border-red-500/30 group-hover:border-red-500/60'
};

const QUALITY_BG: Record<number, string> = {
    2: 'from-green-500/5',
    3: 'from-blue-500/5',
    4: 'from-purple-500/5',
    5: 'from-yellow-500/5',
    6: 'from-red-500/5'
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
                    const colorClass = QUALITY_COLORS[card.quality] || QUALITY_COLORS[2];
                    const bgClass = QUALITY_BG[card.quality] || QUALITY_BG[2];

                    return (
                        <div
                            key={card.id}
                            className={clsx(
                                "group relative bg-card rounded-2xl border transition-all duration-300 overflow-hidden",
                                colorClass
                            )}
                        >
                            <div className={clsx("absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none", bgClass)}></div>
                            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500 pointer-events-none">
                                <Hexagon className="w-32 h-32" />
                            </div>

                            <div className="relative p-6 space-y-6">
                                {/* 标题区 */}
                                <h3 className="text-lg sm:text-xl font-bold transition-colors flex items-center gap-2 drop-shadow-md">
                                    <Hexagon className="w-5 h-5 flex-shrink-0" />
                                    {card.name}
                                </h3>

                                <hr className="border-border/60" />

                                <div className="space-y-4">
                                    {/* 阵法技能部位 */}
                                    {card.skillCosts.length > 0 && (
                                        <div className="bg-surface p-3 rounded-lg border border-border/40 space-y-3">
                                            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSkillExpand(card.id)}>
                                                <div className="text-xs font-bold text-orange-700 dark:text-orange-400 flex items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                                    <Sparkles className="w-3.5 h-3.5" /> 阵图满级消耗
                                                </div>
                                                <button className="text-textSub hover:text-orange-700 dark:hover:text-orange-400 transition-colors p-1 rounded-full hover:bg-black/20">
                                                    {expandedSkillCards[card.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                {card.skillCosts.map((c: any, i: number) => (
                                                    <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                ))}
                                            </div>

                                            {/* 技能展开面板 */}
                                            <div className={clsx(
                                                "grid gap-2 overflow-hidden transition-all duration-300",
                                                expandedSkillCards[card.id] ? "max-h-[500px] overflow-y-auto custom-scrollbar mt-2 pt-3 border-t border-border/50 opacity-100" : "max-h-0 opacity-0"
                                            )}>
                                                {card.skillDetails.map((detail: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-1.5 bg-black/10 rounded-md p-2">
                                                        <span className="text-[10px] text-textSub font-mono tracking-wider ml-1">
                                                            技能 Lv.{detail.level} ➜ Lv.{detail.level + 1} 消耗:
                                                        </span>
                                                        <div className="flex flex-wrap items-center gap-2">
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
                                        <div className="bg-surface p-3 rounded-lg border border-border/40 space-y-3">
                                            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleFqExpand(card.id)}>
                                                <div className="text-xs font-bold text-cyan-700 dark:text-cyan-400 flex items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                                    <Crosshair className="w-3.5 h-3.5" /> 本阵全法器汇总 (含天地人剑)
                                                </div>
                                                <button className="text-textSub hover:text-cyan-700 dark:hover:text-cyan-400 transition-colors p-1 rounded-full hover:bg-black/20">
                                                    {expandedFqCards[card.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {card.fqCosts.upCosts.length > 0 && (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <span className="text-xs text-textSub">等级拉满:</span>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {card.fqCosts.upCosts.map((c: any, i: number) => (
                                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {card.fqCosts.luckCosts.length > 0 && (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border/20 pt-2">
                                                        <span className="text-xs text-textSub">强运累计:</span>
                                                        <div className="flex flex-wrap items-center gap-2">
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
                                                expandedFqCards[card.id] ? "max-h-[800px] overflow-y-auto custom-scrollbar mt-2 pt-3 border-t border-border/50 opacity-100" : "max-h-0 opacity-0"
                                            )}>
                                                {card.fqCosts.details.map((detail: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-2 bg-black/10 rounded-md p-2 border border-white/5">
                                                        <span className="text-xs font-bold text-cyan-800 dark:text-cyan-300 font-mono flex items-center gap-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-600 dark:bg-cyan-400" />
                                                            {card.name.split('·')[0]} · {detail.name}
                                                        </span>

                                                        <div className="pl-3 space-y-1.5 border-l border-white/10">
                                                            {detail.upCosts.length > 0 && (
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="text-[10px] text-textSub w-12 shrink-0">满级:</span>
                                                                    {detail.upCosts.map((c: any, j: number) => (
                                                                        <CostBadge key={j} itemId={c.itemId} name={c.name} count={c.count} />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {detail.luckCosts.length > 0 && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] text-textSub w-12 shrink-0">洗练消耗:</span>
                                                                    <div className="flex flex-wrap items-center gap-2">
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
                                        <div className="bg-surface p-3 rounded-lg border border-border/40 space-y-3">
                                            <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleZhExpand(card.id)}>
                                                <div className="text-xs font-bold text-purple-700 dark:text-purple-400 flex items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                                    <Hexagon className="w-3.5 h-3.5" /> 本阵全镇魂汇总 (含主生觉)
                                                </div>
                                                <button className="text-textSub hover:text-purple-700 dark:hover:text-purple-400 transition-colors p-1 rounded-full hover:bg-black/20">
                                                    {expandedZhCards[card.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {card.zhCosts.upCosts.length > 0 && (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <span className="text-xs text-textSub">等级拉满:</span>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {card.zhCosts.upCosts.map((c: any, i: number) => (
                                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {card.zhCosts.luckCosts.length > 0 && (
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border/20 pt-2">
                                                        <span className="text-xs text-textSub">强运累计:</span>
                                                        <div className="flex flex-wrap items-center gap-2">
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
                                                expandedZhCards[card.id] ? "max-h-[800px] overflow-y-auto custom-scrollbar mt-2 pt-3 border-t border-border/50 opacity-100" : "max-h-0 opacity-0"
                                            )}>
                                                {card.zhCosts.details.map((detail: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-2 bg-black/10 rounded-md p-2 border border-white/5">
                                                        <span className="text-xs font-bold text-purple-800 dark:text-purple-300 font-mono flex items-center gap-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400" />
                                                            {card.name.split('·')[0]} · {detail.name}
                                                        </span>

                                                        <div className="pl-3 space-y-1.5 border-l border-white/10">
                                                            {detail.upCosts.length > 0 && (
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="text-[10px] text-textSub w-12 shrink-0">满级:</span>
                                                                    {detail.upCosts.map((c: any, j: number) => (
                                                                        <CostBadge key={j} itemId={c.itemId} name={c.name} count={c.count} />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {detail.luckCosts.length > 0 && (
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="text-[10px] text-textSub w-12 shrink-0">单次强运:</span>
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
