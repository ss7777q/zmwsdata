import React, { useState } from 'react';
import { clsx } from 'clsx';
import { Sparkles, Diamond } from 'lucide-react';

const FashionBall = React.lazy(() => import('../components/fashion/FashionBall'));
const FashionRenew = React.lazy(() => import('../components/fashion/FashionRenew'));

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleFashion({ dataSources }: Props) {
    const [activeTab, setActiveTab] = useState<'ball' | 'renew'>('ball');

    const tabs = [
        { id: 'ball', label: '时装宝珠升级', icon: Sparkles },
        { id: 'renew', label: '时装续期与传承', icon: Diamond },
    ] as const;

    return (
        <div className="space-y-6 max-h-full flex flex-col animate-in fade-in duration-500">
            {/* 顶部分类导航 */}
            <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-max max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar relative z-10">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as 'ball' | 'renew')}
                            className={clsx(
                                "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 relative overflow-hidden group",
                                activeTab === tab.id
                                    ? "text-white shadow-md"
                                    : "text-textSub hover:text-textMain hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            {/* 选中时的背景动画层 */}
                            {activeTab === tab.id && (
                                <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary opacity-90 -z-10" />
                            )}
                            <Icon className={clsx("w-4 h-4", activeTab === tab.id && "animate-pulse")} />
                            <span className="relative z-10 tracking-wide">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* 子系统视图容器 */}
            <div className="flex-1 min-h-0 container mx-auto p-0">
                <React.Suspense fallback={
                    <div className="h-64 flex items-center justify-center text-textSub gap-3 bg-surface/30 rounded-2xl border border-border/50 backdrop-blur-sm">
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="font-mono text-sm tracking-wider">Loading Fashion Module...</span>
                    </div>
                }>
                    {activeTab === 'ball' && <FashionBall dataSources={dataSources} />}
                    {activeTab === 'renew' && <FashionRenew dataSources={dataSources} />}
                </React.Suspense>
            </div>
        </div>
    );
}
