import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
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

interface MatrixEffectTable {
    title: string;
    columns: string[];
    rows: {
        label?: string;
        level?: number;
        values: string[];
    }[];
    emptyText: string;
}





function EffectGrowthTable({ table }: { table: MatrixEffectTable | null }) {
    if (!table) return null;
    const hasRows = table.columns.length > 0 && table.rows.length > 0;

    return (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border/60 bg-slate-500/[0.02] dark:bg-white/[0.01] px-5 py-3.5">
                <div className="text-xs font-bold tracking-wider text-textMain uppercase">
                    {table.title}
                </div>
            </div>
            {hasRows ? (
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full min-w-[520px] text-center text-xs">
                        <thead>
                            <tr className="border-b border-border/40 bg-slate-500/[0.04] dark:bg-white/[0.02] text-textSub">
                                <th className="sticky left-0 z-10 bg-card px-4 py-2.5 font-semibold text-[10px] tracking-wider">Lv.</th>
                                {table.columns.map((column) => (
                                    <th key={column} className="border-l border-border/20 px-4 py-2.5 font-semibold text-[10px] tracking-wider">
                                        {column}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {table.rows.map((row) => (
                                <tr key={row.label || row.level} className="hover:bg-purple-500/[0.02] transition-colors duration-150">
                                    <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-mono font-bold text-textMain text-xs">
                                        {row.label || `Lv.${row.level}`}
                                    </td>
                                    {row.values.map((value, index) => (
                                        <td key={index} className="min-w-[120px] border-l border-border/20 px-4 py-2.5 align-top font-mono leading-5 text-textSub text-[11px]">
                                            {value}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="px-5 py-6 text-xs leading-6 text-textSub/75">
                    {table.emptyText}
                </div>
            )}
        </div>
    );
}

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleMatrix({ dataSources }: Props) {
    const fqData = dataSources['role_matrix_fq']?.data || [];
    const zhData = dataSources['role_matrix_zh']?.data || [];
    const skillData = dataSources['role_matrix_skill']?.data || [];

    const [activeTab, setActiveTab] = useState<'cost' | 'effect'>('cost');
    const [selectedMatrixId, setSelectedMatrixId] = useState<number | null>(null);

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
                matrixSkill: matrixId,
                name,
                quality,
                skillCosts: Array.from(skillCostMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
                skillDetails,
                fqCosts,
                zhCosts,
                effect: skillItem.effect || null
            };
        });
    }, [fqData, zhData, skillData]);

    const activeMatrix = useMemo(() => {
        if (!cards.length) return null;
        return cards.find((c: any) => c.matrixSkill === selectedMatrixId) || cards[0] || null;
    }, [cards, selectedMatrixId]);

    const activeEffect = useMemo(() => {
        if (!activeMatrix) return null;
        return activeMatrix.effect || null;
    }, [activeMatrix]);

    if (!skillData.length) {
        return <div className="text-textSub p-8 text-center bg-card rounded-xl animate-pulse">正在拉取阵法配置流...</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in fade-in">
            {/* 顶部分类选项卡 */}
            <div className="flex bg-slate-200/40 dark:bg-black/20 p-1 rounded-xl border border-slate-300/60 dark:border-border/60 w-max mb-6 gap-1 shadow-sm backdrop-blur-sm">
                <button
                    onClick={() => setActiveTab('cost')}
                    className={clsx(
                        "px-6 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                        activeTab === 'cost'
                            ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                            : "text-slate-500 dark:text-textSub hover:text-slate-800 dark:hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                    )}
                >
                    升级消耗
                </button>
                <button
                    onClick={() => setActiveTab('effect')}
                    className={clsx(
                        "px-6 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                        activeTab === 'effect'
                            ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                            : "text-slate-500 dark:text-textSub hover:text-slate-800 dark:hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                    )}
                >
                    阵法效果
                </button>
            </div>

            {activeTab === 'cost' ? (
                /* 升级消耗内容 */
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
            ) : (
                /* 阵法效果主从面板视图 */
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-stretch animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* 左侧阵法列表 */}
                    <div className="flex min-h-0 flex-col rounded-xl border border-border/80 bg-card shadow-sm xl:h-0 xl:min-h-[640px] overflow-hidden">
                        <div className="border-b border-border/60 bg-slate-500/[0.02] dark:bg-white/[0.01] px-4 py-3.5">
                            <div className="text-xs font-bold tracking-wider text-textMain uppercase">
                                阵法列表
                            </div>
                        </div>
                        <div className="max-h-[500px] overflow-auto p-3.5 custom-scrollbar xl:max-h-none xl:flex-1 xl:min-h-0 space-y-2">
                            {cards.map((item: any) => {
                                const isSelected = item.matrixSkill === activeMatrix?.matrixSkill;
                                const effect = item.effect;

                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setSelectedMatrixId(item.matrixSkill)}
                                        className={clsx(
                                            'w-full rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.99]',
                                            isSelected
                                                ? 'border-purple-500/40 bg-purple-500/10 dark:bg-purple-950/20 shadow-sm shadow-purple-500/5'
                                                : 'border-transparent bg-slate-500/[0.02] dark:bg-white/[0.01] hover:border-slate-300/50 dark:hover:border-slate-800/80 hover:bg-slate-500/[0.04]'
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className={clsx("truncate text-sm font-bold transition-colors", isSelected ? "text-purple-600 dark:text-purple-400" : "text-textMain")}>
                                                    {item.name.split(' · ')[0]}
                                                </div>
                                                <div className="mt-1.5 text-xs leading-5 text-textSub truncate">
                                                    {effect?.summary || '当前没有阵法效果说明'}
                                                </div>
                                            </div>
                                            <ChevronRight className={clsx('mt-0.5 h-4 w-4 shrink-0 transition-colors', isSelected ? 'text-purple-500' : 'text-textSub/50')} />
                                        </div>
                                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                                            {effect ? (
                                                effect.tags.slice(0, 3).map((tag: string) => (
                                                    <span key={tag} className="rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 px-2 py-0.5 text-[10px] text-textSub font-medium">
                                                        {tag}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 px-2 py-0.5 text-[10px] text-textSub font-medium opacity-60">
                                                    解析中
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 右侧详情面板 */}
                    {activeMatrix && (
                        <div className="space-y-5 min-w-0 flex-1">
                            {activeEffect ? (
                                <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
                                    {/* 头部信息 */}
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <h3 className="text-xl font-bold text-textMain">{activeEffect.name}</h3>
                                            {activeEffect.cooldown?.display && (
                                                <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 font-mono tracking-wide">
                                                    {activeEffect.cooldown.display}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-2 text-xs leading-6 text-textSub/90">{activeEffect.summary}</p>
                                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                                            {activeEffect.tags.map((tag: string) => (
                                                <span key={tag} className="rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 px-2 py-0.5 text-[10px] text-textSub font-medium">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                                        {activeEffect.sections.map((section: any) => (
                                            <div key={section.title} className="rounded-xl border border-border/60 bg-slate-500/[0.01] dark:bg-white/[0.01] p-4.5 space-y-3.5">
                                                <div className="text-xs font-bold text-textMain border-b border-border/40 pb-2.5 uppercase tracking-wider">
                                                    {section.title}
                                                </div>
                                                <div className="space-y-3 text-xs leading-relaxed text-textSub/90">
                                                    {section.paragraphs.map((p: string, idx: number) => (
                                                        <p key={idx}>{p}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {activeEffect.warnings && activeEffect.warnings.length > 0 && (
                                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-xs leading-6 text-amber-700 dark:text-amber-300">
                                            {activeEffect.warnings.map((warning: string, idx: number) => (
                                                <p key={idx}>{warning}</p>
                                            ))}
                                        </div>
                                    )}

                                    {activeEffect.growthTables.length > 0 && (
                                        <div className="grid grid-cols-1 gap-5">
                                            {activeEffect.growthTables.map((table: any) => (
                                                <EffectGrowthTable key={table.title} table={table} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* 其他阵法占位 - 优雅虚线边框看板 */
                                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-slate-500/[0.01] dark:bg-white/[0.01] py-20 min-h-[560px] animate-in fade-in duration-300">
                                    <div className="relative flex items-center justify-center w-12 h-12 mb-5">
                                        <span className="absolute inline-flex h-full w-full rounded-full bg-purple-500/10 animate-ping opacity-60"></span>
                                        <div className="relative inline-flex rounded-full h-8 w-8 bg-purple-500/15 border border-purple-500/30 items-center justify-center">
                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                                        </div>
                                    </div>
                                    <h3 className="text-sm font-bold text-textMain">“{activeMatrix.name.split(' · ')[0]}”效果解析中</h3>
                                    <p className="text-xs text-textSub mt-2.5 max-w-xs text-center leading-relaxed opacity-75">
                                        当前还没有该阵法的主动技能与附加机制说明。
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
