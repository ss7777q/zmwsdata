import { useState } from 'react';
import {
    Aperture,
    Clock,
    Crown,
    Diamond,
    Hammer,
    Infinity as InfinityIcon,
    Shirt,
    Smile,
    Sparkles,
    Sword
} from 'lucide-react';
import { clsx } from 'clsx';
import CostBadge from '../ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}

export default function FashionRenew({ dataSources }: Props) {
    const parts = dataSources['role_fashion_renew']?.data || [];

    const [activePart, setActivePart] = useState<string>(parts.length > 0 ? parts[0].part : 'clothes');

    const partIcons: Record<string, any> = {
        clothes: Shirt,
        face: Smile,
        head: Crown,
        weapon: Sword,
        wing: Sparkles,
        matrix: Aperture,
    };

    const activePartData = parts.find((part: any) => part.part === activePart) || parts[0];
    const ActiveIcon = partIcons[activePartData?.part] || Diamond;

    if (!parts.length) {
        return <div className="text-center text-textSub p-10">等待时装续费与传承数据...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 shrink-0">
                    <div className="p-2 rounded bg-secondary/20 text-secondary">
                        <Diamond className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-textMain whitespace-nowrap">时装续费及传承</h2>
                    </div>
                </div>

                <div className="flex bg-surface border border-border/50 rounded-lg p-1 w-full md:w-auto overflow-x-auto custom-scrollbar">
                    {parts.map((part: any) => {
                        const Icon = partIcons[part.part] || Diamond;
                        const isSelected = activePartData?.part === part.part;
                        return (
                            <button
                                key={part.part}
                                onClick={() => setActivePart(part.part)}
                                className={clsx(
                                    'flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm font-bold shrink-0',
                                    isSelected
                                        ? 'bg-secondary/20 text-secondary shadow'
                                        : 'text-textSub hover:text-textMain hover:bg-black/5 dark:hover:bg-white/5',
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="capitalize">{part.partName || part.part}</span>
                                <span className="text-[10px] bg-black/10 dark:bg-black/30 px-1.5 py-0.5 rounded ml-1">
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
                            className="card p-5 border border-border/50 bg-gradient-to-br from-surface to-background hover:border-secondary/50 transition-all duration-300 group hover:-translate-y-1 flex flex-col h-full"
                        >
                            <div className="flex justify-between items-start mb-4 gap-4">
                                <div className="flex-1">
                                    <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto custom-scrollbar bg-surface/50 border border-border/60 rounded-lg p-2.5">
                                        {group.fashions?.map((fname: string, fIdx: number) => (
                                            <span key={fIdx} className="text-xs font-bold text-textMain/90 bg-black/5 dark:bg-white/5 border border-border/40 px-2.5 py-1 rounded-md">
                                                {fname}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center border border-secondary/20 shrink-0 mt-1">
                                    <ActiveIcon className="w-4 h-4 text-secondary opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-transform" />
                                </div>
                            </div>

                            <div className="space-y-4 flex-1">
                                <div className="space-y-2">
                                    <div className="text-xs text-textSub font-bold flex items-center gap-1.5 border-b border-border/30 pb-1">
                                        <Clock className="w-3 h-3 text-cyan-700 dark:text-cyan-500" />
                                        点券续费消耗
                                    </div>
                                    <div className="grid grid-cols-1 gap-1.5">
                                        {group.renew && Object.entries(group.renew).map(([days, cost]: [string, any]) => (
                                            <div
                                                key={days}
                                                className="flex items-center justify-between bg-black/5 dark:bg-black/20 rounded px-2 py-1.5"
                                            >
                                                <span
                                                    className={clsx(
                                                        'text-xs font-bold shrink-0',
                                                        days === '永久'
                                                            ? 'text-orange-700 dark:text-orange-500'
                                                            : 'text-cyan-700 dark:text-cyan-500',
                                                    )}
                                                >
                                                    {days === '永久' && (
                                                        <InfinityIcon className="w-3 h-3 inline mr-1 -mt-0.5" />
                                                    )}
                                                    {days}
                                                </span>
                                                <CostBadge itemId={cost.itemId} name={cost.name} count={cost.count} />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {group.hasTransCost && group.transCost && group.transCost.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                        <div className="text-xs text-textSub font-bold flex items-center gap-1.5 border-b border-border/30 pb-1">
                                            <Hammer className="w-3 h-3 text-rose-700 dark:text-rose-500" />
                                            衣柜传承
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {group.transCost.map((transCost: any, index: number) => (
                                                <div key={index} className="bg-black/5 dark:bg-black/20 rounded p-1">
                                                    <CostBadge
                                                        itemId={transCost.itemId}
                                                        name={transCost.name}
                                                        count={transCost.count}
                                                    />
                                                </div>
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
