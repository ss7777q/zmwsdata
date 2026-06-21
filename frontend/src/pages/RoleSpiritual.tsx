import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import RoleMagic from './RoleMagic';
import RoleGodWeapon from './RoleGodWeapon';
import RoleMatrix from './RoleMatrix';
// 稍后将补充神器与阵法的引入

interface Props {
    dataSources: Record<string, any>;
}

export default function RoleSpiritual({ dataSources }: Props) {
    const location = useLocation();
    const navigate = useNavigate();
    const activeTab = location.pathname.includes('/godweapon/')
        ? 'godweapon'
        : location.pathname.includes('/matrix/')
            ? 'matrix'
            : 'magic';
    const activeMode = location.pathname.endsWith('/effect') ? 'effect' : 'cost';

    const tabs = useMemo(() => [
        { id: 'magic', label: '法宝系统', path: '/user_spiritual/magic/cost' },
        { id: 'godweapon', label: '神器系统', path: '/user_spiritual/godweapon/cost' },
        { id: 'matrix', label: '阵法系统', path: '/user_spiritual/matrix/cost' },
    ] as const, []);

    return (
        <div className="space-y-6">
            {/* 顶部分类导航 */}
            <div className="flex justify-center">
                <div className="bg-surface/50 p-1 rounded-xl flex items-center gap-1 border border-border/40 backdrop-blur-sm max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => navigate(tab.path)}
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
                {activeTab === 'magic' && <RoleMagic dataSources={dataSources} activeTab={activeMode} onTabChange={(tab) => navigate(`/user_spiritual/magic/${tab}`)} />}
                {activeTab === 'godweapon' && <RoleGodWeapon dataSources={dataSources} activeTab={activeMode} onTabChange={(tab) => navigate(`/user_spiritual/godweapon/${tab}`)} />}
                {activeTab === 'matrix' && <RoleMatrix dataSources={dataSources} activeTab={activeMode} onTabChange={(tab) => navigate(`/user_spiritual/matrix/${tab}`)} />}
            </div>
        </div>
    );
}
