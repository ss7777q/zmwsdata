import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface MagicWeaponEffectTable {
    title: string;
    columns: string[];
    rows: {
        level: number;
        values: string[];
    }[];
    emptyText: string;
}

interface MagicWeaponEffectDetail {
    id: number;
    name: string;
    summary: string;
    tags: string[];
    mechanism: {
        active: string[];
        soul: string[];
    };
    cooldown: {
        display: string;
    };
    activeGrowthTable: MagicWeaponEffectTable;
    soulGrowthTable: MagicWeaponEffectTable | null;
}

function EffectGrowthTable({ table }: { table: MagicWeaponEffectTable | null }) {
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
                                <tr key={row.level} className="hover:bg-purple-500/[0.02] transition-colors duration-150">
                                    <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-mono font-bold text-textMain text-xs">Lv.{row.level}</td>
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
    activeTab?: 'cost' | 'effect';
    onTabChange?: (tab: 'cost' | 'effect') => void;
}

export default function RoleMagic({ dataSources, activeTab, onTabChange }: Props) {
    const magicLuckData = dataSources['role_magic_luck']?.data || [];
    const magicLevData = dataSources['role_magic_lev']?.data || [];
    const magicSoulData = dataSources['role_magic_soul']?.data || [];
    const magicEffectData = (dataSources['role_magic_effect']?.data || []) as MagicWeaponEffectDetail[];

    // 页面全局子选项卡控制: 'cost' (升级消耗) | 'effect' (法宝效果)
    const [localActiveTab, setLocalActiveTab] = useState<'cost' | 'effect'>('cost');
    const currentTab = activeTab ?? localActiveTab;
    const setCurrentTab = (tab: 'cost' | 'effect') => {
        if (onTabChange) onTabChange(tab);
        else setLocalActiveTab(tab);
    };

    // 效果区域当前选中的法宝 ID
    const [selectedWeaponId, setSelectedWeaponId] = useState<number | null>(null);

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

    // 效果区域当前高亮激活的法宝
    const activeWeapon = useMemo(() => {
        return cards.find((c: any) => c.id === selectedWeaponId) || cards[0] || null;
    }, [cards, selectedWeaponId]);

    const effectById = useMemo(() => {
        return new Map(magicEffectData.map((item) => [item.id, item]));
    }, [magicEffectData]);

    const activeEffect = useMemo(() => {
        return activeWeapon ? effectById.get(activeWeapon.id) || null : null;
    }, [activeWeapon, effectById]);

    if (!magicLuckData.length) {
        return <div className="text-textSub p-8 text-center bg-card rounded-xl animate-pulse">正在拉取法宝配置流...</div>;
    }

    return (
        <div className="space-y-6">
            {/* 页面级子选项卡 */}
            <div className="flex bg-slate-200/40 dark:bg-black/20 p-1 rounded-xl border border-slate-300/60 dark:border-border/60 w-max mb-6 gap-1 shadow-sm backdrop-blur-sm">
                <button
                    onClick={() => setCurrentTab('cost')}
                    className={clsx(
                        "px-6 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                        currentTab === 'cost'
                            ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                            : "text-slate-500 dark:text-textSub hover:text-slate-800 dark:hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                    )}
                >
                    升级消耗
                </button>
                <button
                    onClick={() => setCurrentTab('effect')}
                    className={clsx(
                        "px-6 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                        currentTab === 'effect'
                            ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                            : "text-slate-500 dark:text-textSub hover:text-slate-800 dark:hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                    )}
                >
                    法宝效果
                </button>
            </div>

            {/* 卡片展示区 */}
            {currentTab === 'cost' ? (
                /* 消耗区域 - 网格消耗列表 */
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {cards.map((card: any) => (
                        <div
                            key={card.id}
                            className="group relative bg-card rounded-2xl border border-border/80 overflow-hidden hover:border-purple-500/20 hover:shadow-[0_8px_30px_rgba(168,85,247,0.06)] transition-all duration-300"
                        >
                            <div className="relative p-6 space-y-5">
                                {/* 标题区 */}
                                <div className="flex justify-between items-start">
                                    <h3 className="text-base font-bold text-textMain group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                        {card.name}
                                    </h3>
                                </div>

                                <hr className="border-border/40" />

                                {/* 消耗汇总与折叠列表 */}
                                <div className="space-y-4">
                                    {/* 系统1：升级所需 */}
                                    {card.levCosts.length > 0 && (
                                        <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 space-y-3 border-l-2 border-l-purple-500/50">
                                            <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleExpand(card.id)}>
                                                <div className="text-[11px] font-bold text-textMain/80 uppercase tracking-wider">
                                                    升级总计 (Lv0 ➜ 10)
                                                </div>
                                                <button className="text-textSub hover:text-purple-500 transition-colors p-0.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-white/5">
                                                    {expandedCards[card.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>

                                            {/* 始终展示的汇总消耗 */}
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {card.levCosts.map((c: any, i: number) => (
                                                    <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                ))}
                                            </div>

                                            {/* 展开显示的各级明细 */}
                                            <div className={clsx(
                                                "grid gap-2 transition-all duration-300",
                                                expandedCards[card.id] ? "max-h-[500px] overflow-y-auto custom-scrollbar mt-3 pt-3 border-t border-border/30 opacity-100" : "max-h-0 overflow-hidden opacity-0"
                                            )}>
                                                {card.levDetails.map((detail: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-1.5 bg-slate-500/[0.04] dark:bg-black/20 rounded-lg p-2.5 border border-border/10">
                                                        <span className="text-[10px] text-textSub font-mono tracking-wider">
                                                            Lv.{detail.level - 1} ➜ Lv.{detail.level} 消耗:
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

                                    {/* 系统2：法宝器魂 */}
                                    {card.soulCosts.length > 0 && (
                                        <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 space-y-3 border-l-2 border-l-indigo-500/50">
                                            <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSoulExpand(card.id)}>
                                                <div className="text-[11px] font-bold text-textMain/80 uppercase tracking-wider">
                                                    器魂拉满总计
                                                </div>
                                                <button className="text-textSub hover:text-indigo-500 transition-colors p-0.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-white/5">
                                                    {expandedSoulCards[card.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {card.soulCosts.map((c: any, i: number) => (
                                                    <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                ))}
                                            </div>

                                            {/* 展开显示的各级明细 */}
                                            <div className={clsx(
                                                "grid gap-2 transition-all duration-300",
                                                expandedSoulCards[card.id] ? "max-h-[500px] overflow-y-auto custom-scrollbar mt-3 pt-3 border-t border-border/30 opacity-100" : "max-h-0 overflow-hidden opacity-0"
                                            )}>
                                                {card.soulDetails.map((detail: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-1.5 bg-slate-500/[0.04] dark:bg-black/20 rounded-lg p-2.5 border border-border/10">
                                                        <span className="text-[10px] text-textSub font-mono tracking-wider">
                                                            器魂 Lv.{detail.level - 1} ➜ Lv.{detail.level} 消耗:
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

                                    {/* 系统3：强运洗练 */}
                                    {(card.baptizeLuck.length > 0 || card.blessingCostLuck.length > 0 || card.baptizeGrowLuck.length > 0) && (
                                        <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 space-y-3 border-l-2 border-l-emerald-500/50">
                                            <div className="text-[11px] font-bold text-textMain/80 uppercase tracking-wider">
                                                强运洗练
                                            </div>
                                            <div className="space-y-2.5 pt-1">
                                                {card.baptizeLuck.length > 0 && (
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-textSub">全部强运:</span>
                                                        <div className="flex items-center gap-1.5">
                                                            {card.baptizeLuck.map((c: any, i: number) => (
                                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {card.blessingCostLuck.length > 0 && (
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-textSub">祝福强运:</span>
                                                        <div className="flex items-center gap-1.5">
                                                            {card.blessingCostLuck.map((c: any, i: number) => (
                                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {card.baptizeGrowLuck.length > 0 && (
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-textSub">成长强运:</span>
                                                        <div className="flex items-center gap-1.5">
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
            ) : (
                /* 效果区域 - 丹元级主从面板 */
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-stretch animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* 左侧法宝列表 */}
                    <div className="flex min-h-0 flex-col rounded-xl border border-border/80 bg-card shadow-sm xl:h-0 xl:min-h-[640px] overflow-hidden">
                        <div className="border-b border-border/60 bg-slate-500/[0.02] dark:bg-white/[0.01] px-4 py-3.5">
                            <div className="text-xs font-bold tracking-wider text-textMain uppercase">
                                法宝列表
                            </div>
                        </div>
                        <div className="max-h-[500px] overflow-auto p-3.5 custom-scrollbar xl:max-h-none xl:flex-1 xl:min-h-0 space-y-2">
                            {cards.map((item: any) => {
                                const selected = item.id === activeWeapon?.id;
                                const effect = effectById.get(item.id);
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setSelectedWeaponId(item.id)}
                                        className={clsx(
                                            'w-full rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.99]',
                                            selected
                                                ? 'border-purple-500/40 bg-purple-500/10 dark:bg-purple-950/20 shadow-sm shadow-purple-500/5'
                                                : 'border-transparent bg-slate-500/[0.02] dark:bg-white/[0.01] hover:border-slate-300/50 dark:hover:border-slate-800/80 hover:bg-slate-500/[0.04]'
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className={clsx("truncate text-sm font-bold transition-colors", selected ? "text-purple-600 dark:text-purple-400" : "text-textMain")}>{item.name}</div>
                                                <div className="mt-1.5 text-xs leading-5 text-textSub truncate">
                                                    {effect?.summary || '当前配置没有法宝效果数据'}
                                                </div>
                                            </div>
                                            <ChevronRight className={clsx('mt-0.5 h-4 w-4 shrink-0 transition-colors', selected ? 'text-purple-500' : 'text-textSub/50')} />
                                        </div>
                                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                                            {(effect?.tags || []).slice(0, 3).map((tag) => (
                                                <span key={tag} className="rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 px-2 py-0.5 text-[10px] text-textSub font-medium">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 右侧详情面板 */}
                    {activeWeapon && (
                        <div className="space-y-5 min-w-0 flex-1">
                            {activeEffect ? (
                                /* 动态效果看板 - 机制说明 + 成长表 */
                                <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
                                    {/* 头部信息 */}
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <h3 className="text-xl font-bold text-textMain">{activeEffect.name}</h3>
                                            <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 font-mono tracking-wide">
                                                {activeEffect.cooldown.display}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-xs leading-6 text-textSub/90">{activeEffect.summary}</p>
                                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                                            {activeEffect.tags.map((tag) => (
                                                <span key={tag} className="rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 px-2 py-0.5 text-[10px] text-textSub font-medium">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 两栏：主动说明 + 器魂说明 */}
                                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                                        <div className="rounded-xl border border-border/60 bg-slate-500/[0.01] dark:bg-white/[0.01] p-4.5 space-y-3.5">
                                            <div className="text-xs font-bold text-textMain border-b border-border/40 pb-2.5 uppercase tracking-wider">
                                                主动技能机制
                                            </div>
                                            <div className="space-y-3 text-xs leading-relaxed text-textSub/90">
                                                {activeEffect.mechanism.active.map((p, idx) => (
                                                    <p key={idx}>{p}</p>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-border/60 bg-slate-500/[0.01] dark:bg-white/[0.01] p-4.5 space-y-3.5">
                                            <div className="text-xs font-bold text-textMain border-b border-border/40 pb-2.5 uppercase tracking-wider">
                                                器魂被动机制
                                            </div>
                                            <div className="space-y-3 text-xs leading-relaxed text-textSub/90">
                                                {activeEffect.mechanism.soul.map((p, idx) => (
                                                    <p key={idx}>{p}</p>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                                        <EffectGrowthTable table={activeEffect.activeGrowthTable} />
                                        <EffectGrowthTable table={activeEffect.soulGrowthTable} />
                                    </div>
                                </div>
                            ) : (
                                /* 其他法宝占位 - 优雅虚线边框看板 */
                                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-slate-500/[0.01] dark:bg-white/[0.01] py-20 min-h-[560px] animate-in fade-in duration-300">
                                    <div className="relative flex items-center justify-center w-12 h-12 mb-5">
                                        <span className="absolute inline-flex h-full w-full rounded-full bg-purple-500/10 animate-ping opacity-60"></span>
                                        <div className="relative inline-flex rounded-full h-8 w-8 bg-purple-500/15 border border-purple-500/30 items-center justify-center">
                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                                        </div>
                                    </div>
                                    <h3 className="text-sm font-bold text-textMain">“{activeWeapon.name}”效果解析中</h3>
                                    <p className="text-xs text-textSub mt-2.5 max-w-xs text-center leading-relaxed opacity-75">
                                        当前导出数据尚未包含该法宝的主动技能与器魂被动。
                                    </p>
                                    <div className="mt-6 flex gap-1.5">
                                        <span className="px-2.5 py-0.5 rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 text-[10px] text-textSub font-mono">
                                            ID: {activeWeapon.id}
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 text-[10px] text-textSub font-mono">
                                            {activeWeapon.phases}阶法宝
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
