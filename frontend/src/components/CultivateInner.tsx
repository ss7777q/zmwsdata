import { useState } from 'react';
import { Brain, Flame, ArrowUpCircle, Shield } from 'lucide-react';
import { clsx } from 'clsx';
import CostBadge from './ui/CostBadge';

interface Props {
    dataSources: Record<string, any>;
}

export default function CultivateInner({ dataSources }: Props) {
    const danqiData = (dataSources['role_danqi'] as any)?.data || [];
    const danyuanData = (dataSources['role_danyuan'] as any)?.data || [];

    const [activeTab, setActiveTab] = useState<'danqi' | 'danyuan'>('danqi');

    // 丹元品质名称映射
    const QualityNames: Record<number, string> = {
        3: '精良丹元',
        4: '史诗丹元',
        5: '传说丹元',
        6: '先天丹元',
    };

    // 丹元品质主题色
    const QualityColors: Record<number, string> = {
        1: 'text-gray-400 border-gray-500/30 bg-gray-500/10',
        2: 'text-green-500 border-green-500/30 bg-green-500/10',
        3: 'text-blue-500 border-blue-500/30 bg-blue-500/10',
        4: 'text-purple-500 border-purple-500/30 bg-purple-500/10',
        5: 'text-orange-500 border-orange-500/30 bg-orange-500/10',
        6: 'text-red-500 border-red-500/30 bg-red-500/10',
    };

    const AttrNames: Record<string, string> = {
        atk: '攻击', hp: '生命', mp: '魔法', def: '防御',
        hitVal: '命中', dodge: '闪避', crit: '暴击', tenacity: '韧性',
        healHp: '回血', healMp: '回魔', lucky: '幸运', guardian: '守护',
        break: '穿透', protect: '减伤'
    };

    // 提取品质突破所需材料（跨品质进阶）
    const breakthroughData = danyuanData.map((q: any) => {
        const cost = q.levels?.find((l: any) => l.upQualityCost)?.upQualityCost;
        return {
            quality: q.quality,
            name: QualityNames[q.quality] || `品质 ${q.quality}`,
            targetName: QualityNames[q.quality + 1] || `品质 ${q.quality + 1}`,
            cost
        };
    }).filter((x: any) => x.cost && x.targetName);

    if (danqiData.length === 0 && danyuanData.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/10 rounded-xl bg-surface/50">
                <Shield className="w-12 h-12 text-textSub mb-4 opacity-50" />
                <h3 className="text-xl text-textSub font-medium tracking-wider">未获取到内丹卷轴 (role_danqi / role_danyuan)</h3>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">

            {/* Sub Tabs */}
            <div className="flex gap-2 p-1 bg-black/20 border border-border rounded-lg w-max mb-6">
                <button
                    onClick={() => setActiveTab('danqi')}
                    className={clsx(
                        "px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2",
                        activeTab === 'danqi' ? "bg-primary text-white" : "text-textSub hover:text-textMain hover:bg-white/5"
                    )}
                >
                    <Flame className="w-4 h-4" /> 丹气气力
                </button>
                <button
                    onClick={() => setActiveTab('danyuan')}
                    className={clsx(
                        "px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2",
                        activeTab === 'danyuan' ? "bg-cta text-white" : "text-textSub hover:text-textMain hover:bg-white/5"
                    )}
                >
                    <ArrowUpCircle className="w-4 h-4" /> 丹元升级
                </button>
            </div>

            {/* 丹气模块视图 */}
            {activeTab === 'danqi' && (
                <div className="space-y-8">
                    {danqiData.map((groupData: any, idx: number) => {
                        return (
                            <div key={`danqi-${groupData.group}-${groupData.type}-${idx}`} className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                                <div className="p-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {(groupData.levels || []).map((levelItem: any) => {
                                            const attrName = levelItem.attribute?.[0];
                                            const attrRange = levelItem.attributeValue?.[0] || [0, 0];

                                            return (
                                                <div key={levelItem.level} className="flex flex-col p-4 bg-textMain/5 border border-border rounded-xl hover:bg-textMain/10 transition-colors shadow-sm">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <span className="font-bold text-textMain">{levelItem.name}</span>
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-textSub font-mono">
                                                            Lv.{levelItem.level}
                                                        </span>
                                                    </div>

                                                    <div className="text-sm mb-3 text-textSub bg-surface border border-border/50 p-2 rounded shadow-inner">
                                                        属性: <span className="text-textMain font-mono font-medium">{AttrNames[attrName as string] || attrName}</span> <br />
                                                        范围: <span className="text-cta font-mono">[{attrRange[0]} ~ {attrRange[1]}]</span>
                                                    </div>

                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 丹元模块视图 */}
            {activeTab === 'danyuan' && (
                <div className="space-y-6">
                    {/* 突破材料独立摘要面板 */}
                    {breakthroughData.length > 0 && (
                        <div className="card p-5 xl:p-6 bg-surface border border-border shadow-sm">
                            <h4 className="text-md font-bold mb-4 flex items-center gap-2 text-textMain">
                                <ArrowUpCircle className="w-5 h-5 text-cta" />
                                品阶突破材料图谱
                            </h4>
                            <div className="flex flex-wrap gap-4">
                                {breakthroughData.map((b: any, i: number) => (
                                    <div key={`bt-${i}`} className="flex items-center gap-4 bg-textMain/5 border border-border rounded-xl p-3 pr-4 shadow-inner">
                                        <div className="flex flex-col items-center min-w-[80px]">
                                            <span className={clsx("text-sm font-bold", QualityColors[b.quality]?.split(' ')[0])}>{b.name}</span>
                                            <span className="text-textSub text-xs my-0.5">突破至</span>
                                            <span className={clsx("text-sm font-bold", QualityColors[b.quality + 1]?.split(' ')[0])}>{b.targetName}</span>
                                        </div>
                                        <div className="w-px h-10 bg-border"></div>
                                        <div className="flex gap-2">
                                            {b.cost.map((c: any, ci: number) => (
                                                <CostBadge key={ci} itemId={c.itemId} name={c.name} count={c.count} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 各阶级经验池表格 */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {danyuanData.map((qualityData: any) => {
                            const styling = QualityColors[qualityData.quality] || 'text-textMain border-border bg-textMain/5';
                            const titleName = QualityNames[qualityData.quality] || `品质 ${qualityData.quality} 丹元`;

                            // 预计算累计经验
                            let rollingExp = 0;
                            const levels = (qualityData.levels || []).map((lvl: any) => {
                                rollingExp += (lvl.levelUpNeed || 0);
                                return { ...lvl, accumulatedExp: rollingExp };
                            });

                            return (
                                <div key={`dy-quality-${qualityData.quality}`} className="bg-surface border border-border shadow-sm rounded-xl flex flex-col overflow-hidden">
                                    <div className={clsx("p-4 border-b flex items-center justify-between", styling)}>
                                        <h4 className="text-lg font-bold flex items-center gap-2">
                                            <Brain className="w-5 h-5 opacity-80" />
                                            {titleName} 升级曲线
                                        </h4>
                                        <span className="text-xs opacity-70">最高 {levels.length} 级</span>
                                    </div>
                                    <div className="p-0 overflow-x-auto flex-1">
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead>
                                                <tr className="bg-textMain/5 text-textSub text-xs uppercase tracking-wider border-b border-border">
                                                    <th className="px-4 py-3 font-medium">Lv.</th>
                                                    <th className="px-4 py-3 font-medium text-cta">升级所需经验</th>
                                                    <th className="px-4 py-3 font-medium text-orange-400">累计所需经验</th>
                                                    <th className="px-4 py-3 font-medium text-green-500">吞噬提供经验</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/50">
                                                {levels.map((lvl: any) => (
                                                    <tr key={lvl.level} className="hover:bg-textMain/5 transition-colors">
                                                        <td className="px-4 py-2.5 font-mono text-textMain font-medium">
                                                            {lvl.level}
                                                        </td>
                                                        <td className="px-4 py-2.5 font-mono text-textMain">
                                                            {lvl.levelUpNeed > 0 ? Number(lvl.levelUpNeed).toLocaleString() : '-'}
                                                        </td>
                                                        <td className="px-4 py-2.5 font-mono text-orange-400">
                                                            {lvl.accumulatedExp > 0 ? Number(lvl.accumulatedExp).toLocaleString() : '-'}
                                                        </td>
                                                        <td className="px-4 py-2.5 font-mono text-textSub">
                                                            {lvl.provideExp > 0 ? Number(lvl.provideExp).toLocaleString() : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

        </div>
    );
}
