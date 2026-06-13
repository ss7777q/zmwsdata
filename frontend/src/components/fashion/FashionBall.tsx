import React from 'react';
import CostBadge from '../ui/CostBadge';
import { clsx } from 'clsx';

interface Props {
    dataSources: Record<string, any>;
}

export default function FashionBall({ dataSources }: Props) {
    const ballData = dataSources['role_fashion_ball']?.data || [];

    // Attribute mapper to labels & colors
    const getAttrMeta = (key: string) => {
        const map: Record<string, { label: string, color: string }> = {
            atk: { label: '攻击', color: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20' },
            hp: { label: '生命', color: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20' },
            mp: { label: '魔法', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' },
            def: { label: '防御', color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20' },
            healMp: { label: '回魔', color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20' },
            healHp: { label: '回血', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
            hitVal: { label: '命中', color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20' },
            dodge: { label: '闪避', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20' },
            crit: { label: '暴击', color: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' },
            tenacity: { label: '韧性', color: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20' },
            lucky: { label: '幸运', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-500/20' },
            guardian: { label: '守护', color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20' }
        };
        return map[key] || { label: key, color: 'bg-slate-500/[0.04] text-textSub border-border/50' };
    };

    const processedData = React.useMemo(() => {
        let totalExp = 0;
        let totalYuanbao = 0;

        return ballData.map((rankGroup: any) => {
            const levels = rankGroup.levels.map((lvl: any) => {
                const stepCount = lvl.upResources?.count || 0;
                const itemId = lvl.upResources?.itemId;
                if (itemId === 6) totalExp += stepCount;
                if (itemId === 2) totalYuanbao += stepCount;

                return {
                    ...lvl,
                    totalExp,
                    totalYuanbao
                };
            });
            return { ...rankGroup, levels };
        });
    }, [ballData]);

    if (!ballData.length) {
        return <div className="text-center text-textSub p-10 font-mono text-xs">等待时装宝珠数据...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="card p-6 border border-border/60 bg-card relative overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 mb-6 relative z-10">
                    <div>
                        <h2 className="text-lg font-bold text-textMain uppercase tracking-wider">时装宝珠系统</h2>
                    </div>
                </div>

                <div
                    className="grid gap-6 relative z-10 items-start"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))' }}
                >
                    {processedData.map((rankGroup: any) => (
                        <div key={rankGroup.rank} className="border border-border/60 rounded-xl bg-slate-500/[0.01] dark:bg-white/[0.01] relative flex flex-col shadow-sm">
                            <div className="px-5 py-3 bg-surface/95 backdrop-blur-md border-b border-border/40 flex justify-between items-center sticky top-0 z-20 rounded-t-xl">
                                <h3 className="text-sm font-bold text-purple-600 dark:text-purple-400">
                                    【{rankGroup.rank}阶】 时装宝珠
                                </h3>
                            </div>

                            <div className="p-4 flex flex-col gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                                {rankGroup.levels.map((lvl: any, idx: number) => {
                                    const attrs = lvl.attributeValue ? Object.entries(lvl.attributeValue) : [];
                                    const isCapstone = lvl.upLevelLimits != null || idx === rankGroup.levels.length - 1; // 阶段压轴

                                    return (
                                        <div key={lvl.id} className={clsx(
                                            "flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border transition-colors",
                                            isCapstone
                                                ? "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/20"
                                                : "bg-card border-border/40 hover:border-border shadow-sm"
                                        )}>
                                            {/* Level Badge */}
                                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                                <div className={clsx(
                                                    "font-mono font-bold text-xs px-2 py-1 rounded-md",
                                                    isCapstone ? "bg-purple-500 text-white shadow-sm shadow-purple-500/20" : "bg-surface text-textMain border border-border"
                                                )}>
                                                    Lv.{lvl.level}
                                                </div>
                                                {isCapstone && <span className="text-[9px] bg-purple-500/20 text-purple-600 dark:text-purple-300 px-1.5 py-0.5 rounded font-bold sm:hidden">本阶满级</span>}
                                                {lvl.upLevelLimits && (
                                                    <span className="text-[10px] font-mono text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 whitespace-nowrap">
                                                        突破要求角色 {lvl.upLevelLimits} 级
                                                    </span>
                                                )}
                                            </div>

                                            {/* Attributes */}
                                            <div className="flex-1 flex flex-wrap items-center gap-2">
                                                {attrs.length === 0 ? (
                                                    <span className="text-textSub/50 italic text-[10px]">基础激活，无新增属性</span>
                                                ) : attrs.length > 3 ? (
                                                    <span className="text-[10px] text-purple-700 dark:text-purple-400 font-bold bg-purple-500/10 dark:bg-purple-500/20 px-2.5 py-1 rounded border border-purple-500/20 dark:border-purple-500/30">
                                                        全属性 +{Math.round(Number(attrs[0][1]) * 100)}%
                                                    </span>
                                                ) : (
                                                    attrs.map(([k, v]) => {
                                                        const meta = getAttrMeta(k);
                                                        return (
                                                            <div key={k} className={clsx("flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-medium", meta.color)}>
                                                                <span>{meta.label}</span>
                                                                <span className="font-mono font-bold">+{Math.round(Number(v) * 100)}%</span>
                                                            </div>
                                                        )
                                                    })
                                                )}
                                            </div>

                                            {/* Costs */}
                                            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 sm:pt-0 border-t border-border/30 sm:border-0 mt-2 sm:mt-0">
                                                {lvl.upResources ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-textSub block sm:hidden">升级:</span>
                                                        <CostBadge
                                                            itemId={lvl.upResources.itemId}
                                                            name={lvl.upResources.name}
                                                            count={lvl.upResources.count}
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="text-textSub/50 text-[10px] hidden sm:block">-</span>
                                                )}

                                                {(lvl.totalExp > 0 || lvl.totalYuanbao > 0) && (
                                                    <div className="text-[9px] flex gap-1.5 font-mono bg-black/5 dark:bg-white/5 px-2 py-1 rounded">
                                                        {lvl.totalExp > 0 && <span className="text-emerald-800 dark:text-green-500">累计经验: {lvl.totalExp.toLocaleString()}</span>}
                                                        {lvl.totalExp > 0 && lvl.totalYuanbao > 0 && <span className="text-border">|</span>}
                                                        {lvl.totalYuanbao > 0 && <span className="text-amber-600 dark:text-yellow-600">累计元宝: {lvl.totalYuanbao.toLocaleString()}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
