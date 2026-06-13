import { useMemo } from 'react';

interface Props {
    dataSources: Record<string, any>;
}

export default function RideEquipUpgrade({ dataSources }: Props) {
    const upgradeData = dataSources['ride_equip_upgrade']?.data;

    // 计算累计经验，方便展示进度落差
    const enrichedData = useMemo(() => {
        if (!upgradeData) return [];
        let accExp = 0;
        return upgradeData.map((stage: any) => {
            accExp += stage.exp || 0;
            return {
                ...stage,
                accExp
            };
        });
    }, [upgradeData]);

    if (!upgradeData) {
        return <div className="text-center text-textSub p-10">等待坐骑强运进阶数据...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="card p-6 border border-border/50">
                <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-xl font-bold text-textMain">坐骑装备强化数据</h2>
                </div>



                <div className="overflow-x-auto custom-scrollbar border border-border/30 rounded-lg max-h-[70vh] overflow-y-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-surface sticky top-0 z-10 shadow-sm">
                            <tr className="border-b border-border text-textSub text-xs uppercase tracking-wider">
                                <th className="px-5 py-3 font-medium">目标强化等级</th>
                                <th className="px-5 py-3 font-medium text-orange-400">单级晋升经验 (Exp)</th>
                                <th className="px-5 py-3 font-medium text-textSub">累计EXP</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30 bg-background/30 text-textMain">
                            {enrichedData.map((lvl: any, idx: number) => (
                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                    <td className="px-5 py-4 font-mono font-bold">
                                        Lv.{lvl.levelStart} {lvl.levelStart !== lvl.levelEnd && `- Lv.${lvl.levelEnd}`}
                                    </td>
                                    <td className="px-5 py-4 font-mono">
                                        <span className="text-orange-400 font-semibold">{lvl.exp.toLocaleString()}</span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-2 w-48">
                                            <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                                                <div
                                                    className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
                                                    style={{ width: `${Math.min(100, (lvl.accExp / enrichedData[enrichedData.length - 1].accExp) * 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-textSub font-mono w-16 text-right">
                                                {lvl.accExp >= 10000 ? `${(lvl.accExp / 10000).toFixed(1)}W` : lvl.accExp}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 text-xs text-textSub">
                    满级预估封顶所需总累加值: <span className="font-mono text-green-400 font-bold">{enrichedData[enrichedData.length - 1]?.accExp.toLocaleString()}</span> Exp
                </div>
            </div>
        </div>
    );
}
