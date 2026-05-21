import { useState } from 'react';
import { clsx } from 'clsx';
import { BookOpen, Star, Shield } from 'lucide-react';
import PetSkill from '../components/pet/PetSkill';
import PetStar from '../components/pet/PetStar';
import PetEquip from '../components/pet/PetEquip';

interface PetProps {
    dataSources: Record<string, any>;
    loading?: boolean;
}

export default function RolePet({ dataSources }: PetProps) {
    const [subTab, setSubTab] = useState<'skill' | 'star' | 'equip'>('skill');

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header Tabs Navigation */}
            <div className="flex gap-2 p-1 bg-surface border border-border rounded-xl w-max max-w-[calc(100vw-2rem)] overflow-x-auto custom-scrollbar relative z-10">
                {[
                    { id: 'skill', label: '技能与潜能', icon: BookOpen },
                    { id: 'star', label: '升星与进阶', icon: Star },
                    { id: 'equip', label: '宠物装备', icon: Shield },
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
                {subTab === 'skill' && <PetSkill dataSources={dataSources} />}
                {subTab === 'star' && <PetStar dataSources={dataSources} />}
                {subTab === 'equip' && <PetEquip dataSources={dataSources} />}
            </div>
        </div>
    );
}
