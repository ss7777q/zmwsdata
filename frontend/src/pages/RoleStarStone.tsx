import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

interface StarStoneTier {
    level: number;
    unlockLevel?: number;
    effect: string;
    value: string;
}

interface StarStoneEffect {
    id: number;
    group: number;
    name: string;
    type: 1 | 2 | null;
    typeName: string;
    ownership: {
        kind: '通用' | '专属' | '未知';
        name: string;
        rewardGroupIds?: number[];
    };
    officialDescription?: string;
    mechanismExplanation?: string;
    summary: string;
    baseEffectName: string;
    extremeEffectName: string;
    baseTiers: StarStoneTier[];
    extremeTiers: StarStoneTier[];
    baseDisplay?: StarStoneDisplayTable;
    extremeDisplay?: StarStoneDisplayTable;
    warnings?: string[];
}

interface StarStoneDisplayTier {
    level: number;
    unlockLevel?: number;
    value: string;
}

interface StarStoneDisplayTable {
    valueHeader: string;
    tiers: StarStoneDisplayTier[];
}

const DEFAULT_LEVELS = [1, 5, 10, 20, 30, 40];

function dedupeSort(values: number[]) {
    return [...new Set(values)].sort((left, right) => left - right);
}

function asStarStoneEffects(value: unknown): StarStoneEffect[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is StarStoneEffect => {
        if (!entry || typeof entry !== 'object') return false;
        const row = entry as Partial<StarStoneEffect>;
        return typeof row.id === 'number'
            && typeof row.name === 'string'
            && Array.isArray(row.baseTiers)
            && Array.isArray(row.extremeTiers);
    });
}

