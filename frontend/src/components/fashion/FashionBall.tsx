import React from 'react';
import CostBadge from '../ui/CostBadge';
import { Sparkles, ShieldCheck, Sword, Heart, Droplets } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
    dataSources: Record<string, any>;
}

export default function FashionBall({ dataSources }: Props) {
    const ballData = dataSources['role_fashion_ball']?.data || [];

    // Attribute mapper to icons/labels
    const getAttrMeta = (key: string) => {
        const map: Record<string, { label: string, icon: any, color: string }> = {
            atk: { label: '攻击', icon: Sword, color: 'text-red-700 dark:text-red-500' },
            hp: { label: '生命', icon: Heart, color: 'text-emerald-800 dark:text-green-500' },
            mp: { label: '魔法', icon: Droplets, color: 'text-blue-700 dark:text-blue-500' },
            def: { label: '防御', icon: ShieldCheck, color: 'text-orange-700 dark:text-orange-500' },
            healMp: { label: '回魔', icon: Droplets, color: 'text-cyan-700 dark:text-cyan-500' },
            healHp: { label: '回血', icon: Heart, color: 'text-emerald-800 dark:text-emerald-500' },
            hitVal: { label: '命中', icon: Sparkles, color: 'text-yellow-700 dark:text-yellow-500' },
            dodge: { label: '闪避', icon: Sparkles, color: 'text-purple-700 dark:text-purple-500' },
            crit: { label: '暴击', icon: Sword, color: 'text-rose-700 dark:text-rose-500' },
            tenacity: { label: '韧性', icon: ShieldCheck, color: 'text-slate-700 dark:text-slate-400' },
            lucky: { label: '幸运', icon: Sparkles, color: 'text-amber-700 dark:text-amber-500' },
            guardian: { label: '守护', icon: ShieldCheck, color: 'text-indigo-700 dark:text-indigo-500' }
        };
        return map[key] || { label: key, icon: Sparkles, color: 'text-textSub' };
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
        return <div className="text-center text-textSub p-10">等待时装宝珠数据...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="card p-6 border border-border/50 bg-gradient-to-br from-surface to-background relative overflow-hidden">
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                    <Sparkles className="w-64 h-64 text-primary" />
                </div>

                <div className="flex items-center gap-3 mb-6 relative z-10">
                    <div className="p-2 rounded bg-primary/20 text-primary">
                        <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-textMain">时装宝珠系统</h2>
                    </div>
                </div>

                <div
                    className="grid gap-6 relative z-10 items-start"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))' }}
                >
                    {processedData.map((rankGroup: any) => (
                        <div key={rankGroup.rank} className="border border-border/40 rounded-xl bg-background relative flex flex-col shadow-sm">
                            <div className="px-5 py-3 bg-surface/95 backdrop-blur-md border-b border-border/40 flex justify-between items-center sticky top-0 z-20 rounded-t-xl">
                                <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                                    【{rankGroup.rank}阶】 时装宝珠
                                </h3>
                            </div>

                            <div className="p-4 flex flex-col gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                                {rankGroup.levels.map((lvl: any, idx: number) => {
                                    const attrs = lvl.attributeValue ? Object.entries(lvl.attributeValue) : [];
                                    const isCapstone = lvl.upLevelLimits != null || idx === rankGroup.levels.length - 1; // 阶段压轴

                                    return (
                                        <div key={lvl.id} className={clsx(
                                            "flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border transition-colors",
                                            isCapstone ? "bg-primary/5 hover:bg-primary/10 border-primary/20" : "bg-white dark:bg-black/20 border-border/40 hover:border-border shadow-sm"
                                        )}>
                                            {/* Level Badge */}
                                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                                <div className={clsx(
                                                    "font-mono font-bold text-sm px-2 py-1 rounded",
                                                    isCapstone ? "bg-primary text-white shadow-sm shadow-primary/30" : "bg-surface text-textMain border border-border"
                                                )}>
                                                    Lv.{lvl.level}
                                                </div>
                                                {isCapstone && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/30 sm:hidden">本阶满级</span>}
                                                {lvl.upLevelLimits && (
                                                    <span className="text-[11px] font-mono text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 whitespace-nowrap">
                                                        突破要求角色 {lvl.upLevelLimits} 级
                                                    </span>
                                                )}
                                            </div>

                                            {/* Attributes */}
                                            <div className="flex-1 flex flex-wrap items-center gap-2">
                                                {attrs.length === 0 ? (
                                                    <span className="text-textSub/50 italic text-xs">基础激活，无新增属性</span>
                                                ) : attrs.length > 3 ? (
                                                    <span className="text-xs text-orange-700 dark:text-orange-500 font-bold bg-orange-500/10 dark:bg-orange-500/20 px-2 flex items-center gap-1.5 py-1 rounded border border-orange-500/20 dark:border-orange-500/30">
                                                        <Sparkles className="w-3 h-3 text-orange-500" /> 全属性 +{Math.round(Number(attrs[0][1]) * 100)}%
                                                    </span>
                                                ) : (
                                                    attrs.map(([k, v]) => {
                                                        const meta = getAttrMeta(k);
                                                        const Icon = meta.icon;
                                                        return (
                                                            <div key={k} className="flex items-center gap-1.5 bg-surface px-2 py-1 rounded border border-border/50">
                                                                <Icon className={clsx("w-3 h-3", meta.color)} />
                                                                <span className="text-xs text-textMain">{meta.label}</span>
                                                                <span className="text-xs text-emerald-800 dark:text-green-500 font-mono font-bold">+{Math.round(Number(v) * 100)}%</span>
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
                                                    <span className="text-textSub/50 text-xs hidden sm:block">-</span>
                                                )}

                                                {(lvl.totalExp > 0 || lvl.totalYuanbao > 0) && (
                                                    <div className="text-[10px] flex gap-2 font-mono bg-black/5 dark:bg-white/5 px-2 py-1 rounded">
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
