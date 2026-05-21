import { useState } from 'react';
import { clsx } from 'clsx';
import { Brain, Activity, Zap } from 'lucide-react';
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
            <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-max max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar relative z-10">
                {[
                    { id: 'heart', label: '修心', icon: Zap },
                    { id: 'inner', label: '内丹', icon: Brain },
                    { id: 'body', label: '炼体', icon: Activity },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setSubTab(tab.id as any)}
                        className={clsx(
                            "px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 flex items-center gap-2 relative overflow-hidden group",
                            subTab === tab.id
                                ? "text-white shadow-lg shadow-primary/20 bg-primary/20 border border-primary/50"
                                : "text-textSub hover:text-textMain hover:bg-white/5 border border-transparent"
                        )}
                    >
                        {/* 选中态高光特效 */}
                        {subTab === tab.id && (
                            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 translate-x-[-100%] animate-[shimmer_2s_infinite]" />
                        )}
                        <tab.icon className={clsx(
                            "w-4 h-4 transition-transform duration-300",
                            subTab === tab.id ? "scale-110 text-cta" : "group-hover:scale-110"
                        )} />
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
