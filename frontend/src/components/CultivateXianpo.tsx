import { useMemo, useState } from 'react';
import { clsx } from 'clsx';

interface Props {
    dataSources: Record<string, any>;
}

const AttributeNames: Record<string, string> = {
    hitVal: '命中',
    dodge: '闪避',
    crit: '暴击',
    tenacity: '韧性',
    lucky: '幸运',
    guardian: '守护'
};

const QualityNames: Record<number, string> = {
    1: '绿',
    2: '蓝',
    3: '紫',
    4: '金',
    5: '红'
};

const QualityStyles: Record<number, string> = {
    1: 'text-green-400 border-green-500/30 bg-green-500/10',
    2: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    3: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    4: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
    5: 'text-red-400 border-red-500/30 bg-red-500/10'
};

export default function CultivateXianpo({ dataSources }: Props) {
    const rawData = (dataSources['role_xianpo'] as any)?.data;
    const types = rawData?.types || [];
    const roleLevelCurve = rawData?.roleLevelCurve || [];
    const qualities = rawData?.qualities || [];

    const [activeType, setActiveType] = useState<number>(types[0]?.type || 1);
    const [metric, setMetric] = useState<'attributeValue' | 'provideExp'>('attributeValue');

    const activeTypeData = useMemo<any>(
        () => types.find((item: any) => item.type === activeType) || types[0],
        [activeType, types]
    );

    const levelRows = useMemo(() => {
        if (!activeTypeData) return [];

        const roleLevelMap = new Map(roleLevelCurve.map((item: any) => [item.level, item.roleLevel]));
        const qualityMaps = new Map<number, Map<number, any>>(
            (activeTypeData.qualityLevels || []).map((qualityNode: any) => [
                qualityNode.quality,
                new Map((qualityNode.levels || []).map((levelNode: any) => [levelNode.level, levelNode]))
            ])
        );

        return roleLevelCurve.map((curve: any) => {
            const row: Record<string, any> = {
                level: curve.level,
                roleLevel: roleLevelMap.get(curve.level)
            };
            for (const quality of qualities) {
                const qualityLevel = qualityMaps.get(quality.quality)?.get(curve.level);
                row[`q${quality.quality}`] = qualityLevel?.[metric] ?? null;
            }
            return row;
        });
    }, [activeTypeData, metric, qualities, roleLevelCurve]);

    if (!rawData || types.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border/80 bg-slate-500/[0.01] dark:bg-white/[0.01] rounded-xl">
                <div className="relative flex items-center justify-center w-12 h-12 mb-3">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-slate-500/10 animate-ping opacity-60"></span>
                    <div className="relative inline-flex rounded-full h-8 w-8 bg-slate-500/15 border border-slate-500/30 items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"></span>
                    </div>
                </div>
                <h3 className="text-xs text-textSub font-medium tracking-wider">未获取到炼体卷轴 (role_xianpo)</h3>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                {types.map((typeNode: any) => {
                    const selected = typeNode.type === activeType;
                    const maxRed = typeNode.qualityLevels?.find((qualityNode: any) => qualityNode.quality === 5)?.levels?.at(-1);

                    return (
                        <button
                            key={typeNode.type}
                            onClick={() => setActiveType(typeNode.type)}
                            className={clsx(
                                'text-left rounded-xl border p-4 transition-all duration-200 cursor-pointer active:scale-[0.99]',
                                selected
                                    ? 'border-purple-500/40 bg-purple-500/10 dark:bg-purple-950/20 shadow-sm shadow-purple-500/5'
                                    : 'border-border bg-card hover:border-slate-300 dark:hover:border-slate-800'
                            )}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-mono font-bold tracking-widest text-textSub/80">TYPE {typeNode.type}</span>
                            </div>
                            <div className={clsx("text-base font-bold transition-colors", selected ? "text-purple-600 dark:text-purple-400" : "text-textMain")}>{typeNode.typeName}</div>
                            <div className="text-xs text-textSub mt-1 font-medium">{AttributeNames[typeNode.attribute] || typeNode.attribute}</div>
                            <div className="text-[10px] text-textSub/75 mt-3 font-mono">
                                红64属性 {maxRed?.attributeValue?.toLocaleString?.() ?? '-'}
                            </div>
                        </button>
                    );
                })}
            </div>

            {activeTypeData && (
                <>
                    <div className="card border border-border bg-card">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h3 className="text-base font-bold text-textMain">
                                    {activeTypeData.typeName} · {AttributeNames[activeTypeData.attribute] || activeTypeData.attribute}
                                </h3>
                            </div>
                            <div className="flex bg-slate-200/40 dark:bg-black/20 p-1 rounded-xl border border-slate-300/60 dark:border-border/60 w-max gap-1 shadow-sm backdrop-blur-sm">
                                <button
                                    onClick={() => setMetric('attributeValue')}
                                    className={clsx(
                                        'px-5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95',
                                        metric === 'attributeValue'
                                            ? 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30'
                                            : 'text-slate-500 dark:text-textSub hover:text-slate-800 dark:hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent'
                                    )}
                                >
                                    属性值
                                </button>
                                <button
                                    onClick={() => setMetric('provideExp')}
                                    className={clsx(
                                        'px-5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95',
                                        metric === 'provideExp'
                                            ? 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30'
                                            : 'text-slate-500 dark:text-textSub hover:text-slate-800 dark:hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent'
                                    )}
                                >
                                    吞噬经验
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                        {(activeTypeData.qualityLevels || []).map((qualityNode: any) => {
                            const qualityMeta = qualities.find((quality: any) => quality.quality === qualityNode.quality);
                            const style = QualityStyles[qualityNode.quality] || 'text-textMain border-border bg-surface';
                            const maxLevel = qualityNode.levels?.at(-1);

                            return (
                                <div key={qualityNode.quality} className={clsx('rounded-xl border p-4 bg-slate-500/[0.01] dark:bg-white/[0.01]', style)}>
                                    <div className="text-[10px] uppercase tracking-widest opacity-80 mb-2">{QualityNames[qualityNode.quality] || qualityNode.quality}</div>
                                    <div className="text-base font-bold mb-1">{qualityNode.name}</div>
                                    <div className="text-xs opacity-80 leading-relaxed font-mono">升级经验 {qualityMeta?.upLevelExp?.toLocaleString?.() || '-'}</div>
                                    <div className="text-xs opacity-80 leading-relaxed font-mono">64级属性 {maxLevel?.attributeValue?.toLocaleString?.() || '-'}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="bg-slate-500/[0.04] dark:bg-white/[0.02] border-b border-border/40 text-[10px] uppercase tracking-wider text-textSub text-center">
                                        <th className="px-4 py-3 font-semibold whitespace-nowrap">Lv.</th>
                                        <th className="px-4 py-3 font-semibold whitespace-nowrap">角色等级</th>
                                        {qualities.map((quality: any) => (
                                            <th key={quality.quality} className="px-4 py-3 font-semibold whitespace-nowrap">
                                                {QualityNames[quality.quality] || quality.quality}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/20 font-mono text-center">
                                    {levelRows.map((row: any) => (
                                        <tr key={row.level} className="hover:bg-purple-500/[0.02] transition-colors duration-150">
                                            <td className="px-4 py-2.5 text-textMain font-bold">{row.level}</td>
                                            <td className="px-4 py-2.5 text-textSub">{row.roleLevel}</td>
                                            {qualities.map((quality: any) => (
                                                <td key={quality.quality} className="px-4 py-2.5 text-textMain">
                                                    {row[`q${quality.quality}`] != null ? Number(row[`q${quality.quality}`]).toLocaleString() : '-'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
