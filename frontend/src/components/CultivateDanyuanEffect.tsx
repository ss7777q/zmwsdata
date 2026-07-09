import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useDataFiles } from '../hooks/useGameData';

interface Props {
    dataSources: Record<string, { data?: unknown } | undefined>;
}

interface DanyuanEffectData {
    families?: DanyuanFamilyIndexEntry[];
    warnings?: DanyuanWarning[];
}

interface DanyuanFamilyIndexEntry {
    familyId: number;
    fileName: string;
    name: string;
    innerTypeName?: string | null;
    tags?: string[];
    summary: string;
    levelCount?: number;
    qualityCount?: number;
    maxLevel?: number | null;
}

interface DanyuanFamily {
    familyId: number;
    name: string;
    innerTypeName?: string | null;
    tags?: string[];
    summary: string;
    detail: string[];
    clarification: string[];
    levelGrowth: string;
    qualityGrowth: string;
    qualityDifference: string;
    focus?: string[];
    qualityTable?: DanyuanQualityTable | null;
    levelValueColumns?: DanyuanLevelValueColumn[];
    qualities: DanyuanQuality[];
    maxLevel?: number | null;
    sampleDescriptions?: string[];
    levels: DanyuanLevel[];
    warnings?: DanyuanWarning[];
}

interface DanyuanQuality {
    quality: number;
    name: string;
}

interface DanyuanQualityTable {
    title?: string;
    columns: DanyuanQualityTableColumn[];
    rows: DanyuanQualityTableRow[];
}

interface DanyuanQualityTableColumn {
    key: string;
    label: string;
}

interface DanyuanQualityTableRow {
    quality: string;
    [key: string]: string | number | undefined;
}

interface DanyuanLevelValueColumn {
    key: string;
    label: string;
}

interface DanyuanLevel {
    level: number;
    qualities: Record<string, DanyuanQualityLevel | undefined>;
}

interface DanyuanQualityLevel {
    id: number;
    quality: number;
    qualityName: string;
    name: string;
    skillDesc?: string | null;
    effectValues?: DanyuanEffectValue[];
    qualityEffectValues?: DanyuanEffectValue[];
    limit?: DanyuanLimit | null;
    mechanics?: DanyuanMechanic[];
}

interface DanyuanEffectValue {
    label: string;
    value: string;
    source?: 'skillDesc' | 'mechanic' | 'buff' | string;
}

interface LevelColumnGroup {
    quality: number;
    name: string;
    columns: LevelDisplayColumn[];
}

interface LevelDisplayColumn {
    key: string;
    label: string;
    sourceLabel: string;
    mode: 'value' | 'fixed';
}

interface DanyuanLimit {
    innerTypeName?: string | null;
    value?: number | null;
}

interface DanyuanMechanic {
    id: number;
    name?: string | null;
    label: string;
    chargedNumber?: number | null;
    effects?: DanyuanEffect[];
    relatedBuffs?: RelatedBuff[];
}

interface DanyuanEffect {
    key?: string;
    label: string;
    value?: string | null;
}

interface RelatedBuff {
    id: number;
    name?: string | null;
    text?: string | null;
    timeText?: string | null;
    intervalText?: string | null;
    maxPiles?: number | null;
}

interface DanyuanWarning {
    code: string;
    detail: string;
}