export default function RoleStarStone({ dataSources }: { dataSources: Record<string, any> }) {
    const starStones = useMemo(
        () => asStarStoneEffects(dataSources.role_starstone_effect_all?.data ?? dataSources.role_starstone_effect?.data)
            .filter((stone) => stone.ownership?.name !== '未知' && stone.ownership?.kind !== '未知'),
        [dataSources]
    );
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedType, setSelectedType] = useState<'all' | 'attack' | 'defense'>('all');
    const [selectedPool, setSelectedPool] = useState<string>('all');
    const [pickedLevels, setPickedLevels] = useState<number[] | null>(null);

    const poolOptions = useMemo(() => {
        const pools = new Map<string, { value: string; label: string; order: number }>();
        starStones.forEach((stone) => {
            const name = stone.ownership?.name;
            if (!name || name === '未知') return;
            const order = stone.ownership.kind === '通用' ? 0 : stone.ownership.rewardGroupIds?.[0] ?? Number.MAX_SAFE_INTEGER;
            pools.set(name, {
                value: name,
                label: name.replace('星池', ''),
                order
            });
        });
        const list = Array.from(pools.values()).sort((left, right) => left.order - right.order);
        return [
            { value: 'all', label: '全部' },
            ...list
        ];
    }, [starStones]);



    const activeStone = useMemo(() => {
        return starStones.find((item) => item.id === selectedId) || starStones[0] || null;
    }, [selectedId, starStones]);

    const filteredStones = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return starStones.filter((stone) => {
            const matchesSearch = !query
                || stone.name.toLowerCase().includes(query)
                || stone.summary.toLowerCase().includes(query)
                || (stone.officialDescription || '').toLowerCase().includes(query)
                || (stone.mechanismExplanation || '').toLowerCase().includes(query)
                || stone.baseEffectName.toLowerCase().includes(query)
                || stone.extremeEffectName.toLowerCase().includes(query);
            const matchesType = selectedType === 'all'
                || (selectedType === 'attack' && stone.type === 1)
                || (selectedType === 'defense' && stone.type === 2);
            const matchesPool = selectedPool === 'all'
                || stone.ownership?.name === selectedPool;
            return matchesSearch && matchesType && matchesPool;
        });
    }, [searchQuery, selectedType, selectedPool, starStones]);

    useEffect(() => {
        if (filteredStones.length === 0) return;
        setSelectedId((current) => (
            current != null && filteredStones.some((item) => item.id === current)
                ? current
                : filteredStones[0].id
        ));
    }, [filteredStones]);

    const availableLevels = useMemo(() => {
        return dedupeSort((activeStone?.baseTiers || [])
            .map((tier) => tier.level)
            .filter((level) => Number.isFinite(level)));
    }, [activeStone]);

    const defaultLevels = useMemo(() => {
        const allowed = new Set(availableLevels);
        const defaults = DEFAULT_LEVELS.filter((level) => allowed.has(level));
        return defaults.length ? defaults : availableLevels;
    }, [availableLevels]);

    const visibleLevels = useMemo(() => {
        const allowed = new Set(availableLevels);
        const next = (pickedLevels ?? defaultLevels).filter((level) => allowed.has(level));
        return next.length ? dedupeSort(next) : defaultLevels;
    }, [availableLevels, defaultLevels, pickedLevels]);

    const visibleBaseTiers = useMemo(() => {
        const selected = new Set(visibleLevels);
        return activeStone?.baseDisplay?.tiers.filter((tier) => selected.has(tier.level)) || [];
    }, [activeStone, visibleLevels]);

    const visibleBaseDisplayTable = {
        valueHeader: activeStone?.baseDisplay?.valueHeader || activeStone?.baseEffectName || '普通效果',
        tiers: visibleBaseTiers
    };

    const extremeDisplayTable = activeStone?.extremeDisplay || {
        valueHeader: activeStone?.extremeEffectName || '极效',
        tiers: []
    };

    const maxLevel = availableLevels[availableLevels.length - 1] ?? null;

    const toggleLevel = (level: number) => {
        setPickedLevels((previous) => {
            const base = previous ?? defaultLevels;
            const next = base.includes(level)
                ? base.filter((item) => item !== level)
                : [...base, level];
            return dedupeSort(next);
        });
    };

    const selectStone = (id: number) => {
        setSelectedId(id);
        setPickedLevels(null);
    };

    if (!activeStone) {
        return (
            <div className="rounded-lg border border-border bg-card p-8 text-sm text-textSub">
                暂无星石词条数据
            </div>
        );
    }

    const isAttack = activeStone.type === 1;
    const themeClasses = isAttack
        ? {
            chip: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
        }
        : {
            chip: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400'
        };

    const officialDescription = activeStone.officialDescription || activeStone.baseEffectName;
    const mechanismExplanation = activeStone.mechanismExplanation || activeStone.summary || `${activeStone.baseEffectName}；${activeStone.extremeEffectName}`;

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="rounded-lg border border-border bg-card px-5 py-4 shadow-sm space-y-4">
                <div className="flex flex-col gap-2 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="text-sm font-bold text-textMain">星石词条等级</div>
                        <div className="mt-1 text-xs text-textSub">默认选中六档，点选多个等级横向对比普通效果</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                        <button
                            type="button"
                            onClick={() => setPickedLevels(defaultLevels)}
                            className="rounded-md bg-surface px-2.5 py-1 font-medium text-textSub transition-colors hover:text-textMain focus:outline-none"
                        >
                            默认六档
                        </button>
                        <button
                            type="button"
                            onClick={() => setPickedLevels(availableLevels)}
                            className="rounded-md bg-surface px-2.5 py-1 font-medium text-textSub transition-colors hover:text-textMain focus:outline-none"
                        >
                            全选
                        </button>
                        {maxLevel != null && (
                            <button
                                type="button"
                                onClick={() => setPickedLevels([maxLevel])}
                                className="rounded-md bg-surface px-2.5 py-1 font-medium text-textSub transition-colors hover:text-textMain focus:outline-none"
                            >
                                仅满级
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {availableLevels.map((level) => {
                        const active = visibleLevels.includes(level);
                        return (
                            <button
                                key={level}
                                type="button"
                                onClick={() => toggleLevel(level)}
                                className={clsx(
                                    'min-w-[3rem] rounded-lg px-2 py-1 text-center font-mono text-xs transition-colors focus:outline-none',
                                    active
                                        ? 'bg-primary text-white shadow-sm shadow-primary/15'
                                        : 'bg-surface text-textSub hover:text-textMain'
                                )}
                            >
                                Lv.{level}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-stretch">
            <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-sm xl:h-0 xl:min-h-[600px] overflow-hidden">
                <div className="p-4 border-b border-border space-y-3 bg-slate-500/[0.01] dark:bg-white/[0.01]">
                    <div className="text-sm font-bold tracking-wider text-textMain uppercase">
                        星石词条检索
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="搜索词条或效果..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="w-full px-3.5 py-2 text-xs rounded-lg border border-border bg-slate-500/[0.04] dark:bg-black/20 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-textMain transition-all"
                        />
                    </div>
                    <div className="flex gap-1.5 p-0.5 bg-slate-500/[0.06] dark:bg-white/[0.03] rounded-lg text-[10px] font-bold">
                        {(['all', 'attack', 'defense'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => setSelectedType(type)}
                                className={clsx(
                                    'flex-1 py-1.5 rounded-md text-center transition-all cursor-pointer border focus:outline-none',
                                    selectedType === type
                                        ? 'bg-card text-textMain shadow-sm border-border/40'
                                        : 'text-textSub hover:text-textMain border-transparent'
                                )}
                            >
                                {type === 'all' ? '全部' : type === 'attack' ? '攻伐' : '守御'}
                            </button>
                        ))}
                    </div>
                    {poolOptions.length > 2 && (
                        <div className="flex flex-wrap gap-1 p-0.5 bg-slate-500/[0.06] dark:bg-white/[0.03] rounded-lg text-[10px] font-bold">
                            {poolOptions.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setSelectedPool(option.value)}
                                    className={clsx(
                                        'flex-1 min-w-[50px] py-1 rounded-md text-center transition-all cursor-pointer border focus:outline-none',
                                        selectedPool === option.value
                                            ? 'bg-card text-textMain shadow-sm border-border/40'
                                            : 'text-textSub hover:text-textMain border-transparent'
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="max-h-[320px] xl:max-h-none overflow-y-auto p-3.5 custom-scrollbar xl:flex-1 xl:min-h-0 space-y-2">
                    {filteredStones.length > 0 ? (
                        filteredStones.map((stone) => {
                            const selected = stone.id === activeStone.id;
                            const attackRow = stone.type === 1;
                            return (
                                <button
                                    key={stone.id}
                                    onClick={() => selectStone(stone.id)}
                                    className={clsx(
                                        'w-full rounded-lg border p-3 text-left transition-all duration-200 cursor-pointer active:scale-[0.99] group',
                                        selected
                                            ? attackRow
                                                ? 'border-red-500/40 bg-red-500/10 dark:bg-red-950/20 shadow-sm shadow-red-500/5'
                                                : 'border-blue-500/40 bg-blue-500/10 dark:bg-blue-950/20 shadow-sm shadow-blue-500/5'
                                            : 'border-transparent bg-slate-500/[0.02] dark:bg-white/[0.01] hover:border-slate-300/50 dark:hover:border-slate-800/80 hover:bg-slate-500/[0.04]'
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className={clsx(
                                            'text-xs font-bold transition-colors group-hover:text-primary',
                                            selected
                                                ? attackRow ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
                                                : 'text-textMain'
                                        )}>
                                            {stone.name}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className={clsx(
                                                'px-1.5 py-0.5 rounded-md text-[9px] font-bold border',
                                                attackRow
                                                    ? 'border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400'
                                                    : 'border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400'
                                            )}>
                                                {stone.typeName}
                                            </span>
                                            {stone.ownership?.name && stone.ownership.name !== '未知' && (
                                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold border border-border/80 bg-slate-500/[0.04] dark:bg-black/10 text-textSub">
                                                    {stone.ownership.name.replace('星池', '')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="mt-1.5 text-[10px] leading-relaxed text-textSub line-clamp-2">
                                        {stone.baseEffectName}
                                    </p>
                                </button>
                            );
                        })
                    ) : (
                        <div className="text-center py-12 text-textSub/60 text-xs">
                            未匹配到相关星石词条
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-6 flex-1 min-w-0">
                <div className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-xl font-bold text-textMain">{activeStone.name}</h2>
                        <span className={clsx('px-2.5 py-0.5 rounded-lg text-xs font-bold border flex items-center gap-1', themeClasses.chip)}>
                            {activeStone.typeName}词条
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold border border-border/80 bg-slate-500/[0.04] dark:bg-black/10 text-textSub">
                            {activeStone.ownership.name}
                        </span>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="rounded-lg bg-surface px-3.5 py-3">
                            <div className="mb-1 text-[11px] font-semibold text-textSub">官方描述</div>
                            <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-xs leading-relaxed text-textMain">
                                {officialDescription}
                            </div>
                        </div>
                        <div className="rounded-lg bg-surface px-3.5 py-3">
                            <div className="mb-1 text-[11px] font-semibold text-textSub">机制解释</div>
                            <div className="max-h-28 overflow-y-auto break-words pr-1 text-xs leading-relaxed text-textMain">
                                {mechanismExplanation}
                            </div>
                        </div>
                    </div>

                    {activeStone.warnings && activeStone.warnings.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 items-center text-[10px]">
                            {activeStone.warnings.map((warning) => (
                                <span
                                    key={warning}
                                    className="px-2 py-0.5 rounded-md border border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300 font-medium"
                                >
                                    {warning}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden flex flex-col">
                        <div className="border-b border-border bg-slate-500/[0.01] dark:bg-white/[0.01] px-5 py-4 flex justify-between items-center">
                            <div className="text-xs font-bold tracking-wider text-textMain uppercase">
                                普通效果：{activeStone.baseEffectName}
                            </div>
                        </div>
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-center text-xs">
                                <thead>
                                    <tr className="border-b border-border/40 bg-slate-500/[0.04] dark:bg-white/[0.02] text-textSub">
                                        <th className="px-4 py-3 font-semibold text-[10px] tracking-wider">词条等级</th>
                                        <th className="px-4 py-3 font-semibold text-[10px] tracking-wider">{visibleBaseDisplayTable.valueHeader}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {visibleBaseDisplayTable.tiers.map((tier) => (
                                        <tr key={tier.level} className="hover:bg-slate-500/[0.01] transition-colors duration-150 text-textSub">
                                            <td className="px-4 py-3 font-mono font-bold">
                                                {tier.level}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-mono font-medium text-textMain">{tier.value}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden flex flex-col">
                        <div className="border-b border-border bg-slate-500/[0.01] dark:bg-white/[0.01] px-5 py-4 flex justify-between items-center">
                            <div className="text-xs font-bold tracking-wider text-textMain uppercase">
                                极效：{activeStone.extremeEffectName}
                            </div>
                        </div>
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-center text-xs">
                                <thead>
                                    <tr className="border-b border-border/40 bg-slate-500/[0.04] dark:bg-white/[0.02] text-textSub">
                                        <th className="px-4 py-3 font-semibold text-[10px] tracking-wider">极效等级</th>
                                        <th className="px-4 py-3 font-semibold text-[10px] tracking-wider">解锁词条等级</th>
                                        <th className="px-4 py-3 font-semibold text-[10px] tracking-wider">{extremeDisplayTable.valueHeader}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20">
                                    {extremeDisplayTable.tiers.map((tier) => (
                                        <tr key={`${tier.level}-${tier.unlockLevel}`} className="hover:bg-slate-500/[0.01] transition-colors duration-150 text-textSub">
                                            <td className="px-4 py-3 font-mono font-bold">
                                                {tier.level}
                                            </td>
                                            <td className="px-4 py-3 font-mono">
                                                {tier.unlockLevel}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-mono font-medium text-textMain">{tier.value}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
}
