interface MatrixEffectTable {
    title: string;
    columns: string[];
    rows: {
        label?: string;
        level?: number;
        values: string[];
    }[];
    emptyText: string;
}





export function EffectGrowthTable({ table }: { table: MatrixEffectTable | null }) {
    if (!table) return null;
    const hasRows = table.columns.length > 0 && table.rows.length > 0;

    return (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border/60 bg-slate-500/[0.02] dark:bg-white/[0.01] px-5 py-3.5">
                <div className="text-xs font-bold tracking-wider text-textMain uppercase">
                    {table.title}
                </div>
            </div>
            {hasRows ? (
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full min-w-[520px] text-center text-xs">
                        <thead>
                            <tr className="border-b border-border/40 bg-slate-500/[0.04] dark:bg-white/[0.02] text-textSub">
                                <th className="sticky left-0 z-10 bg-card px-4 py-2.5 font-semibold text-[10px] tracking-wider">Lv.</th>
                                {table.columns.map((column) => (
                                    <th key={column} className="border-l border-border/20 px-4 py-2.5 font-semibold text-[10px] tracking-wider">
                                        {column}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {table.rows.map((row) => (
                                <tr key={row.label || row.level} className="hover:bg-purple-500/[0.02] transition-colors duration-150">
                                    <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-mono font-bold text-textMain text-xs">
                                        {row.label || `Lv.${row.level}`}
                                    </td>
                                    {row.values.map((value, index) => (
                                        <td key={index} className="min-w-[120px] border-l border-border/20 px-4 py-2.5 align-top font-mono leading-5 text-textSub text-[11px]">
                                            {value}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="px-5 py-6 text-xs leading-6 text-textSub/75">
                    {table.emptyText}
                </div>
            )}
        </div>
    );
}
