import { AlertTriangle, BarChart3, CheckCircle2, Database, FileText, Layers3, ListChecks, Sigma } from 'lucide-react';
import { clsx } from 'clsx';
import type { StagePoint, ExtremeModule } from '../../lib/roleExtremeStats';
import { ATTR_LABELS, formatNumber, formatDecimal, attrEntries, sourceRowsForModule, selectedRowsForPoint, candidateRowsForModule, formatEvidence, contributionRows } from '../../lib/roleExtremeStats';

export function StatusPill({ status }: { status: string }) {
  const ready = status === 'ready';
  const blocked = status.startsWith('blocked');
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
      ready
        ? 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : blocked
        ? 'border-red-300/60 bg-red-500/10 text-red-700 dark:text-red-300'
        : 'border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    )}>
      {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {ready ? '已严格计算' : blocked ? '待追链路' : '局部完成'}
    </span>
  );
}

export function PointSummary({ point }: { point: StagePoint | null }) {
  if (!point) {
    return (
      <div className="rounded-lg border border-dashed border-border px-5 py-8 text-sm text-textSub">
        当前模块没有可展示阶段点。
      </div>
    );
  }
  const attrs = attrEntries(point.attrs).slice(0, 16);
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="rounded-lg border border-border/70 bg-card p-5">
        <div className="text-xs font-semibold text-textSub">阶段战力</div>
        <div className="mt-2 font-mono text-4xl font-bold text-textMain">{formatNumber(point.fightPower)}</div>
        <div className="mt-3 text-sm leading-6 text-textSub">{point.label}</div>
      </div>
      <div className="rounded-lg border border-border/70 bg-card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-textMain">
          <BarChart3 className="h-4 w-4 text-primary" />
          属性贡献
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {attrs.map(([field, value]) => (
            <div key={field} className="flex items-center justify-between rounded-md bg-surface/70 px-3 py-2 text-sm">
              <span className="text-textSub">{ATTR_LABELS[field] || field}</span>
              <span className="font-mono font-semibold text-textMain">{formatNumber(value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SourceBreakdown({ module, point, activeWeights }: { module: ExtremeModule; point: StagePoint | null; activeWeights: Record<string, number> }) {
  const sourceRows = sourceRowsForModule(module, point);
  if (!point) {
    const tableRows = Array.isArray(module.tables) ? module.tables : [];
    const blockers = module.blockers || module.warnings || [];
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-textMain">
          <FileText className="h-4 w-4 text-primary" />
          战力构成来源
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-border/70 bg-surface/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold text-textSub">
              <ListChecks className="h-4 w-4" />
              模块取数规则
            </div>
            <div className="space-y-3">
              {sourceRows.length > 0 ? sourceRows.map((row) => (
                <div key={row.label} className="text-sm leading-6">
                  <div className="font-semibold text-textMain">{row.label}</div>
                  <div className="text-textSub">{row.detail}</div>
                </div>
              )) : (
                <div className="text-sm leading-6 text-textSub">{module.formula || '当前模块还没有可展示的取数规则。'}</div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border/70 bg-surface/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold text-textSub">
              <Database className="h-4 w-4" />
              配置表状态
            </div>
            <div className="max-h-[360px] space-y-2 overflow-auto pr-1 custom-scrollbar">
              {tableRows.length > 0 ? tableRows.map((row: any) => (
                <div key={row.table} className="rounded-md bg-card px-3 py-2 text-xs leading-5">
                  <div className="font-semibold text-textMain">{row.table}</div>
                  <div className="break-all text-textSub">
                    {row.available ? `已同步；${formatEvidence(row)}` : `未同步；${row.warning || '缺少配置文件'}`}
                  </div>
                </div>
              )) : (
                <div className="text-sm text-textSub">当前模块没有配置表状态。</div>
              )}
            </div>
          </section>
        </div>

        {blockers.length > 0 ? (
          <section className="mt-4 rounded-lg border border-amber-300/60 bg-amber-500/[0.06] p-4 text-sm leading-6 text-amber-900 dark:text-amber-100">
            {blockers.map((warning: string, index: number) => (
              <div key={`${warning}-${index}`}>- {warning}</div>
            ))}
          </section>
        ) : null}
      </div>
    );
  }
  const selectedRows = selectedRowsForPoint(module, point);
  const candidateRows = candidateRowsForModule(module, point);
  const evidenceRows = point.evidence || [];
  const contributions = contributionRows(point, activeWeights);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold text-textMain">
        <FileText className="h-4 w-4 text-primary" />
        战力构成来源
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-border/70 bg-surface/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold text-textSub">
            <ListChecks className="h-4 w-4" />
            模块取数规则
          </div>
          <div className="space-y-3">
            {sourceRows.map((row) => (
              <div key={row.label} className="text-sm leading-6">
                <div className="font-semibold text-textMain">{row.label}</div>
                <div className="text-textSub">{row.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border/70 bg-surface/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold text-textSub">
            <Sigma className="h-4 w-4" />
            战力权重
          </div>
          <div className="mb-3 rounded-md bg-card px-3 py-2 text-xs leading-5 text-textSub">
            floor(sum(阶段属性[field] * powerAttribute[1][field]))；本阶段最终战力 {formatNumber(point.fightPower)}。
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {contributions.map(({ field, value, weight, contribution }) => (
              <div key={field} className="rounded-md bg-card px-3 py-2 text-xs leading-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-textMain">{ATTR_LABELS[field] || field}</span>
                  <span className="font-mono text-textMain">{formatNumber(value)}</span>
                </div>
                <div className="mt-1 text-textSub">
                  权重 {typeof weight === 'number' ? formatDecimal(weight) : '未参与'}；贡献 {contribution == null ? '-' : formatDecimal(contribution)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-border/70 bg-surface/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold text-textSub">
            <Layers3 className="h-4 w-4" />
            当前阶段生效构成
          </div>
          <div className="max-h-[360px] space-y-2 overflow-auto pr-1 custom-scrollbar">
            {selectedRows.length > 0 ? selectedRows.map((row, index) => (
              <div key={`${row.label}-${index}`} className="rounded-md bg-card px-3 py-2 text-xs leading-5">
                <div className="font-semibold text-textMain">{row.label}</div>
                <div className="text-textSub">{row.detail}</div>
              </div>
            )) : (
              <div className="text-sm text-textSub">当前阶段没有额外选择项。</div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border/70 bg-surface/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold text-textSub">
            <Database className="h-4 w-4" />
            原始配置证据
          </div>
          <div className="max-h-[360px] space-y-2 overflow-auto pr-1 custom-scrollbar">
            {evidenceRows.map((row, index) => (
              <div key={`${row.table}-${index}`} className="rounded-md bg-card px-3 py-2 text-xs leading-5">
                <div className="font-semibold text-textMain">{row.table || '配置表'}</div>
                <div className="break-all text-textSub">{formatEvidence(row)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {candidateRows.length > 0 ? (
        <section className="mt-4 rounded-lg border border-border/70 bg-surface/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold text-textSub">
            <ListChecks className="h-4 w-4" />
            称号候选池
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {candidateRows.map((row) => (
              <div key={row.label} className="rounded-md bg-card px-3 py-2 text-xs leading-5">
                <div className="font-semibold text-textMain">{row.label}</div>
                <div className="break-all text-textSub">{row.detail}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
