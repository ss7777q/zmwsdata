import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Activity, BarChart3, Shield } from 'lucide-react';

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
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/10 rounded-xl bg-surface/50">
                <Shield className="w-12 h-12 text-textSub mb-4 opacity-50" />
                <h3 className="text-xl text-textSub font-medium tracking-wider">未获取到炼体卷轴 (role_xianpo)</h3>
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
                                'text-left rounded-xl border p-4 transition-all duration-300',
                                selected
                                    ? 'border-primary/50 bg-primary/15 shadow-lg shadow-primary/10'
                                    : 'border-border bg-surface hover:border-textSub/30 hover:-translate-y-0.5'
                            )}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs uppercase tracking-widest text-textSub">类型 {typeNode.type}</span>
                                <Activity className={clsx('w-4 h-4', selected ? 'text-cta' : 'text-textSub')} />
                            </div>
                            <div className="text-lg font-bold text-textMain">{typeNode.typeName}</div>
                            <div className="text-sm text-textSub mt-1">{AttributeNames[typeNode.attribute] || typeNode.attribute}</div>
                            <div className="text-xs text-textSub mt-3">
                                红64属性 {maxRed?.attributeValue?.toLocaleString?.() ?? '-'}
                            </div>
                        </button>
                    );
                })}
            </div>

            {activeTypeData && (
                <>
                    <div className="card">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-textMain flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-cta" />
                                    {activeTypeData.typeName} · {AttributeNames[activeTypeData.attribute] || activeTypeData.attribute}
                                </h3>
                            </div>
                            <div className="flex gap-2 p-1 bg-black/20 border border-border rounded-lg w-max">
                                <button
                                    onClick={() => setMetric('attributeValue')}
                                    className={clsx(
                                        'px-4 py-2 rounded-md text-sm font-bold transition-all',
                                        metric === 'attributeValue' ? 'bg-primary text-white' : 'text-textSub hover:text-textMain hover:bg-white/5'
                                    )}
                                >
                                    属性值
                                </button>
                                <button
                                    onClick={() => setMetric('provideExp')}
                                    className={clsx(
                                        'px-4 py-2 rounded-md text-sm font-bold transition-all',
                                        metric === 'provideExp' ? 'bg-cta text-white' : 'text-textSub hover:text-textMain hover:bg-white/5'
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
                                <div key={qualityNode.quality} className={clsx('rounded-xl border p-4', style)}>
                                    <div className="text-xs uppercase tracking-widest opacity-80 mb-2">{QualityNames[qualityNode.quality] || qualityNode.quality}</div>
                                    <div className="text-lg font-bold mb-1">{qualityNode.name}</div>
                                    <div className="text-sm opacity-80">升级经验 {qualityMeta?.upLevelExp?.toLocaleString?.() || '-'}</div>
                                    <div className="text-sm opacity-80">64级属性 {maxLevel?.attributeValue?.toLocaleString?.() || '-'}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="card overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead>
                                <tr className="bg-textMain/5 text-textSub text-xs uppercase tracking-wider border-b border-border">
                                    <th className="px-4 py-3 font-medium">Lv.</th>
                                    <th className="px-4 py-3 font-medium">角色等级</th>
                                    {qualities.map((quality: any) => (
                                        <th key={quality.quality} className="px-4 py-3 font-medium">
                                            {QualityNames[quality.quality] || quality.quality}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {levelRows.map((row: any) => (
                                    <tr key={row.level} className="hover:bg-textMain/5 transition-colors">
                                        <td className="px-4 py-2.5 font-mono text-textMain font-medium">{row.level}</td>
                                        <td className="px-4 py-2.5 font-mono text-textSub">{row.roleLevel}</td>
                                        {qualities.map((quality: any) => (
                                            <td key={quality.quality} className="px-4 py-2.5 font-mono text-textMain">
                                                {row[`q${quality.quality}`] != null ? Number(row[`q${quality.quality}`]).toLocaleString() : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
