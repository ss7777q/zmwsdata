import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import PetSkill from '../components/pet/PetSkill';
import PetStar from '../components/pet/PetStar';
import PetEquip from '../components/pet/PetEquip';
import PetSkillWiki from '../components/pet/PetSkillWiki';
import PetGodWeapon from '../components/pet/PetGodWeapon';

interface PetProps {
    dataSources: Record<string, any>;
    loading?: boolean;
}

export default function RolePet({ dataSources }: PetProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const tabs = useMemo(() => [
        { id: 'skill', label: '技能与潜能', path: '/pet/skill' },
        { id: 'wiki', label: '技能 Wiki', path: '/pet/wiki' },
        { id: 'star', label: '升星与进阶', path: '/pet/star' },
        { id: 'equip', label: '宠物装备', path: '/pet/equip' },
        { id: 'godweapon', label: '宠物神器', path: '/pet/godweapon' },
    ] as const, []);
    const subTab = tabs.find((tab) => tab.path === location.pathname)?.id ?? 'skill';

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header Tabs Navigation */}
            <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-max max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar relative z-10 shadow-sm">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => navigate(tab.path)}
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
                {subTab === 'skill' && <PetSkill dataSources={dataSources} />}
                {subTab === 'wiki' && <PetSkillWiki dataSources={dataSources} />}
                {subTab === 'star' && <PetStar dataSources={dataSources} />}
                {subTab === 'equip' && <PetEquip dataSources={dataSources} />}
                {subTab === 'godweapon' && <PetGodWeapon dataSources={dataSources} />}
            </div>
        </div>
    );
}
