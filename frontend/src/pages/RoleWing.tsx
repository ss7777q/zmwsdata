import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import CostBadge from '../components/ui/CostBadge';
import { ChevronRight } from 'lucide-react';

const QUALITY_NAMES: Record<number, string> = {
    2: '优秀',
    3: '精良',
    4: '史诗',
    5: '传说',
    6: '上古'
};
import { EffectGrowthTable, type WingEffectDetail } from '../components/roleWing/WingEffectGrowthTable';

interface RoleWingProps {
    dataSources: Record<string, any>;
}

export default function RoleWing({ dataSources }: RoleWingProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const wingData = dataSources['role_wing_upgrade']?.data || [];
    const wingSkillData = (dataSources['role_wing_skill']?.data || []) as WingEffectDetail[];
    const _featherAdvanceData = dataSources['role_feather_advance']?.data || [];
    const _featherBaptizeData = dataSources['role_feather_baptize']?.data || [];
    const _featherLuckData = dataSources['role_feather_luck']?.data || [];

    const activeTab = location.pathname.endsWith('/feather')
        ? 'feather'
        : location.pathname.endsWith('/skill')
            ? 'skill'
            : 'wing';
    const [selectedWingId, setSelectedWingId] = useState<number | null>(null);

    // =========== 翅膀 Tab 逻辑 ===========
    const wings = useMemo(() => {
        return wingData.map((w: any) => ({
            ...w,
            maxLevel: w.levels?.[w.levels.length - 1]?.wingLevel || 0,
            maxQuality: w.levels?.[w.levels.length - 1]?.quality || 1,
            // 汇总满级总消耗 (过滤掉 null)
            totalCost: w.levels?.reduce((acc: any[], lv: any) => {
                if (lv.consume) {
                    const exist = acc.find(c => c.itemId === lv.consume.itemId);
                    if (exist) {
                        exist.count += lv.consume.count;
                    } else {
                        acc.push({ ...lv.consume });
                    }
                }
                return acc;
            }, []) || []
        }));
    }, [wingData]);

    const effectByButeId = useMemo(() => {
        return new Map(wingSkillData.map((effect) => [effect.buteId, effect]));
    }, [wingSkillData]);

    const activeWing = useMemo(() => {
        if (!wings.length) return null;
        if (selectedWingId !== null) {
            return wings.find((w: any) => w.buteId === selectedWingId) || null;
        }
        const featuredWing = wings.find((w: any) => effectByButeId.has(w.buteId));
        return featuredWing || wings[0] || null;
    }, [wings, selectedWingId, effectByButeId]);

    const activeEffect = useMemo(() => {
        if (!activeWing) return null;
        return effectByButeId.get(activeWing.buteId) || null;
    }, [activeWing, effectByButeId]);

    const [expandedWingIds, setExpandedWingIds] = useState<Record<number, boolean>>({});
    const toggleWingExpand = (id: number) => {
        setExpandedWingIds(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // =========== 羽毛 Tab 逻辑 ===========
    const feathers = useMemo(() => {
        if (!_featherAdvanceData.length) return [];

        return _featherAdvanceData.map((adv: any) => {
            const baptize = _featherBaptizeData.find((b: any) => b.id === adv.id);
            const luck = _featherLuckData.find((l: any) => l.id === adv.id);

            return {
                id: adv.id,
                name: adv.name,
                quality: adv.quality,
                advance: {
                    nextCost: adv.nextCost || [],
                    moneyCost: adv.moneyCost || []
                },
                baptize: {
                    allBaptizeCost: baptize?.allBaptizeCost || [],
                    valueBaptizeCost: baptize?.valueBaptizeCost || [],
                    fixedCost: baptize?.fixedCost || [],
                    valuefixedCost: baptize?.valuefixedCost || [],
                    typeBaptizeCost: baptize?.typeBaptizeCost || [],
                    typefixedCost: baptize?.typefixedCost || []
                },
                luck: {
                    valuefixedCostLuck: luck?.valuefixedCostLuck || [],
                    pointChangeCost: luck?.pointChangeCost || []
                }
            };
        });
    }, [_featherAdvanceData, _featherBaptizeData, _featherLuckData]);

    const [expandedFeatherIds, setExpandedFeatherIds] = useState<Record<number, boolean>>({});
    const toggleFeatherExpand = (id: number) => {
        setExpandedFeatherIds(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="space-y-6">
            {/* Top Navigation Tabs */}
            <div className="flex bg-slate-200/40 dark:bg-black/20 p-1 rounded-xl border border-slate-300/60 dark:border-border/60 w-max mb-6 gap-1 shadow-sm backdrop-blur-sm">
                <button
                    onClick={() => navigate('/user_wing/upgrade')}
                    className={clsx(
                        "px-6 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                        activeTab === 'wing'
                            ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                            : "text-textSub hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                    )}
                >
                    翅膀升级
                </button>
                <button
                    onClick={() => navigate('/user_wing/feather')}
                    className={clsx(
                        "px-6 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                        activeTab === 'feather'
                            ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                            : "text-textSub hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                    )}
                >
                    羽毛系统
                </button>
                <button
                    onClick={() => navigate('/user_wing/skill')}
                    className={clsx(
                        "px-6 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                        activeTab === 'skill'
                            ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                            : "text-textSub hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                    )}
                >
                    翅膀技能
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'wing' && (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 animate-fade-in fade-in">
                    {wings.map((wing: any) => (
                        <div key={wing.buteId} className="card p-6 flex flex-col gap-4 border border-border/80 hover:border-purple-500/20 hover:shadow-[0_8px_30px_rgba(168,85,247,0.06)] transition-all duration-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-base font-bold text-textMain transition-colors group-hover:text-purple-600 dark:group-hover:text-purple-400">
                                        {wing.wingName}
                                    </h3>
                                    <p className="text-xs text-textSub mt-1 font-medium">最大等级: Lv.{wing.maxLevel}</p>
                                </div>
                                <div className={clsx("px-2 py-0.5 rounded text-[10px] font-bold border",
                                    wing.maxQuality >= 6 ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                        wing.maxQuality === 5 ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                                            "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                )}>
                                    品质: {wing.maxQuality} 阶
                                </div>
                            </div>

                            <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 border-l-2 border-l-purple-500/50">
                                <span className="text-[10px] text-textSub mb-2 block font-bold uppercase tracking-wider">1 ~ 满级总代价</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {wing.totalCost.map((c: any, i: number) => (
                                        <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={() => toggleWingExpand(wing.buteId)}
                                className="w-full py-2 bg-slate-500/[0.02] dark:bg-white/[0.01] hover:bg-slate-500/[0.05] rounded-xl text-xs font-bold transition-all duration-200 border border-border active:scale-[0.99] cursor-pointer text-textMain"
                            >
                                {expandedWingIds[wing.buteId] ? '收起每级明细' : '查看每级升级明细'}
                            </button>

                            <div className={clsx(
                                "grid gap-2 overflow-hidden transition-all duration-300",
                                expandedWingIds[wing.buteId] ? "max-h-[800px] overflow-y-auto custom-scrollbar mt-1 opacity-100" : "max-h-0 opacity-0"
                            )}>
                                {wing.levels?.map((lv: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-slate-500/[0.04] dark:bg-black/20 border border-border/10">
                                        <div className="flex items-center gap-3">
                                            <span className="w-12 text-xs font-mono text-textSub">Lv.{lv.wingLevel}</span>
                                            {lv.consume ? (
                                                <CostBadge itemId={lv.consume.itemId} name={lv.consume.name} count={lv.consume.count} />
                                            ) : (
                                                <span className="text-xs text-textSub italic">已满级</span>
                                            )}
                                        </div>
                                        {lv.consume && lv.nextLevelRoleLevelRequired && (
                                            <div className="text-[10px] text-orange-400 font-mono text-right">
                                                升下级需角色 {lv.nextLevelRoleLevelRequired} 级
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'feather' && (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 animate-fade-in fade-in">
                    {feathers.map((f: any) => (
                        <div key={f.id} className="card p-6 flex flex-col gap-4 border border-border/80 hover:border-purple-500/20 hover:shadow-[0_8px_30px_rgba(168,85,247,0.06)] transition-all duration-200 relative overflow-hidden group">
                            <div className="flex justify-between items-center relative">
                                <h3 className="text-base font-bold text-textMain transition-colors group-hover:text-purple-600 dark:group-hover:text-purple-400">
                                    {f.name}
                                </h3>
                                <div className={clsx("px-2 py-0.5 rounded text-[10px] font-bold border",
                                    f.quality >= 6 ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                        f.quality === 5 ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                                            "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                )}>
                                    品质: {f.quality} 阶
                                </div>
                            </div>

                            {/* Section 1: 羽毛进阶 (Advance) */}
                            <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 relative border-l-2 border-l-purple-500/50">
                                <h4 className="text-[10px] font-bold text-textMain/80 flex items-center gap-1.5 mb-3 uppercase tracking-wider">
                                    本命进阶
                                </h4>
                                <div className="flex flex-col gap-2">
                                    {f.advance.nextCost.length > 0 ? (
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-textSub w-16">升级消耗:</span>
                                            <div className="flex gap-1.5">
                                                {f.advance.nextCost.map((c: any, i: number) => <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />)}
                                                {f.advance.moneyCost.map((c: any, i: number) => <CostBadge key={`m_${i}`} itemId={c.itemId} name={c.name} count={c.count} />)}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-green-500 dark:text-green-400 text-center py-2 bg-green-500/10 rounded">羽阶已至大圆满境界</div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={() => toggleFeatherExpand(f.id)}
                                className="w-full py-2 bg-slate-500/[0.02] dark:bg-white/[0.01] hover:bg-slate-500/[0.05] rounded-xl text-xs font-bold transition-all duration-200 border border-border active:scale-[0.99] cursor-pointer text-textMain"
                            >
                                {expandedFeatherIds[f.id] ? '收起洗练详情' : '展示羽枝洗炼与强运花费'}
                            </button>

                            <div className={clsx(
                                "grid gap-4 transition-all duration-300",
                                expandedFeatherIds[f.id] ? "max-h-[1000px] opacity-100 mt-2" : "max-h-0 opacity-0 m-0 overflow-hidden"
                            )}>
                                {/* Section 2: 羽枝洗练 (Baptize) */}
                                <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 border-l-2 border-l-indigo-500/50 space-y-3">
                                    <h4 className="text-[10px] font-bold text-textMain/80 flex items-center gap-1.5 uppercase tracking-wider">
                                        基础祭炼单次消耗
                                    </h4>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {[{ k: 'allBaptizeCost', l: '全部洗练' },
                                        { k: 'valueBaptizeCost', l: '范围洗练' },
                                        { k: 'fixedCost', l: '全部洗练 (锁词条)', baseK: 'allBaptizeCost' },
                                        { k: 'valuefixedCost', l: '范围洗练 (锁词条)', baseK: 'valueBaptizeCost' }
                                        ].map(target => {
                                            const maxLocks = Math.max(0, (f.luck.valuefixedCostLuck?.length || 0) - 1);
                                            if (!f.baptize[target.k] || f.baptize[target.k].length === 0) return null;

                                            if (target.baseK && maxLocks > 0) {
                                                const baseItems = f.baptize[target.baseK] || [];
                                                const incItems = f.baptize[target.k];
                                                return (
                                                    <div key={target.k} className="flex flex-col gap-1.5 p-2 rounded-lg border border-border/10 bg-slate-500/[0.02] dark:bg-black/10">
                                                        <span className="text-[10px] text-textSub font-medium leading-tight">{target.l}</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {Array.from({ length: maxLocks }).map((_, lockIndex) => {
                                                                const m = lockIndex + 1;
                                                                return incItems.map((inc: any, i: number) => {
                                                                    const baseItem = baseItems.find((b: any) => b.itemId === inc.itemId) || { count: 0 };
                                                                    const totalCount = baseItem.count + (inc.count * m);
                                                                    return <CostBadge key={`${m}-${i}`} itemId={inc.itemId} name={`锁${m}`} count={totalCount} />;
                                                                });
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            } else if (!target.baseK) {
                                                return (
                                                    <div key={target.k} className="flex flex-col gap-1.5 p-2 rounded-lg border border-border/10 bg-slate-500/[0.02] dark:bg-black/10">
                                                        <span className="text-[10px] text-textSub font-medium leading-tight">{target.l}</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {f.baptize[target.k].map((c: any, i: number) => (
                                                                <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}
                                    </div>
                                </div>

                                {/* Section 3: 强运洗练 (Luck) */}
                                <div className="bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 border-l-2 border-l-emerald-500/50 space-y-3">
                                    <h4 className="text-[10px] font-bold text-textMain/80 flex items-center gap-1.5 uppercase tracking-wider">
                                        强运洗练
                                    </h4>

                                    {f.luck.valuefixedCostLuck.length > 0 ? (
                                        <div className="space-y-2">
                                            <div className="flex flex-col gap-1 p-2 rounded-lg border border-border/10 bg-slate-500/[0.02] dark:bg-black/10">
                                                <span className="text-[10px] text-textSub font-medium">强运洗练:</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {f.luck.valuefixedCostLuck.map((c: any, i: number) => (
                                                        <CostBadge key={i} itemId={c.itemId} name={i === 0 ? '全部强运' : `锁${i}强运`} count={c.count} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-textSub">该低阶羽翼尚不支持强运法则。</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 翅膀技能 Tab */}
            {activeTab === 'skill' && (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-stretch animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* 左侧翅膀列表 */}
                    <div className="flex min-h-0 flex-col rounded-xl border border-border/80 bg-card shadow-sm xl:h-0 xl:min-h-[640px] overflow-hidden">
                        <div className="border-b border-border/60 bg-slate-500/[0.02] dark:bg-white/[0.01] px-4 py-3.5">
                            <div className="text-xs font-bold tracking-wider text-textMain uppercase">
                                翅膀列表
                            </div>
                        </div>
                        <div className="max-h-[500px] overflow-auto p-3.5 custom-scrollbar xl:max-h-none xl:flex-1 xl:min-h-0 space-y-2">
                            {wings.map((item: any) => {
                                const isSelected = item.buteId === activeWing?.buteId;
                                const effect = effectByButeId.get(item.buteId);

                                return (
                                    <button
                                        key={item.buteId}
                                        onClick={() => setSelectedWingId(item.buteId)}
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
                                                    {item.wingName}
                                                </div>
                                                <div className="mt-1.5 text-xs leading-5 text-textSub truncate">
                                                    {effect?.summary || '当前配置没有技能效果数据'}
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
                    {activeWing && (
                        <div className="space-y-5 min-w-0 flex-1">
                            {activeEffect ? (
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

                                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                                        {activeEffect.sections.map((section) => (
                                            <div key={section.title} className="rounded-xl border border-border/60 bg-slate-500/[0.01] dark:bg-white/[0.01] p-4.5 space-y-3.5">
                                                <div className="text-xs font-bold text-textMain border-b border-border/40 pb-2.5 uppercase tracking-wider">
                                                    {section.title}
                                                </div>
                                                <div className="space-y-3 text-xs leading-relaxed text-textSub/90">
                                                    {section.paragraphs.map((p, idx) => (
                                                        <p key={idx}>{p}</p>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {activeEffect.fixedMechanism.length > 0 && (
                                        <div className="rounded-xl border border-border/60 bg-slate-500/[0.01] dark:bg-white/[0.01] p-4.5">
                                            <div className="text-xs font-bold text-textMain border-b border-border/40 pb-2.5 uppercase tracking-wider">
                                                固定机制
                                            </div>
                                            <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                {activeEffect.fixedMechanism.map((item) => (
                                                    <div key={item.label} className="rounded-lg border border-border/30 bg-slate-500/[0.02] dark:bg-black/10 px-3 py-2.5">
                                                        <div className="text-[10px] font-bold tracking-wider text-textSub uppercase">{item.label}</div>
                                                        <div className="mt-1 text-xs leading-5 text-textMain">{item.value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeEffect.warnings && activeEffect.warnings.length > 0 && (
                                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-xs leading-6 text-amber-700 dark:text-amber-300">
                                            {activeEffect.warnings.map((warning, idx) => (
                                                <p key={idx}>{warning}</p>
                                            ))}
                                        </div>
                                    )}

                                    {activeEffect.growthTables.length > 0 && (
                                        <div className="grid grid-cols-1 gap-5">
                                            {activeEffect.growthTables.map((table) => (
                                                <EffectGrowthTable key={table.title} table={table} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* 其他翅膀占位 - 优雅虚线边框看板 */
                                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-slate-500/[0.01] dark:bg-white/[0.01] py-20 min-h-[560px] animate-in fade-in duration-300">
                                    <div className="relative flex items-center justify-center w-12 h-12 mb-5">
                                        <span className="absolute inline-flex h-full w-full rounded-full bg-purple-500/10 animate-ping opacity-60"></span>
                                        <div className="relative inline-flex rounded-full h-8 w-8 bg-purple-500/15 border border-purple-500/30 items-center justify-center">
                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                                        </div>
                                    </div>
                                    <h3 className="text-sm font-bold text-textMain">“{activeWing.wingName}”技能解析中</h3>
                                    <p className="text-xs text-textSub mt-2.5 max-w-xs text-center leading-relaxed opacity-75">
                                        当前导出数据尚未包含该羽翼的专属技能与附加机制。
                                    </p>
                                    <div className="mt-6 flex gap-1.5">
                                        <span className="px-2.5 py-0.5 rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 text-[10px] text-textSub font-mono">
                                            buteId: {activeWing.buteId}
                                        </span>
                                        <span className="px-2.5 py-0.5 rounded-md border border-border/50 bg-slate-500/[0.04] dark:bg-black/20 text-[10px] text-textSub font-mono">
                                            {QUALITY_NAMES[activeWing.maxQuality] || '优秀'}级羽翼
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
