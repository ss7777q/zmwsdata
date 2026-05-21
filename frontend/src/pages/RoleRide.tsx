import { useState } from 'react';
import { clsx } from 'clsx';
import { Compass, BookOpen, Star, Shield } from 'lucide-react';
import RideStar from '../components/ride/RideStar';
import RideSkill from '../components/ride/RideSkill';
import RideEquipMake from '../components/ride/RideEquipMake';
import RideEquipUpgrade from '../components/ride/RideEquipUpgrade';

interface RideProps {
    dataSources: Record<string, any>;
    loading?: boolean;
}

export default function RoleRide({ dataSources }: RideProps) {
    const [subTab, setSubTab] = useState<'star' | 'skill' | 'make' | 'upgrade'>('star');

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header Tabs Navigation */}
            <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-max max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar relative z-10">
                {[
                    { id: 'star', label: '图鉴及升星进阶', icon: Star },
                    { id: 'skill', label: '技能升级', icon: BookOpen },
                    { id: 'make', label: '装备打造/重铸', icon: Compass },
                    { id: 'upgrade', label: '装备升级', icon: Shield },
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
                {subTab === 'star' && <RideStar dataSources={dataSources} />}
                {subTab === 'skill' && <RideSkill dataSources={dataSources} />}
                {subTab === 'make' && <RideEquipMake dataSources={dataSources} />}
                {subTab === 'upgrade' && <RideEquipUpgrade dataSources={dataSources} />}
            </div>
        </div>
    );
}
