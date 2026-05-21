import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { Sparkles, Shield, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleMagic({ dataSources }: Props) {
    const magicLuckData = dataSources['role_magic_luck']?.data || [];
    const magicLevData = dataSources['role_magic_lev']?.data || [];
    const magicSoulData = dataSources['role_magic_soul']?.data || [];

    // 控制每个卡片内部明细折叠的 state 集合: cardId -> boolean
    const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
    const [expandedSoulCards, setExpandedSoulCards] = useState<Record<number, boolean>>({});

    const toggleExpand = (cardId: number) => {
        setExpandedCards(prev => ({
            ...prev,
            [cardId]: !prev[cardId]
        }));
    };

    const toggleSoulExpand = (cardId: number) => {
        setExpandedSoulCards(prev => ({
            ...prev,
            [cardId]: !prev[cardId]
        }));
    };

    const cards = useMemo(() => {
        return magicLuckData.filter((item: any) => item.phases !== 2 && !item.name.includes('二阶')).map((luckItem: any) => {
            const weaponId = luckItem.id;
            const weaponName = luckItem.name;

            // 1. 等级消耗 (Level Up)
            const levItem = magicLevData.find((l: any) => l.weaponGroup === weaponId);
            const levCostMap = new Map<number, { name: string, count: number }>();
            const levDetails: any[] = [];

            if (levItem && levItem.levels) {
                levItem.levels.forEach((lvl: any, index: number) => {
                    const currentLevelCosts: any[] = [];
                    lvl.lvDeduct?.forEach((c: any) => {
                        if (c.itemId === 1) return; // 不展示点券
                        const exist = levCostMap.get(c.itemId) || { name: c.name, count: 0 };
                        exist.count += c.count;
                        levCostMap.set(c.itemId, exist);
                        currentLevelCosts.push(c);
                    });

                    if (currentLevelCosts.length > 0) {
                        levDetails.push({ level: index + 1, costs: currentLevelCosts });
                    }
                });
            }

            // 2. 器魂消耗 (Soul Up)
            const soulItem = magicSoulData.find((s: any) => s.groupId === luckItem.soulGroupId);
            const soulCostMap = new Map<number, { name: string, count: number }>();
            const soulDetails: any[] = [];

            if (soulItem && soulItem.levels) {
                soulItem.levels.forEach((lvl: any, index: number) => {
                    const currentLevelCosts: any[] = [];
                    lvl.upCost?.forEach((c: any) => {
                        if (c.itemId === 1) return; // 不展示点券
                        const exist = soulCostMap.get(c.itemId) || { name: c.name, count: 0 };
                        exist.count += c.count;
                        soulCostMap.set(c.itemId, exist);
                        currentLevelCosts.push(c);
                    });

                    if (currentLevelCosts.length > 0) {
                        soulDetails.push({ level: index + 1, costs: currentLevelCosts });
                    }
                });
            }

            return {
                id: weaponId,
                name: weaponName,
                phases: luckItem.phases,
                levCosts: Array.from(levCostMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
                levDetails,
                soulCosts: Array.from(soulCostMap.entries()).map(([itemId, v]) => ({ itemId, ...v })),
                soulDetails,
                baptizeLuck: luckItem.baptizeLuck || [],
                blessingCostLuck: luckItem.blessingCostLuck || [],
                baptizeGrowLuck: luckItem.baptizeGrowLuck || []
            };
        });
    }, [magicLuckData, magicLevData, magicSoulData]);

    if (!magicLuckData.length) {
        return <div className="text-textSub p-8 text-center bg-card rounded-xl animate-pulse">正在拉取法宝配置流...</div>;
    }

    return (
        <div className="space-y-6">
            {/* 模块头部 */}
            <div className="bg-gradient-to-r from-cta/10 to-transparent p-4 sm:p-6 rounded-xl border border-cta/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold font-sans text-cta drop-shadow-[0_0_12px_rgba(250,204,21,0.5)] flex items-center gap-2">
                        <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
                        法宝系统数据
                    </h2>
                </div>
            </div>

            {/* 卡片网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {cards.map((card: any) => (
                    <div
                        key={card.id}
                        className="group relative bg-card rounded-2xl border border-cta/10 overflow-hidden hover:border-cta/40 hover:shadow-[0_4px_30px_rgba(250,204,21,0.1)] transition-all duration-300"
                    >
                        {/* 背景装饰 */}
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500 pointer-events-none">
                            <Sparkles className="w-32 h-32 text-cta" />
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-cta/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

                        <div className="relative p-6 space-y-6">
                            {/* 标题区 */}
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold text-textMain group-hover:text-cta transition-colors">
                                        {card.name}
                                    </h3>
                                </div>
                            </div>

                            <hr className="border-border/60" />

                            {/* 三大培养系统聚合展示 */}
                            <div className="space-y-4">
                                {/* 系统1：升级所需 */}
                                {card.levCosts.length > 0 && (
                                    <div className="bg-surface p-3 rounded-lg border border-border/40 space-y-3">
                                        <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleExpand(card.id)}>
                                            <div className="text-xs font-bold text-primary flex flex-row items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                                <Sparkles className="w-3.5 h-3.5" /> 升级总计 (Lv0➜10)
                                            </div>
                                            <button className="text-textSub hover:text-cta transition-colors p-1 rounded-full hover:bg-black/20">
                                                {expandedCards[card.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </button>
                                        </div>

                                        {/* 始终展示的汇总消耗 */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {card.levCosts.map((c: any, i: number) => (
                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                            ))}
                                        </div>

                                        {/* 展开显示的各级明细 */}
                                        <div className={clsx(
                                            "grid gap-2 overflow-hidden transition-all duration-300",
                                            expandedCards[card.id] ? "max-h-[500px] mt-2 pt-3 border-t border-border/50 opacity-100" : "max-h-0 opacity-0"
                                        )}>
                                            {card.levDetails.map((detail: any, i: number) => (
                                                <div key={i} className="flex flex-col gap-1.5 bg-black/10 rounded-md p-2">
                                                    <span className="text-[10px] text-textSub font-mono tracking-wider ml-1">
                                                        Lv.{detail.level - 1} ➜ Lv.{detail.level} 消耗:
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

                                {/* 系统2：法宝器魂 */}
                                {card.soulCosts.length > 0 && (
                                    <div className="bg-surface p-3 rounded-lg border border-border/40 space-y-3">
                                        <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSoulExpand(card.id)}>
                                            <div className="text-xs font-bold text-purple-400 flex flex-row items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                                <Shield className="w-3.5 h-3.5" /> 器魂拉满总计
                                            </div>
                                            <button className="text-textSub hover:text-cta transition-colors p-1 rounded-full hover:bg-black/20">
                                                {expandedSoulCards[card.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </button>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            {card.soulCosts.map((c: any, i: number) => (
                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                            ))}
                                        </div>

                                        {/* 展开显示的各级明细 */}
                                        <div className={clsx(
                                            "grid gap-2 overflow-hidden transition-all duration-300",
                                            expandedSoulCards[card.id] ? "max-h-[500px] overflow-y-auto custom-scrollbar mt-2 pt-3 border-t border-border/50 opacity-100" : "max-h-0 opacity-0"
                                        )}>
                                            {card.soulDetails.map((detail: any, i: number) => (
                                                <div key={i} className="flex flex-col gap-1.5 bg-black/10 rounded-md p-2">
                                                    <span className="text-[10px] text-textSub font-mono tracking-wider ml-1">
                                                        器魂 Lv.{detail.level - 1} ➜ Lv.{detail.level} 消耗:
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

                                {/* 系统3：强运洗练 */}
                                {(card.baptizeLuck.length > 0 || card.blessingCostLuck.length > 0 || card.baptizeGrowLuck.length > 0) && (
                                    <div className="bg-surface p-3 rounded-lg border border-border/40">
                                        <div className="text-xs font-bold text-green-400 mb-2 flex flex-row items-center gap-1.5 opacity-80 uppercase tracking-wider">
                                            <Zap className="w-3.5 h-3.5" /> 强运洗练
                                        </div>
                                        <div className="space-y-2">
                                            {card.baptizeLuck.length > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-textSub mr-2">全部强运:</span>
                                                    <div className="flex items-center gap-2">
                                                        {card.baptizeLuck.map((c: any, i: number) => (
                                                            <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {card.blessingCostLuck.length > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-textSub mr-2">祝福强运:</span>
                                                    <div className="flex items-center gap-2">
                                                        {card.blessingCostLuck.map((c: any, i: number) => (
                                                            <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {card.baptizeGrowLuck.length > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-textSub mr-2">成长强运:</span>
                                                    <div className="flex items-center gap-2">
                                                        {card.baptizeGrowLuck.map((c: any, i: number) => (
                                                            <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
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
