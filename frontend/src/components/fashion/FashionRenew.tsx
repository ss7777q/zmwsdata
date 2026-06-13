import { useState } from 'react';
import { clsx } from 'clsx';
import CostBadge from '../ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}

export default function FashionRenew({ dataSources }: Props) {
    const parts = dataSources['role_fashion_renew']?.data || [];

    const [activePart, setActivePart] = useState<string>(parts.length > 0 ? parts[0].part : 'clothes');

    const activePartData = parts.find((part: any) => part.part === activePart) || parts[0];

    if (!parts.length) {
        return <div className="text-center text-textSub p-10 font-mono text-xs">等待时装续费与传承数据...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-textMain whitespace-nowrap uppercase tracking-wider">时装续费及传承</h2>
                    </div>
                </div>

                <div className="flex bg-slate-200/40 dark:bg-black/20 p-1 rounded-xl border border-slate-300/60 dark:border-border/60 w-max mb-6 gap-1 shadow-sm backdrop-blur-sm">
                    {parts.map((part: any) => {
                        const isSelected = activePartData?.part === part.part;
                        return (
                            <button
                                key={part.part}
                                onClick={() => setActivePart(part.part)}
                                className={clsx(
                                    "px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                                    isSelected
                                        ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                                        : "text-textSub hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                                )}
                            >
                                <span className="capitalize">{part.partName || part.part}</span>
                                <span className={clsx("ml-1.5 text-[9px] px-1.5 py-0.5 rounded font-mono font-medium", isSelected ? "bg-purple-500/20 text-purple-600 dark:text-purple-300" : "bg-black/10 dark:bg-white/5")}>
                                    {part.fashionCount}件
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}
            >
                {activePartData?.groups?.map((group: any, idx: number) => {
                    return (
                        <div
                            key={idx}
                            className="card p-5 border border-border/60 bg-card hover:border-purple-500/20 hover:shadow-[0_8px_30px_rgba(168,85,247,0.06)] transition-all duration-200 flex flex-col h-full rounded-2xl"
                        >
                            <div className="flex justify-between items-start mb-4 gap-4">
                                <div className="flex-1">
                                    <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto custom-scrollbar bg-slate-500/[0.01] dark:bg-white/[0.01] border border-border/40 rounded-xl p-2.5">
                                        {group.fashions?.map((fname: string, fIdx: number) => (
                                            <span key={fIdx} className="text-[10px] font-bold text-textMain/90 bg-card border border-border/40 px-2 py-0.5 rounded-md">
                                                {fname}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 flex-1">
                                <div className="space-y-2 bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 border-l-2 border-l-purple-500/50">
                                    <div className="text-[10px] text-textSub font-bold flex items-center gap-1.5 uppercase tracking-wide">
                                        点券续费消耗
                                    </div>
                                    <div className="grid grid-cols-1 gap-1.5 pt-1">
                                        {group.renew && Object.entries(group.renew).map(([days, cost]: [string, any]) => (
                                            <div
                                                key={days}
                                                className="flex items-center justify-between bg-slate-500/[0.04] dark:bg-black/20 rounded-lg px-2.5 py-1.5"
                                            >
                                                <span
                                                    className={clsx(
                                                        'text-xs font-bold shrink-0',
                                                        days === '永久'
                                                            ? 'text-orange-700 dark:text-orange-500'
                                                            : 'text-cyan-700 dark:text-cyan-500',
                                                    )}
                                                >
                                                    {days}
                                                </span>
                                                <CostBadge itemId={cost.itemId} name={cost.name} count={cost.count} />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {group.hasTransCost && group.transCost && group.transCost.length > 0 && (
                                    <div className="space-y-2 bg-slate-500/[0.01] dark:bg-white/[0.01] p-3.5 rounded-xl border border-border/40 border-l-2 border-l-indigo-500/50">
                                        <div className="text-[10px] text-textSub font-bold flex items-center gap-1.5 uppercase tracking-wide">
                                            衣柜传承
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {group.transCost.map((transCost: any, index: number) => (
                                                <CostBadge
                                                    key={index}
                                                    itemId={transCost.itemId}
                                                    name={transCost.name}
                                                    count={transCost.count}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
