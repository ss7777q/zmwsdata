import { useState } from 'react';
import { clsx } from 'clsx';
import RideStar from '../components/ride/RideStar';
import RideSkill from '../components/ride/RideSkill';
import RideSkillWiki from '../components/ride/RideSkillWiki';
import RideEquipMake from '../components/ride/RideEquipMake';
import RideEquipUpgrade from '../components/ride/RideEquipUpgrade';

interface RideProps {
    dataSources: Record<string, any>;
    loading?: boolean;
}

export default function RoleRide({ dataSources }: RideProps) {
    const [subTab, setSubTab] = useState<'star' | 'skill' | 'wiki' | 'make' | 'upgrade'>('star');

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header Tabs Navigation */}
            <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-max max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar relative z-10 shadow-sm">
                {[
                    { id: 'star', label: '图鉴及升星进阶' },
                    { id: 'skill', label: '技能升级' },
                    { id: 'wiki', label: '技能 Wiki' },
                    { id: 'make', label: '装备打造/重铸' },
                    { id: 'upgrade', label: '装备升级' },
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
                {subTab === 'star' && <RideStar dataSources={dataSources} />}
                {subTab === 'skill' && <RideSkill dataSources={dataSources} />}
                {subTab === 'wiki' && <RideSkillWiki dataSources={dataSources} />}
                {subTab === 'make' && <RideEquipMake dataSources={dataSources} />}
                {subTab === 'upgrade' && <RideEquipUpgrade dataSources={dataSources} />}
            </div>
        </div>
    );
}
