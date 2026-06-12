import { useMemo, useState } from 'react';
import CostBadge from '../components/ui/CostBadge';
import { Sparkles, Shield, Zap, ChevronDown, ChevronUp, Info, ChevronRight, BookOpen, TableProperties } from 'lucide-react';
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
        <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
                <div className="flex items-center gap-2 text-sm font-bold text-textMain">
                    <TableProperties className="h-4 w-4 text-primary" />
                    {table.title}
                </div>
            </div>
            {hasRows ? (
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full min-w-[520px] text-center text-sm">
                        <thead>
                            <tr className="border-b border-border bg-textMain/5 text-xs text-textSub">
                                <th className="sticky left-0 z-10 bg-surface px-4 py-3 font-medium">Lv.</th>
                                {table.columns.map((column) => (
                                    <th key={column} className="border-l border-border px-4 py-3 font-medium">
                                        {column}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {table.rows.map((row) => (
                                <tr key={row.level} className="hover:bg-textMain/5">
                                    <td className="sticky left-0 z-10 bg-surface px-4 py-3 font-mono font-bold text-textMain">Lv.{row.level}</td>
                                    {row.values.map((value, index) => (
                                        <td key={index} className="min-w-[120px] border-l border-border/40 px-4 py-3 align-top font-mono text-xs leading-5 text-textSub">
                                            {value}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="px-5 py-6 text-sm leading-6 text-textSub">
                    {table.emptyText}
                </div>
            )}
        </div>
    );
}

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleMagic({ dataSources }: Props) {
    const magicLuckData = dataSources['role_magic_luck']?.data || [];
    const magicLevData = dataSources['role_magic_lev']?.data || [];
    const magicSoulData = dataSources['role_magic_soul']?.data || [];
    const magicEffectData = (dataSources['role_magic_effect']?.data || []) as MagicWeaponEffectDetail[];

    // 页面全局子选项卡控制: 'cost' (消耗区域) | 'effect' (效果区域)
    const [activeTab, setActiveTab] = useState<'cost' | 'effect'>('cost');

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
            <div className="flex bg-slate-200/50 dark:bg-black/25 p-1 rounded-lg border border-slate-300 dark:border-border w-max mb-6 gap-1">
                <button
                    onClick={() => setActiveTab('cost')}
                    className={clsx(
                        "px-5 py-2 rounded-md text-sm font-bold transition-all duration-300 cursor-pointer border",
                        activeTab === 'cost'
                            ? "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 shadow-sm shadow-purple-500/10"
                            : "text-slate-600 dark:text-textSub hover:text-slate-900 dark:hover:text-textMain hover:bg-slate-200/50 dark:hover:bg-white/5 border-transparent"
                    )}
                >
                    升级消耗
                </button>
                <button
                    onClick={() => setActiveTab('effect')}
                    className={clsx(
                        "px-5 py-2 rounded-md text-sm font-bold transition-all duration-300 cursor-pointer border",
                        activeTab === 'effect'
                            ? "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 shadow-sm shadow-purple-500/10"
                            : "text-slate-600 dark:text-textSub hover:text-slate-900 dark:hover:text-textMain hover:bg-slate-200/50 dark:hover:bg-white/5 border-transparent"
                    )}
                >
                    法宝效果
                </button>
            </div>

            {/* 卡片展示区 */}
            {activeTab === 'cost' ? (
                /* 消耗区域 - 网格消耗列表 */
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                                    <h3 className="text-lg sm:text-xl font-bold text-textMain group-hover:text-cta transition-colors">
                                        {card.name}
                                    </h3>
                                </div>

                                <hr className="border-border/60" />

                                {/* 消耗汇总与折叠列表 */}
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
            ) : (
                /* 效果区域 - 丹元级主从面板 */
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-stretch animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* 左侧法宝列表 */}
                    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-surface shadow-sm xl:h-0 xl:min-h-[640px]">
                        <div className="border-b border-border px-4 py-3">
                            <div className="flex items-center gap-2 text-sm font-bold text-textMain">
                                <BookOpen className="h-4 w-4 text-cta" />
                                法宝列表
                            </div>
                        </div>
                        <div className="max-h-[500px] overflow-auto p-2 custom-scrollbar xl:max-h-none xl:flex-1 xl:min-h-0">
                            {cards.map((item: any) => {
                                const selected = item.id === activeWeapon?.id;
                                const effect = effectById.get(item.id);
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => setSelectedWeaponId(item.id)}
                                        className={clsx(
                                            'mb-2 w-full rounded-lg border px-3 py-3 text-left transition-all cursor-pointer',
                                            selected
                                                ? 'border-primary/50 bg-primary/15 shadow-md shadow-primary/10'
                                                : 'border-transparent bg-textMain/[0.03] hover:border-textSub/30 hover:bg-textMain/[0.06]'
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-bold text-textMain">{item.name}</div>
                                                <div className="mt-1 text-xs leading-5 text-textSub truncate">
                                                    {effect?.summary || '当前配置没有法宝效果数据'}
                                                </div>
                                            </div>
                                            <ChevronRight className={clsx('mt-0.5 h-4 w-4 shrink-0', selected ? 'text-cta' : 'text-textSub')} />
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {(effect?.tags || []).slice(0, 3).map((tag) => (
                                                <span key={tag} className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-textSub">
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
                                <div className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-5">
                                    {/* 头部信息 */}
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-2xl font-bold text-textMain">{activeEffect.name}</h3>
                                            <span className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                                                {activeEffect.cooldown.display}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm leading-6 text-textSub">{activeEffect.summary}</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {activeEffect.tags.map((tag) => (
                                                <span key={tag} className="rounded-full border border-border bg-textMain/5 px-2.5 py-1 text-xs text-textSub">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 两栏：主动说明 + 器魂说明 */}
                                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                        <div className="rounded-lg border border-border bg-background/40 p-4 space-y-3">
                                            <div className="flex items-center gap-2 text-sm font-bold text-textMain border-b border-border/40 pb-2">
                                                <Sparkles className="h-4 w-4 text-cta" />
                                                主动技能机制
                                            </div>
                                            <div className="space-y-3 text-xs leading-6 text-textSub">
                                                {activeEffect.mechanism.active.map((p, idx) => (
                                                    <p key={idx}>{p}</p>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-border bg-background/40 p-4 space-y-3">
                                            <div className="flex items-center gap-2 text-sm font-bold text-textMain border-b border-border/40 pb-2">
                                                <Shield className="h-4 w-4 text-purple-400" />
                                                器魂被动机制
                                            </div>
                                            <div className="space-y-3 text-xs leading-6 text-textSub">
                                                {activeEffect.mechanism.soul.map((p, idx) => (
                                                    <p key={idx}>{p}</p>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                                        <EffectGrowthTable table={activeEffect.activeGrowthTable} />
                                        <EffectGrowthTable table={activeEffect.soulGrowthTable} />
                                    </div>
                                </div>
                            ) : (
                                /* 其他法宝占位 - 优雅虚线边框看板 */
                                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20 min-h-[560px] animate-in fade-in duration-300">
                                    <div className="p-4 bg-background/50 rounded-full border border-border mb-4">
                                        <Info className="h-10 w-10 text-cta animate-pulse" />
                                    </div>
                                    <h3 className="text-lg font-bold text-textMain">“{activeWeapon.name}”效果解析提取中</h3>
                                    <p className="text-xs text-textSub mt-2 max-w-md text-center leading-relaxed">
                                        当前导出没有找到该法宝的主动技能与器魂被动数据。
                                    </p>
                                    <div className="mt-6 flex gap-2">
                                        <span className="px-3 py-1 rounded-full border border-border bg-textMain/5 text-xs text-textSub font-mono">
                                            ID: {activeWeapon.id}
                                        </span>
                                        <span className="px-3 py-1 rounded-full border border-border bg-textMain/5 text-xs text-textSub">
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
