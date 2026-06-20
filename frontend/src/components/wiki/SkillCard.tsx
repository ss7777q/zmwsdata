import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { SkillCardData, SkillLevel } from './skillCard/SkillCardTypes';
import type { GrowthBuffColumn, GrowthBuffEffectInfo } from './skillCard/SkillCardUtils';
import { buffDuration, buildGrowthBuffGroups, describeSegments, effectFormulaNote, fmt, fmtBuffVal, fmtPercent, fmtRatio, fmtX, growthBuffColumnLabel, growthBuffGroupKey, metricText } from './skillCard/SkillCardUtils';
import { BuffRow, ChainViz, PassiveLevelBlock, Stat, Td, Th } from './skillCard/SkillCardParts';
export type { SkillBaselineData, SkillCardData } from './skillCard/SkillCardTypes';

interface Props {
  card: SkillCardData;
  /** 要对比展示的技能等级集合(只渲染当前导出中实际存在的等级行) */
  levels: number[];
  slotLabel: string;
  badge?: string;
}

export default function SkillCard({ card, levels, slotLabel, badge }: Props) {
  const levelRowByLevel = useMemo(() => {
    return new Map((card.levels || []).map((levelRow) => [levelRow.level, levelRow]));
  }, [card.levels]);

  // 选中等级 -> 按 level 字段映射当前导出中的真实行,不依赖数组下标。
  const rows = useMemo(() => {
    if (!card.levels?.length) return [];
    const picked = levels.length ? levels : [card.levels[0].level];
    const set = new Set<number>();
    for (const n of picked) if (levelRowByLevel.has(n)) set.add(n);
    if (!set.size) set.add(card.levels[card.levels.length - 1].level);
    const nextRows: SkillLevel[] = [];
    for (const n of [...set].sort((a, b) => a - b)) {
      const row = levelRowByLevel.get(n);
      if (row) nextRows.push(row);
    }
    return nextRows;
  }, [card.levels, levelRowByLevel, levels]);

  const baselineLevelByLevel = useMemo(() => {
    return new Map((card.skillBaseline?.levels || []).map((level) => [level.level, level]));
  }, [card.skillBaseline]);

  // 动态指标列:取所有等级出现过的指标(并集,保持首次出现顺序)
  const metricCols = useMemo(() => {
    const seen = new Map<string, string>();
    for (const lv of card.levels || []) {
      for (const m of lv.metrics || []) if (!seen.has(m.key)) seen.set(m.key, m.label);
    }
    return [...seen].map(([key, label]) => ({ key, label }));
  }, [card]);

  // 列分流:耗蓝只有出现非零值才展示；源表给 0/null 时保持自动隐藏。
  const cols = useMemo(() => {
    const mp = rows.map((r) => r.consumeMp ?? null);
    const val = rows.map((r) => r.totalVal ?? null);
    const per = rows.map((r) => r.totalPer ?? null);
    const hasSelectedBaseline = rows.some((r) => baselineLevelByLevel.has(r.level));
    const varies = (vals: (number | string | null)[]) => !vals.every((v) => v === vals[0]);
    const dynamic = (vals: (number | string | null)[]) =>
      rows.length > 1 ? varies(vals) : vals.some((v) => v != null && v !== 0);
    const constNonZero = (vals: (number | string | null)[]) =>
      vals.length > 0 && !varies(vals) && vals[0] != null && vals[0] !== 0;
    const dynamicMetrics = metricCols.filter((c) => dynamic(rows.map((r) => metricText(r, c.key))));
    return {
      mp: mp.some((v) => typeof v === 'number' && v !== 0),
      per: dynamic(per),
      val: dynamic(val),
      metrics: dynamicMetrics,
      // 恒定值挪到静态区(总系数静态区已有,不重复)
      staticMp: false,
      staticVal: !dynamic(val) && constNonZero(val),
      baselineMultiplier: card.skillBaseline?.fixedMultiplierMode === 'growth' && hasSelectedBaseline,
      baselineCorrection: card.skillBaseline?.fixedMultiplierMode === 'growth' && hasSelectedBaseline,
      staticMetrics: metricCols.filter(
        (c) => !dynamicMetrics.includes(c) && rows.some((r) => metricText(r, c.key) !== '—')
      ),
    };
  }, [rows, metricCols, card.skillBaseline?.fixedMultiplierMode, baselineLevelByLevel]);
  const growthBuffGroups = useMemo(() => buildGrowthBuffGroups(card.levels || []), [card.levels]);

  const growthBuffEffects = useMemo<GrowthBuffEffectInfo[]>(() => {
    const allLevels = card.levels || [];
    return growthBuffGroups
      .map((group) => {
        const fixedParts: string[] = [];
        if (!group.template && !group.dynamicPer && group.fixedPer != null) fixedParts.push(`固定比例 ${fmtPercent(group.fixedPer)}`);
        if (!group.template && !group.dynamicVal && group.fixedVal != null) fixedParts.push(`${group.valueLabel} ${fmtBuffVal(group.fixedVal, group.sample.displayText)}`);
        return {
          key: group.key,
          title: group.effectName,
          meta: [group.bindLabel, buffDuration(group.sample.time)].filter(Boolean).join(' · '),
          detail: group.template,
          formulaNote: effectFormulaNote(group, allLevels),
          fixedParts,
        };
      })
      .filter((effect) => Boolean(effect.detail) || Boolean(effect.formulaNote) || effect.fixedParts.length > 0);
  }, [card.levels, growthBuffGroups]);

  // 成长性 buff:描述放中间说明区,成长表只展示真正随等级变化的数值。
  const growthBuffCols = useMemo<GrowthBuffColumn[]>(() => {
    const cols: GrowthBuffColumn[] = [];
    for (const group of growthBuffGroups) {
      const matchingBuffs = (lv: SkillLevel) => (lv.growthBuffs || []).filter((buff) => growthBuffGroupKey(buff) === group.key);

      if (group.dynamicVal) {
        const label = growthBuffColumnLabel(group.effectName, group.valueLabel, card.name);
        const perLevel = new Map<number, string[]>();
        for (const lv of rows) {
          const texts = matchingBuffs(lv).map((buff) => fmtBuffVal(buff.value?.val, buff.displayText || group.sample.displayText));
          perLevel.set(lv.level, texts.length ? texts : ['—']);
        }
        cols.push({
          key: `${group.key}::val`,
          label,
          subLabel: label === group.valueLabel ? null : group.valueLabel,
          perLevel,
        });
      }

      if (group.dynamicPer) {
        const label = growthBuffColumnLabel(group.effectName, '比例', card.name);
        const perLevel = new Map<number, string[]>();
        for (const lv of rows) {
          const texts = matchingBuffs(lv).map((buff) => fmtPercent(buff.value?.per));
          perLevel.set(lv.level, texts.length ? texts : ['—']);
        }
        cols.push({
          key: `${group.key}::per`,
          label,
          subLabel: label === '比例' ? null : '比例',
          perLevel,
        });
      }
    }
    return cols;
  }, [card.name, growthBuffGroups, rows]);

  const isSkillExtraCard = card.extraKind === 'skillExtra' || card.header.kind === 'skillExtra';
  const hasSkillExtraVal = isSkillExtraCard && rows.some((row) => row.totalVal != null);
  const hasGrowthTable = cols.mp || cols.per || cols.val || hasSkillExtraVal || cols.baselineMultiplier || cols.baselineCorrection || cols.metrics.length > 0 || growthBuffCols.length > 0;
  const lastRow = rows[rows.length - 1];

  if (card.error) {
    return (
      <div className="rounded-[20px] border border-dashed border-border bg-transparent p-5">
        <div className="text-sm font-semibold text-textMain">{slotLabel} · {card.name}</div>
        <div className="mt-2 flex items-center gap-2 text-sm text-amber-500">
          <AlertTriangle className="h-4 w-4" /> {card.error}
        </div>
      </div>
    );
  }

  const segGroups = describeSegments(card.header.segments);
  const headerMetrics = card.header.metrics ?? [];
  const officialDescription = card.desIntro?.trim();
  const showSegmentCount = !isSkillExtraCard && (card.header.segCount ?? 0) !== 0;
  const showTotalCoefficient = isSkillExtraCard || (card.header.totalPer ?? 0) !== 0;
  const passiveRows = rows.filter((row) => row.passive);
  const isPassiveCard = Boolean(card.passiveKind || passiveRows.length);
  const showReleaseTime = card.header.releaseSeconds != null;
  const showCooldown = card.header.cd != null;
  const showHeaderStats = !isPassiveCard && (
    showSegmentCount
    || showTotalCoefficient
    || showReleaseTime
    || showCooldown
    || headerMetrics.length > 0
    || cols.staticMetrics.length > 0
    || card.skillBaseline?.fixedMultiplierMode === 'static'
    || (!isSkillExtraCard && cols.staticVal)
    || cols.staticMp
  );

  return (
    <div className="flex flex-col rounded-[20px] border border-border bg-card shadow-sm overflow-hidden">
      {/* 卡头 */}
      <div className="border-b border-border bg-slate-500/[0.02] dark:bg-white/[0.01] px-5 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-bold text-textMain">{card.name}</span>
              {badge && (
                <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{badge}</span>
              )}
            </div>
            <div className="text-[10px] text-textSub/85 mt-0.5 font-medium tracking-wide uppercase">{slotLabel}</div>
          </div>
        </div>
      </div>

      {/* 表头区:不随等级变 */}
      {showHeaderStats && <div className="grid grid-cols-2 gap-px bg-border/40 text-sm">
        {showSegmentCount && <Stat label="段数" value={`${card.header.segCount} 段`} />}
        {showTotalCoefficient && <Stat label="总系数" value={`×${fmt(card.header.totalPer)}`} accent />}
        {showReleaseTime && <Stat
          label="释放用时"
          value={card.header.releaseSeconds != null ? `${card.header.releaseSeconds.toFixed(3)}s` : '—'}
          hint={card.header.releaseTimeSource === 'sourceDefault30' ? '源码默认30帧' : undefined}
        />}
        {showCooldown && <Stat label="冷却" value={card.header.cd != null ? `${fmt(card.header.cd)}s` : '—'} />}
        {/* 静态派生指标(若配置了 header scope 指标,如攻转概览) */}
        {headerMetrics.map((m) => (
          <Stat key={m.key} label={m.label} value={m.display == null ? '—' : String(m.display)} accent />
        ))}
        {/* 恒定的等级派生指标(如攻转)与固定耗蓝/固伤——属于静态数值,不进成长对比 */}
        {cols.staticMetrics.map((c) => (
          <Stat key={c.key} label={c.label} value={lastRow ? metricText(lastRow, c.key) : '—'} accent />
        ))}
        {card.skillBaseline?.fixedMultiplierMode === 'static' && (
          <Stat label="固伤倍率" value={fmtX(card.skillBaseline.fixedMultiplierStats?.median ?? card.skillBaseline.medianFixedMultiplier)} accent />
        )}
        {card.skillBaseline?.fixedMultiplierMode === 'static' && (
          <Stat label="固伤修正" value={fmtRatio(card.skillBaseline.correctionRatioStats?.median ?? card.skillBaseline.medianCorrectionRatio)} accent />
        )}
        {!isSkillExtraCard && cols.staticVal && <Stat label="总固伤" value={fmt(lastRow?.totalVal)} />}
        {cols.staticMp && <Stat label="耗蓝" value={fmt(lastRow?.consumeMp)} />}
      </div>}

      {/* 段明细 */}
      {segGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-5 py-3">
          {segGroups.map((g, i) => (
            <span key={i} className="rounded-md bg-surface px-2 py-1 text-xs text-textSub">
              {g.count}段 <span className="font-mono text-textMain">×{fmt(g.per)}</span>
            </span>
          ))}
        </div>
      )}

      {officialDescription && (
        <div className="border-t border-border px-5 py-3">
          <div className="rounded-lg bg-surface px-3 py-2">
            <div className="mb-1 text-[11px] text-textSub">官方描述</div>
            <div className="h-20 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-xs leading-relaxed text-textMain">
              {officialDescription}
            </div>
          </div>
        </div>
      )}

      {card.header.chainViz && <ChainViz viz={card.header.chainViz} />}

      {card.header.note && (
        <div className="border-t border-border px-5 py-3">
          <div className="rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-textSub whitespace-pre-line">
            {card.header.note}
          </div>
        </div>
      )}

      {card.header.mechanics && card.header.mechanics.length > 0 && (
        <div className="space-y-2 border-t border-border px-5 py-3">
          <div className="text-[11px] text-textSub">机制说明</div>
          {card.header.mechanics.map((item, index) => (
            <div key={`${item.label}-${index}`} className="rounded-lg bg-surface px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold text-textSub">{item.label}</div>
              <div className="break-words text-xs leading-relaxed text-textMain">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 固定 buff(不随等级变) */}
      {card.header.fixedBuffs?.length > 0 && (
        <div className="space-y-1 border-t border-border px-5 py-3">
          <div className="text-[11px] text-textSub">固定效果</div>
          {card.header.fixedBuffs.map((b, i) => <BuffRow key={i} buff={b} />)}
        </div>
      )}

      {growthBuffEffects.length > 0 && (
        <div className="space-y-2 border-t border-border px-5 py-3">
          <div className="text-[11px] text-textSub">成长效果说明</div>
          {growthBuffEffects.map((effect) => (
            <div key={effect.key} className="rounded-lg bg-surface px-3 py-2 border-l-2 border-purple-500/40">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-textMain">{effect.title}</span>
                {effect.meta && <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-textSub">{effect.meta}</span>}
                {effect.fixedParts.map((part) => (
                  <span key={part} className="rounded bg-card px-1.5 py-0.5 font-mono text-[10px] text-cta">{part}</span>
                ))}
              </div>
              {effect.detail && <div className="mt-1 pl-1 text-xs leading-relaxed text-textSub">{effect.detail}</div>}
              {effect.formulaNote && <div className="mt-1 pl-1 text-xs leading-relaxed text-textSub">{effect.formulaNote}</div>}
            </div>
          ))}
        </div>
      )}

      {isPassiveCard && passiveRows.length > 0 && (
        <div className="space-y-3 border-t border-border px-5 py-4">
          <div className="text-xs text-textSub">被动等级效果</div>
          {passiveRows.map((level) => <PassiveLevelBlock key={level.level} level={level} />)}
        </div>
      )}

      {/* 成长区:数值随等级变化的列才展示;不随级成长的技能直接看附带效果 */}
      {!isPassiveCard && <div className="mt-auto border-t border-border px-5 py-4">
        <div className="mb-2 text-xs text-textSub">
          成长数值
        </div>
        {hasGrowthTable ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-[11px] text-textSub">
                  <Th sticky>等级</Th>
                  {cols.mp && <Th>耗蓝</Th>}
                  {cols.per && <Th>总系数</Th>}
                  {(cols.val || hasSkillExtraVal) && <Th>{isSkillExtraCard ? '技能固伤' : '总固伤'}</Th>}
                  {cols.baselineMultiplier && <Th>固伤倍率</Th>}
                  {cols.baselineCorrection && <Th>固伤修正</Th>}
                  {growthBuffCols.map((c) => (
                    <Th key={c.key}>
                      <div className="flex min-w-[7rem] flex-col gap-0.5">
                        <span>{c.label}</span>
                        {c.subLabel && <span className="text-[10px] font-normal text-textSub/70">{c.subLabel}</span>}
                      </div>
                    </Th>
                  ))}
                  {cols.metrics.map((c) => <Th key={c.key}>{c.label}</Th>)}
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((lv) => {
                  const baseline = baselineLevelByLevel.get(lv.level);
                  return (
                    <tr key={lv.level} className="border-t border-border/40">
                      <Td accent sticky>Lv.{lv.level}</Td>
                      {cols.mp && <Td>{fmt(lv.consumeMp)}</Td>}
                      {cols.per && <Td>×{fmt(lv.totalPer)}</Td>}
                      {(cols.val || hasSkillExtraVal) && <Td>{fmt(lv.totalVal)}</Td>}
                      {cols.baselineMultiplier && <Td cta>{fmtX(baseline?.fixedMultiplier)}</Td>}
                      {cols.baselineCorrection && <Td cta>{fmtRatio(baseline?.correctionRatio)}</Td>}
                      {growthBuffCols.map((c) => <Td key={c.key} cta>{(c.perLevel.get(lv.level) || ['—']).join(' / ')}</Td>)}
                      {cols.metrics.map((c) => <Td key={c.key} cta wrap>{metricText(lv, c.key)}</Td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg bg-card px-2.5 py-2 text-[11px] italic text-textSub/80">
            当前没有可展示的等级数值
          </div>
        )}
      </div>}

      {/* warning 折叠角标 */}
      {card.warnings?.length > 0 && (
        <details className="border-t border-border px-5 py-2">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" /> {card.warnings.length} 条数据提示
          </summary>
          <ul className="mt-2 space-y-1 text-[11px] text-textSub">
            {card.warnings.map((w, i) => (
              <li key={i}><span className="font-mono text-amber-500">{w.code}</span> {w.detail}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
