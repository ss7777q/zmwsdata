
interface Props {
  dataSources: Record<string, any>;
}

interface ExpRow {
  id?: number;
  level?: number;
  exp?: number;
  phyDefStandard?: number;
  commonStandard?: number;
}

function formatValue(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

export default function ResistStats({ dataSources }: Props) {
  const source = dataSources.exp;
  const rows: ExpRow[] = Array.isArray(source?.data)
    ? [...source.data]
      .filter((item: ExpRow) => typeof item?.level === 'number')
      .sort((left: ExpRow, right: ExpRow) => (left.level ?? 0) - (right.level ?? 0))
    : [];


  if (!source) {
    return (
      <div className="card text-center py-20 border border-dashed border-border bg-transparent">
        <h3 className="text-xl text-textSub font-medium">正在加载抗值标准数据...</h3>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card text-center py-20 border border-dashed border-border bg-transparent">
        <h3 className="text-xl text-textSub font-medium">未找到 exp.json 中的标准值数据</h3>
      </div>
    );
  }

  return (

    <section className="rounded-[28px] border border-border bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-lg font-semibold text-textMain">等级抗值对照表</h3>
        <p className="mt-1 text-sm text-textSub">列 1 是经验值，列 2 是防御抗值，列 3 是通用抗值。</p>
      </div>

      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-left text-xs uppercase tracking-wider text-textSub shadow-sm">
            <tr className="border-b border-border">
              <th className="sticky left-0 z-20 bg-surface px-5 py-3 font-semibold shadow-[4px_0_12px_rgba(0,0,0,0.08)]">
                等级
              </th>
              <th className="px-5 py-3 font-semibold">经验值</th>
              <th className="px-5 py-3 font-semibold">防御抗值</th>
              <th className="px-5 py-3 font-semibold">通用抗值</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-textMain">
            {rows.map((row) => (
              <tr key={row.id ?? row.level} className="transition-colors hover:bg-surface/60">
                <td className="sticky left-0 z-10 bg-card px-5 py-3 font-semibold shadow-[4px_0_12px_rgba(0,0,0,0.05)]">
                  Lv.{row.level}
                </td>
                <td className="px-5 py-3 font-mono text-textMain">{formatValue(row.exp)}</td>
                <td className="px-5 py-3 font-mono text-primary">{formatValue(row.phyDefStandard)}</td>
                <td className="px-5 py-3 font-mono text-cta">{formatValue(row.commonStandard)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
