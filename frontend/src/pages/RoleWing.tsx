import { useState, useMemo } from 'react';
import { Feather, ArrowUpCircle, Settings, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import CostBadge from '../components/ui/CostBadge';

interface RoleWingProps {
    dataSources: Record<string, any>;
}

export default function RoleWing({ dataSources }: RoleWingProps) {
    const wingData = dataSources['role_wing_upgrade']?.data || [];
    const _featherAdvanceData = dataSources['role_feather_advance']?.data || [];
    const _featherBaptizeData = dataSources['role_feather_baptize']?.data || [];
    const _featherLuckData = dataSources['role_feather_luck']?.data || [];

    const [activeTab, setActiveTab] = useState<'wing' | 'feather'>('wing');

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
            <div className="flex border-b border-border max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar">
                <button
                    onClick={() => setActiveTab('wing')}
                    className={clsx(
                        "px-6 py-4 font-semibold text-lg transition-all border-b-2 flex items-center gap-2 whitespace-nowrap",
                        activeTab === 'wing' ? "border-primary text-primary" : "border-transparent text-textSub hover:text-textMain"
                    )}
                >
                    <ArrowUpCircle className="w-5 h-5" />
                    翅膀升级
                </button>
                <button
                    onClick={() => setActiveTab('feather')}
                    className={clsx(
                        "px-6 py-4 font-semibold text-lg transition-all border-b-2 flex items-center gap-2 whitespace-nowrap",
                        activeTab === 'feather' ? "border-cyan-500 text-cyan-500" : "border-transparent text-textSub hover:text-textMain"
                    )}
                >
                    <Feather className="w-5 h-5" />
                    羽毛系统
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'wing' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in fade-in">
                    {wings.map((wing: any) => (
                        <div key={wing.buteId} className="card p-6 flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        <ArrowUpCircle className="w-5 h-5 text-primary" />
                                        {wing.wingName}
                                    </h3>
                                    <p className="text-sm text-textSub mt-1">最大等级: Lv.{wing.maxLevel}</p>
                                </div>
                                <div className={clsx("px-2 py-1 rounded text-xs font-bold border",
                                    wing.maxQuality >= 6 ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                        wing.maxQuality === 5 ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                                            "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                )}>
                                    品质: {wing.maxQuality} 阶
                                </div>
                            </div>

                            <div className="bg-surface p-4 rounded-xl border border-border">
                                <span className="text-xs text-textSub mb-2 block font-bold">1 ~ 满级总代价:</span>
                                <div className="flex flex-wrap gap-2">
                                    {wing.totalCost.map((c: any, i: number) => (
                                        <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={() => toggleWingExpand(wing.buteId)}
                                className="w-full py-2 bg-surface hover:bg-black/20 rounded-lg text-sm font-medium transition-colors border border-border"
                            >
                                {expandedWingIds[wing.buteId] ? '收起每级明细' : '查看每级升级明细'}
                            </button>

                            <div className={clsx(
                                "grid gap-2 overflow-hidden transition-all duration-300",
                                expandedWingIds[wing.buteId] ? "max-h-[800px] overflow-y-auto custom-scrollbar opacity-100" : "max-h-0 opacity-0"
                            )}>
                                {wing.levels?.map((lv: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center p-2 rounded bg-black/10 border border-border/40">
                                        <div className="flex items-center gap-3">
                                            <span className="w-12 text-xs font-mono text-textSub">Lv.{lv.wingLevel}</span>
                                            {lv.consume ? (
                                                <CostBadge itemId={lv.consume.itemId} name={lv.consume.name} count={lv.consume.count} />
                                            ) : (
                                                <span className="text-xs text-textSub italic">已满级</span>
                                            )}
                                        </div>
                                        {lv.roleLevelRequired && (
                                            <div className="text-[10px] text-orange-400 font-mono text-right">
                                                需角色 {lv.roleLevelRequired} 级
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
                        <div key={f.id} className="card p-6 flex flex-col gap-4 border border-cyan-500/20 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-all pointer-events-none">
                                <Feather className="w-32 h-32 text-cyan-500" />
                            </div>

                            <div className="flex justify-between items-center relative">
                                <h3 className="text-xl font-bold flex items-center gap-2 text-cyan-400">
                                    <Feather className="w-5 h-5" /> {f.name}
                                </h3>
                                <div className={clsx("px-2 py-1 rounded text-xs font-bold border",
                                    f.quality >= 6 ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                        f.quality === 5 ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                                            "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                )}>
                                    品质: {f.quality} 阶
                                </div>
                            </div>

                            {/* Section 1: 羽毛进阶 (Advance) */}
                            <div className="bg-surface p-3 rounded-lg border border-border/50 relative">
                                <h4 className="text-xs font-bold text-textSub flex items-center gap-1.5 mb-3 uppercase tracking-wider">
                                    <ArrowUpCircle className="w-3.5 h-3.5" /> 本命进阶
                                </h4>
                                <div className="flex flex-col gap-2">
                                    {f.advance.nextCost.length > 0 ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-textSub w-16">升级消耗:</span>
                                            <div className="flex gap-2">
                                                {f.advance.nextCost.map((c: any, i: number) => <CostBadge key={i} itemId={c.itemId} name={c.name} count={c.count} />)}
                                                {f.advance.moneyCost.map((c: any, i: number) => <CostBadge key={`m_${i}`} itemId={c.itemId} name={c.name} count={c.count} />)}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-green-400 text-center py-2 bg-green-500/10 rounded">羽阶已至大圆满境界</div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={() => toggleFeatherExpand(f.id)}
                                className="w-full py-2 bg-surface hover:bg-black/20 rounded-lg text-sm font-medium transition-colors border border-cyan-500/20 text-cyan-400 flex items-center justify-center gap-1"
                            >
                                {expandedFeatherIds[f.id] ? <><ChevronUp className="w-4 h-4" />收起洗练详情</> : <><ChevronDown className="w-4 h-4" />展示羽枝洗炼与强运花费</>}
                            </button>

                            <div className={clsx(
                                "grid gap-4 transition-all duration-300",
                                expandedFeatherIds[f.id] ? "max-h-[1000px] opacity-100 mt-2" : "max-h-0 opacity-0 m-0 overflow-hidden"
                            )}>
                                {/* Section 2: 羽枝洗练 (Baptize) */}
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
                                    <h4 className="text-xs font-bold text-blue-400 flex items-center gap-1.5 uppercase tracking-wider">
                                        <Settings className="w-3.5 h-3.5" /> 基础祭炼单次消耗
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
                                                    <div key={target.k} className="flex flex-col gap-1.5 p-2 rounded border border-white/5">
                                                        <span className="text-[10px] text-textSub leading-tight">{target.l}</span>
                                                        <div className="flex flex-wrap gap-2">
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
                                                    <div key={target.k} className="flex flex-col gap-1.5 p-2 rounded border border-white/5">
                                                        <span className="text-[10px] text-textSub leading-tight">{target.l}</span>
                                                        <div className="flex flex-wrap gap-2">
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
                                <div className="bg-black/20 p-3 rounded-lg border border-orange-500/10 space-y-3">
                                    <h4 className="text-xs font-bold text-orange-400 flex items-center gap-1.5 uppercase tracking-wider">
                                        <Sparkles className="w-3.5 h-3.5" /> 强运洗练
                                    </h4>

                                    {f.luck.valuefixedCostLuck.length > 0 ? (
                                        <div className="space-y-2">
                                            <div className="flex flex-col gap-1 p-2 rounded border border-white/5">
                                                <span className="text-[10px] text-textSub">强运洗练:</span>
                                                <div className="flex flex-wrap gap-2">
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
        </div>
    );
}
