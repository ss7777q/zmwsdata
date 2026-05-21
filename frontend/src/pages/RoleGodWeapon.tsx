import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { Sparkles, Sword, ChevronDown, ChevronUp } from 'lucide-react';
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
                        className="group relative bg-card rounded-2xl border border-[#fb923c]/20 overflow-hidden hover:border-[#fb923c]/50 hover:shadow-[0_4px_30px_rgba(251,146,60,0.15)] transition-all duration-300"
                    >
                        {/* 背景装饰 */}
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500 pointer-events-none">
                            <Sword className="w-32 h-32 text-[#fb923c]" />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-[#fb923c]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                        <div className="relative p-6 space-y-6">
                            {/* 标题区 */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold text-textMain group-hover:text-[#fb923c] transition-colors flex items-center gap-2">
                                        {card.name}
                                    </h3>
                                    <div className="text-xs text-textSub mt-1">初始等阶: 阶数 {card.rank}</div>
                                </div>
                            </div>

                            <hr className="border-border/60" />

                            <div className="space-y-4">
                                {/* 激活解锁 */}
                                {card.activationCosts.length > 0 && (
                                    <div className="bg-surface p-3 rounded-lg border border-border/40">
                                        <div className="text-xs font-bold text-[#fb923c] mb-2 flex items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                            <Sparkles className="w-3.5 h-3.5" /> 激活消耗
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {card.activationCosts.map((c: any, i: number) => (
                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 等级拉满及明细 */}
                                {card.levCosts.length > 0 && (
                                    <div className="bg-surface p-3 rounded-lg border border-border/40 space-y-3">
                                        <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleExpand(card.id)}>
                                            <div className="text-xs font-bold text-blue-400 flex items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                                <Sword className="w-3.5 h-3.5" /> 级别拉满总计
                                            </div>
                                            <button className="text-textSub hover:text-cta transition-colors p-1 rounded-full hover:bg-black/20">
                                                {expandedCards[card.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </button>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            {card.levCosts.map((c: any, i: number) => (
                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                            ))}
                                        </div>

                                        {/* 明细展开面板 */}
                                        <div className={clsx(
                                            "grid gap-2 overflow-hidden transition-all duration-300",
                                            expandedCards[card.id] ? "max-h-[500px] overflow-y-auto custom-scrollbar mt-2 pt-3 border-t border-border/50 opacity-100" : "max-h-0 opacity-0"
                                        )}>
                                            {card.levDetails.map((detail: any, i: number) => (
                                                <div key={i} className="flex flex-col gap-1.5 bg-black/10 rounded-md p-2">
                                                    <span className="text-[10px] text-textSub font-mono tracking-wider ml-1">
                                                        {detail.rank}阶 Lv.{detail.originalLv} ➜ Lv.{detail.originalLv + 1} 消耗:
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
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
