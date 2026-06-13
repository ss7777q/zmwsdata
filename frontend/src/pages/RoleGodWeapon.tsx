import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleGodWeapon({ dataSources }: Props) {
    const unlockData = dataSources['role_godweapon_unlock']?.data || [];
    const levData = dataSources['role_godweapon_lev']?.data || [];

    const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

    const toggleExpand = (cardId: number) => {
        setExpandedCards(prev => ({
            ...prev,
            [cardId]: !prev[cardId]
        }));
    };

    const cards = useMemo(() => {
        return unlockData.map((unlockItem: any) => {
            const weaponId = unlockItem.id;
            const weaponName = unlockItem.name;

            // 1. 获取激活消耗与进阶消耗
            let activationCosts: any[] = [];
            if (Array.isArray(unlockItem.activationValue)) {
                unlockItem.activationValue.forEach((c: any) => {
                    if (c.itemId && c.itemId !== 1 && typeof c.count === 'number') {
                        activationCosts.push(c);
                    }
                });
            }

            let rankCosts: any[] = [];
            if (Array.isArray(unlockItem.rankCost)) {
                unlockItem.rankCost.forEach((c: any) => {
                    if (c.itemId && c.itemId !== 1 && typeof c.count === 'number') {
                        rankCosts.push(c);
                    }
                });
            }

            // 2. 获取各个进阶的所有等级消耗
            const weaponPrefix = Math.floor(weaponId / 1000);
            const matchingLevItems = levData.filter((l: any) => Math.floor(l.typeId / 1000) === weaponPrefix);

            const levCostMap = new Map<number, { name: string, count: number }>();
            const levDetails: any[] = [];

            matchingLevItems.forEach((levItem: any) => {
                if (levItem && levItem.levels) {
                    levItem.levels.forEach((lvl: any, index: number) => {
                        const currentLevelCosts: any[] = [];
                        if (Array.isArray(lvl.lvDeduct)) {
                            lvl.lvDeduct.forEach((c: any) => {
                                // 如果数据是单纯数字，忽略
                                if (typeof c === 'number') return;
                                if (c.itemId === 1 || !c.itemId) return; // 屏蔽点券和无效道具

                                const exist = levCostMap.get(c.itemId) || { name: c.name, count: 0 };
                                exist.count += c.count;
                                levCostMap.set(c.itemId, exist);
                                currentLevelCosts.push(c);
                            });
                        }

                        if (currentLevelCosts.length > 0) {
                            levDetails.push({
                                rank: levItem.rank || 1,
                                level: index + 1,
                                originalLv: lvl.lv,
                                costs: currentLevelCosts
                            });
                        }
                    });
                }
            });

            return {
                id: weaponId,
                name: weaponName,
                rank: unlockItem.rank,
                activationCosts,
                rankCosts,
                levCosts: Array.from(levCostMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
                levDetails
            };
        });
    }, [unlockData, levData]);

    if (!unlockData.length) {
        return <div className="text-textSub p-8 text-center bg-card rounded-xl animate-pulse">正在拉取神器配置流...</div>;
    }

    return (
        <div className="space-y-6 animate-fade-in fade-in">
            {/* 卡片网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {cards.map((card: any) => (
                    <div
                        key={card.id}
                        className="group relative bg-card rounded-2xl border border-border/80 overflow-hidden hover:border-purple-500/20 hover:shadow-[0_8px_30px_rgba(168,85,247,0.06)] transition-all duration-200"
                    >
                        <div className="relative p-6 space-y-5">
                            {/* 标题区 */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-base font-bold text-textMain group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors flex items-center gap-2">
                                        {card.name}
                                    </h3>
                                    <div className="text-xs text-textSub mt-1 font-medium">初始等阶: 阶数 {card.rank}</div>
                                </div>
                            </div>

                            <hr className="border-border/40" />

                            <div className="space-y-4">
                                {/* 激活解锁 */}
                                {card.activationCosts.length > 0 && (
                                    <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 space-y-3 border-l-2 border-l-purple-500/50">
                                        <div className="text-[10px] font-bold text-textMain/80 uppercase tracking-wider">
                                            激活消耗
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {card.activationCosts.map((c: any, i: number) => (
                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 等级拉满及明细 */}
                                {card.levCosts.length > 0 && (
                                    <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 space-y-3 border-l-2 border-l-indigo-500/50">
                                        <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleExpand(card.id)}>
                                            <div className="text-[10px] font-bold text-textMain/80 flex items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                                级别拉满总计
                                            </div>
                                            <button className="text-textSub hover:text-indigo-500 transition-colors p-0.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-white/5 cursor-pointer">
                                                {expandedCards[card.id] ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
                                            </button>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {card.levCosts.map((c: any, i: number) => (
                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                            ))}
                                        </div>

                                        {/* 明细展开面板 */}
                                        <div className={clsx(
                                            "grid gap-2 overflow-hidden transition-all duration-300",
                                            expandedCards[card.id] ? "max-h-[500px] overflow-y-auto custom-scrollbar mt-3 pt-3 border-t border-border/30 opacity-100" : "max-h-0 opacity-0"
                                        )}>
                                            {card.levDetails.map((detail: any, i: number) => (
                                                <div key={i} className="flex flex-col gap-1.5 bg-slate-500/[0.04] dark:bg-black/20 rounded-lg p-2.5 border border-border/10">
                                                    <span className="text-[10px] text-textSub font-mono tracking-wider">
                                                        {detail.rank}阶 Lv.{detail.originalLv} ➜ Lv.{detail.originalLv + 1} 消耗:
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
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
