import { useState } from 'react';
import { clsx } from 'clsx';
import CultivateHeart from '../components/CultivateHeart';
import CultivateInner from '../components/CultivateInner';
import CultivateXianpo from '../components/CultivateXianpo';

interface CultivateProps {
    dataSources: Record<string, any>;
    loading?: boolean;
}

export default function RoleCultivate({ dataSources }: CultivateProps) {
    const [subTab, setSubTab] = useState<'heart' | 'inner' | 'body' | 'outer'>('heart');

    // 这里将包含：
    // role_heart - 修心(1)
    // role_danqi, role_danyuan - 内丹(2)
    // role_xianpo - 炼体(3)

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header Tabs Navigation */}
            <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-max max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar relative z-10 shadow-sm">
                {[
                    { id: 'heart', label: '修心' },
                    { id: 'inner', label: '内丹' },
                    { id: 'body', label: '炼体' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setSubTab(tab.id as any)}
                        className={clsx(
                            "px-6 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center relative overflow-hidden group border active:scale-95 cursor-pointer",
                            subTab === tab.id
                                ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                                : "text-textSub hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="mt-8">
                {subTab === 'heart' && <CultivateHeart dataSources={dataSources} />}
                {subTab === 'inner' && (
                    <CultivateInner dataSources={dataSources} />
                )}
                {subTab === 'body' && (
                    <CultivateXianpo dataSources={dataSources} />
                )}
            </div>
        </div>
    );
}
