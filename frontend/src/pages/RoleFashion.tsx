import React, { useState } from 'react';
import { clsx } from 'clsx';

const FashionBall = React.lazy(() => import('../components/fashion/FashionBall'));
const FashionRenew = React.lazy(() => import('../components/fashion/FashionRenew'));

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleFashion({ dataSources }: Props) {
    const [activeTab, setActiveTab] = useState<'ball' | 'renew'>('ball');

    const tabs = [
        { id: 'ball', label: '时装宝珠升级' },
        { id: 'renew', label: '时装续期与传承' },
    ] as const;

    return (
        <div className="space-y-6 max-h-full flex flex-col animate-in fade-in duration-500">
            {/* 顶部分类导航 */}
            <div className="flex bg-slate-200/40 dark:bg-black/20 p-1 rounded-xl border border-slate-300/60 dark:border-border/60 w-max mb-6 gap-1 shadow-sm backdrop-blur-sm">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as 'ball' | 'renew')}
                        className={clsx(
                            "px-6 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                            activeTab === tab.id
                                ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                                : "text-textSub hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
                        )}
                    >
                        <span className="relative z-10 tracking-wide">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* 子系统视图容器 */}
            <div className="flex-1 min-h-0 container mx-auto p-0">
                <React.Suspense fallback={
                    <div className="h-64 flex items-center justify-center text-textSub gap-3 bg-slate-500/[0.01] dark:bg-white/[0.01] rounded-2xl border border-border/50">
                        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        <span className="font-mono text-xs tracking-wider opacity-75">Loading Fashion Module...</span>
                    </div>
                }>
                    {activeTab === 'ball' && <FashionBall dataSources={dataSources} />}
                    {activeTab === 'renew' && <FashionRenew dataSources={dataSources} />}
                </React.Suspense>
            </div>
        </div>
    );
}
