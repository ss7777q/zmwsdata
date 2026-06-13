import { useState } from 'react';
import RoleMagic from './RoleMagic';
import RoleGodWeapon from './RoleGodWeapon';
import RoleMatrix from './RoleMatrix';
// 稍后将补充神器与阵法的引入

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleSpiritual({ dataSources }: Props) {
    const [activeTab, setActiveTab] = useState<'magic' | 'godweapon' | 'matrix'>('magic');

    const tabs = [
        { id: 'magic', label: '法宝系统' },
        { id: 'godweapon', label: '神器系统' },
        { id: 'matrix', label: '阵法系统' },
    ] as const;

    return (
        <div className="space-y-6">
            {/* 顶部分类导航 */}
            <div className="flex justify-center">
                <div className="bg-surface/50 p-1 rounded-xl flex items-center gap-1 border border-border/40 backdrop-blur-sm max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as 'magic' | 'godweapon' | 'matrix')}
                            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === tab.id
                                ? 'bg-primary/20 text-primary shadow-[0_0_15px_rgba(30,64,175,0.2)]'
                                : 'text-textSub hover:text-textMain hover:bg-surface'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 内容区 */}
            <div className="min-h-[500px]">
                {activeTab === 'magic' && <RoleMagic dataSources={dataSources} />}
                {activeTab === 'godweapon' && <RoleGodWeapon dataSources={dataSources} />}
                {activeTab === 'matrix' && <RoleMatrix dataSources={dataSources} />}
            </div>
        </div>
    );
}