const InnerTypeStyles: Record<string, string> = {
    阴: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-500 dark:text-cyan-400',
    阳: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

function toDataSource(value: { data?: unknown } | undefined): DanyuanEffectData | null {
    if (!value || typeof value.data !== 'object' || value.data == null) return null;
    return value.data as DanyuanEffectData;
}

function toFamilySource(value: { data?: unknown } | undefined): DanyuanFamily | null {
    if (!value || typeof value.data !== 'object' || value.data == null) return null;
    return value.data as DanyuanFamily;
}

function effectValuesOf(payload: DanyuanQualityLevel | null | undefined) {
    return Array.isArray(payload?.effectValues) ? payload.effectValues : [];
}

function stripMetricPrefix(label: string) {
    const parts = label.split('·');
    return (parts.at(-1) ?? label).trim();
}

function fixedPartOf(value: string | null | undefined) {
    const text = String(value ?? '').trim();
    const percentFirst = text.match(/^-?\d+(?:\.\d+)?%\s*\+\s*(-?\d+(?:\.\d+)?)$/);
    if (percentFirst) return percentFirst[1];
    const fixedFirst = text.match(/^(-?\d+(?:\.\d+)?)\s*\+\s*-?\d+(?:\.\d+)?%最大生命$/);
    return fixedFirst?.[1] ?? null;
}

function percentPartOf(value: string | null | undefined) {
    const text = String(value ?? '').trim();
    const percentFirst = text.match(/^(-?\d+(?:\.\d+)?)%\s*\+\s*-?\d+(?:\.\d+)?$/);
    if (percentFirst) return percentFirst[1];
    const fixedFirst = text.match(/^-?\d+(?:\.\d+)?\s*\+\s*(-?\d+(?:\.\d+)?)%最大生命$/);
    return fixedFirst?.[1] ?? null;
}

function levelValueFor(payload: DanyuanQualityLevel | null | undefined, sourceLabel: string) {
    return effectValuesOf(payload).find((item) => item.label === sourceLabel) ?? null;
}

function displayLevelValue(payload: DanyuanQualityLevel | null | undefined, column: LevelDisplayColumn) {
    const value = levelValueFor(payload, column.sourceLabel);
    if (!value) return null;
    return column.mode === 'fixed' ? fixedPartOf(value.value) : value.value;
}

function makeFixedColumnLabel(sourceLabel: string) {
    const metric = stripMetricPrefix(sourceLabel);
    if (/常驻每层攻击/.test(sourceLabel)) return '常驻每层攻击固定值';
    if (/无双爆发攻击/.test(sourceLabel)) return '无双爆发攻击固定值';
    if (/常驻每层生命上限/.test(sourceLabel)) return '常驻每层生命固定值';
    if (/无双爆发生命上限/.test(sourceLabel)) return '无双爆发生命固定值';
    if (/常驻每层空中穿透/.test(sourceLabel)) return '常驻每层空中穿透固定值';
    if (/无双爆发空中穿透/.test(sourceLabel)) return '无双爆发空中穿透固定值';
    if (/攻击/.test(metric)) return '攻击固定值';
    if (/防御/.test(metric)) return /降低/.test(sourceLabel) ? '防御降低固定值' : '防御固定值';
    if (/穿透/.test(metric)) return '穿透固定值';
    if (/伤害/.test(metric)) return '伤害固定值';
    if (/单层回血/.test(metric)) return '单层回血固定值';
    if (/生命|回血|回复/.test(metric)) return '回复固定值';
    return `${metric}固定值`;
}

function hasQualityFixedCoefficient(family: DanyuanFamily, sourceLabel: string) {
    for (const quality of family.qualities) {
        const percentParts = new Set<string>();
        let matched = 0;
        for (const level of family.levels) {
            const value = levelValueFor(level.qualities[String(quality.quality)], sourceLabel)?.value;
            const percent = percentPartOf(value);
            if (percent == null) return false;
            percentParts.add(percent);
            matched += 1;
        }
        if (matched === 0 || percentParts.size !== 1) return false;
    }
    return true;
}

function buildLevelColumnGroups(family: DanyuanFamily): LevelColumnGroup[] {
    const rawColumns = Array.isArray(family.levelValueColumns) && family.levelValueColumns.length > 0
        ? family.levelValueColumns
        : [...new Map(family.levels.flatMap((level) => (
            Object.values(level.qualities).flatMap((payload) => effectValuesOf(payload).map((item) => [item.label, { key: item.label, label: item.label }] as const))
        ))).values()];

    const columns = rawColumns.map((column) => {
        const fixedMode = hasQualityFixedCoefficient(family, column.label);
        return {
            key: column.key,
            sourceLabel: column.label,
            label: fixedMode ? makeFixedColumnLabel(column.label) : stripMetricPrefix(column.label),
            mode: fixedMode ? 'fixed' : 'value'
        } satisfies LevelDisplayColumn;
    });

    const canMergeQualities = family.qualities.length > 1 && family.levels.every((level) => {
        const [baseQuality, ...otherQualities] = family.qualities;
        const basePayload = level.qualities[String(baseQuality.quality)];
        if (!basePayload) return false;
        return columns.every((column) => {
            const baseValue = displayLevelValue(basePayload, column);
            if (baseValue == null) return false;
            return otherQualities.every((quality) => {
                const payload = level.qualities[String(quality.quality)];
                return payload ? displayLevelValue(payload, column) === baseValue : false;
            });
        });
    });

    if (canMergeQualities) {
        return [{
            quality: family.qualities[0].quality,
            name: '全部品质',
            columns
        }];
    }

    return family.qualities.map((quality) => ({
        quality: quality.quality,
        name: quality.name,
        columns
    }));
}

function renderLevelCell(payload: DanyuanQualityLevel | null | undefined, column: LevelDisplayColumn) {
    const displayValue = displayLevelValue(payload, column);
    if (displayValue == null) {
        const value = levelValueFor(payload, column.sourceLabel);
        return value ? <span className="text-amber-500/80 font-bold">格式异常</span> : <span className="text-amber-500/80 font-bold">缺失</span>;
    }
    return displayValue;
}

export default function CultivateDanyuanEffect({ dataSources }: Props) {
    const effectData = toDataSource(dataSources.role_danyuan_effect_index);
    const families = useMemo(() => {
        const sourceFamilies = Array.isArray(effectData?.families) ? effectData.families : [];
        return [...sourceFamilies].sort((a, b) => a.familyId - b.familyId);
    }, [effectData]);

    const [selectedFamilyId, setSelectedFamilyId] = useState<number | null>(null);
    const activeFamilyIndex = useMemo(() => {
        return families.find((item) => item.familyId === selectedFamilyId) ?? families[0] ?? null;
    }, [families, selectedFamilyId]);
    const activeFamilyFileName = activeFamilyIndex?.fileName ?? '';
    const detailResult = useDataFiles(activeFamilyFileName ? [activeFamilyFileName] : [], Boolean(activeFamilyFileName));
    const activeFamily = useMemo(
        () => toFamilySource(detailResult.dataSources[activeFamilyFileName]),
        [activeFamilyFileName, detailResult.dataSources]
    );
    const levelColumnGroups = useMemo(() => activeFamily ? buildLevelColumnGroups(activeFamily) : [], [activeFamily]);
    const levelColumnCount = levelColumnGroups.reduce((sum, group) => sum + group.columns.length, 0);
    const detailParagraphs = activeFamily ? [...(activeFamily.detail ?? []), ...(activeFamily.clarification ?? [])] : [];

    if (!effectData || families.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-surface/50 py-20">
                <div className="relative flex items-center justify-center w-12 h-12 mb-3">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-slate-500/10 animate-ping opacity-60"></span>
                    <div className="relative inline-flex rounded-full h-8 w-8 bg-slate-500/15 border border-slate-500/30 items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"></span>
                    </div>
                </div>
                <h3 className="text-sm font-semibold tracking-wider text-textSub">未获取到丹元效果索引 (role_danyuan_effect_index)</h3>
            </div>
        );
    }

    const detailErrorMessage = activeFamilyFileName && detailResult.errors[activeFamilyFileName]
        ? `${activeFamilyFileName}.json：${detailResult.errors[activeFamilyFileName]}`
        : '';

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-stretch">
                {/* 左侧列表 */}
                <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card shadow-sm xl:h-0 xl:min-h-[720px] overflow-hidden">
                    <div className="border-b border-border/60 bg-slate-500/[0.02] dark:bg-white/[0.01] px-4 py-3.5">
                        <div className="text-xs font-bold tracking-wider text-textMain uppercase">
                            丹元列表
                        </div>
                    </div>
                    <div className="max-h-[640px] overflow-auto p-3.5 custom-scrollbar xl:max-h-none xl:flex-1 xl:min-h-0 space-y-2">
                        {families.map((family) => {
                            const selected = family.familyId === activeFamilyIndex?.familyId;
                            const innerStyle = family.innerTypeName ? InnerTypeStyles[family.innerTypeName] : null;
                            return (
                                <button
                                    key={family.familyId}
                                    onClick={() => setSelectedFamilyId(family.familyId)}
                                    className={clsx(
                                        'w-full rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.99]',
                                        selected
                                            ? 'border-purple-500/40 bg-purple-500/10 dark:bg-purple-950/20 shadow-sm shadow-purple-500/5'
                                            : 'border-transparent bg-slate-500/[0.02] dark:bg-white/[0.01] hover:border-slate-300/50 dark:hover:border-slate-800/80 hover:bg-slate-500/[0.04]'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className={clsx("truncate text-sm font-bold transition-colors", selected ? "text-purple-600 dark:text-purple-400" : "text-textMain")}>{family.name}</div>
                                            <div className="mt-1 text-xs leading-5 text-textSub truncate">{family.summary}</div>
                                        </div>
                                        <ChevronRight className={clsx('mt-0.5 h-4 w-4 shrink-0 transition-colors', selected ? 'text-purple-500' : 'text-textSub/50')} />
                                    </div>
                                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                                        {innerStyle && <span className={clsx('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', innerStyle)}>{family.innerTypeName}</span>}
                                        {(family.tags ?? []).slice(0, 2).map((tag) => (
                                            <span key={tag} className="rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 px-2 py-0.5 text-[10px] text-textSub font-medium">{tag}</span>
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 右侧详情 */}
                {detailErrorMessage ? (
                    <div className="card min-h-[360px] border border-dashed border-red-300 bg-red-50/70 py-20 text-center dark:border-red-500/40 dark:bg-red-500/10">
                        <h3 className="text-xl font-medium text-red-700 dark:text-red-200">丹元效果详情加载失败</h3>
                        <p className="mt-2 text-sm text-red-600/80 dark:text-red-100/80">{detailErrorMessage}</p>
                    </div>
                ) : !activeFamily ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-surface/50 py-20">
                        <div className="relative flex items-center justify-center w-12 h-12 mb-3">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-slate-500/10 animate-ping opacity-60"></span>
                            <div className="relative inline-flex rounded-full h-8 w-8 bg-slate-500/15 border border-slate-500/30 items-center justify-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"></span>
                            </div>
                        </div>
                        <h3 className="text-sm font-semibold tracking-wider text-textSub">正在加载丹元效果详情...</h3>
                    </div>
                ) : (
                    <div className="space-y-5 min-w-0 flex-1">
                        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <h3 className="text-xl font-bold text-textMain">{activeFamily.name}</h3>
                                        {activeFamily.innerTypeName && (
                                            <span className={clsx('rounded-md border px-2 py-0.5 text-[10px] font-bold', InnerTypeStyles[activeFamily.innerTypeName] ?? 'border-border bg-textMain/5 text-textSub')}>
                                                {activeFamily.innerTypeName}丹元
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-2 text-xs leading-6 text-textSub/90">{activeFamily.summary}</p>
                                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                                        {(activeFamily.tags ?? []).map((tag) => (
                                            <span key={tag} className="rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 px-2 py-0.5 text-[10px] text-textSub font-medium">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
                                <div className="rounded-xl border border-border/60 bg-slate-500/[0.01] dark:bg-white/[0.01] p-4.5 space-y-3.5">
                                    <div className="text-xs font-bold text-textMain border-b border-border/40 pb-2.5 uppercase tracking-wider">
                                        详细说明
                                    </div>
                                    <div className="space-y-3 text-xs leading-relaxed text-textSub/90">
                                        {detailParagraphs.map((item) => <p key={item}>{item}</p>)}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-slate-500/[0.01] dark:bg-white/[0.01] p-4.5 space-y-3.5">
                                    <div className="text-xs font-bold text-textMain border-b border-border/40 pb-2.5 uppercase tracking-wider">
                                        关注项
                                    </div>
                                    <div className="flex flex-wrap gap-2.5 pt-1">
                                        {(activeFamily.focus ?? []).map((item) => (
                                            <span key={item} className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-xs text-purple-600 dark:text-purple-400 font-semibold">{item}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {activeFamily.qualityTable && (
                                <div className="rounded-xl border border-border/60 bg-slate-500/[0.01] dark:bg-white/[0.01] p-4.5">
                                    <div className="text-xs font-bold text-textMain pb-3.5 uppercase tracking-wider">{activeFamily.qualityTable.title ?? '品质数值'}</div>
                                    <div className="overflow-x-auto custom-scrollbar">
                                        <table className="w-full min-w-[560px] text-center text-xs">
                                            <thead>
                                                <tr className="border-b border-border/40 text-[10px] text-textSub uppercase tracking-wider">
                                                    <th className="px-3 py-2.5 font-semibold">品质</th>
                                                    {activeFamily.qualityTable.columns.map((column) => (
                                                        <th key={column.key} className="border-l border-border/20 px-3 py-2.5 font-semibold">{column.label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/20">
                                                {activeFamily.qualityTable.rows.map((row) => (
                                                    <tr key={row.quality} className="hover:bg-purple-500/[0.01] transition-colors duration-150">
                                                        <td className="px-3 py-2.5 font-bold text-textMain">{row.quality}</td>
                                                        {activeFamily.qualityTable?.columns.map((column) => (
                                                            <td key={column.key} className="border-l border-border/20 px-3 py-2.5 font-mono text-textSub">{row[column.key] ?? '缺失'}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <div className="rounded-xl border border-border bg-slate-500/[0.02] dark:bg-white/[0.01] px-4 py-3.5">
                                    <div className="text-[10px] font-bold text-textSub/85 uppercase tracking-wider">升级提升</div>
                                    <div className="mt-2 text-xs leading-relaxed text-textMain">{activeFamily.levelGrowth}</div>
                                </div>
                                <div className="rounded-xl border border-border bg-slate-500/[0.02] dark:bg-white/[0.01] px-4 py-3.5">
                                    <div className="text-[10px] font-bold text-textSub/85 uppercase tracking-wider">升品质改变</div>
                                    <div className="mt-2 text-xs leading-relaxed text-textMain">{activeFamily.qualityGrowth}</div>
                                </div>
                                <div className="rounded-xl border border-border bg-slate-500/[0.02] dark:bg-white/[0.01] px-4 py-3.5">
                                    <div className="text-[10px] font-bold text-textSub/85 uppercase tracking-wider">品质差别</div>
                                    <div className="mt-2 text-xs leading-relaxed text-textMain">{activeFamily.qualityDifference}</div>
                                </div>
                            </div>
                        </div>

                        {/* 下方等级表 */}
                        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                            <div className="border-b border-border/60 bg-slate-500/[0.02] dark:bg-white/[0.01] px-5 py-3.5">
                                <div className="text-xs font-bold tracking-wider text-textMain uppercase">
                                    等级效果表
                                </div>
                            </div>
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full min-w-[900px] text-center text-xs">
                                    <thead>
                                        <tr className="border-b border-border/40 bg-slate-500/[0.04] dark:bg-white/[0.02] text-[10px] uppercase tracking-wider text-textSub">
                                            <th rowSpan={2} className="sticky left-0 z-10 bg-card px-4 py-3 font-semibold">Lv.</th>
                                            {levelColumnGroups.map((group) => (
                                                <th key={group.quality} colSpan={Math.max(group.columns.length, 1)} className="border-l border-border/20 px-4 py-3 text-center font-semibold">
                                                    {group.name}
                                                </th>
                                            ))}
                                        </tr>
                                        <tr className="border-b border-border/40 bg-slate-500/[0.02] dark:bg-white/[0.01] text-[10px] text-textSub">
                                            {levelColumnGroups.map((group) => (
                                                group.columns.length > 0 ? group.columns.map((column) => (
                                                    <th key={`${group.quality}-${column.key}`} className="border-l border-border/20 px-4 py-2 font-medium">
                                                        {column.label}
                                                    </th>
                                                )) : (
                                                    <th key={`${group.quality}-empty`} className="border-l border-border/20 px-4 py-2 font-medium">-</th>
                                                )
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/20">
                                        {levelColumnCount > 0 ? activeFamily.levels.map((level) => (
                                            <tr key={level.level} className="hover:bg-purple-500/[0.02] transition-colors duration-150">
                                                <td className="sticky left-0 z-10 bg-card px-4 py-3 font-mono font-bold text-textMain text-xs">Lv.{level.level}</td>
                                                {levelColumnGroups.map((group) => {
                                                    const payload = level.qualities[String(group.quality)];
                                                    return group.columns.map((column) => (
                                                        <td key={`${group.quality}-${column.key}`} className="min-w-[120px] border-l border-border/20 px-4 py-3 align-top font-mono text-[11px] leading-5 text-textSub">
                                                            {payload ? renderLevelCell(payload, column) : <span className="text-amber-500/80 font-bold">缺失</span>}
                                                        </td>
                                                    ));
                                                })}
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={1 + Math.max(levelColumnCount, 1)} className="px-4 py-8 text-center text-sm text-textSub">
                                                    当前没有解析出同品质内随等级变化的数值。
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
