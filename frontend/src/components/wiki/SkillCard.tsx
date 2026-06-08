import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, Clock, Layers, Sparkles, Zap } from 'lucide-react';

export interface BuffValue {
  per: number | null;
  val: number | null;
}
export interface BuffInfo {
  name: string;
  bindLabel: string;
  time: number | null;
  value: BuffValue | null;
  /** 覆盖机制产出的成文描述;存在时前端直接显示它,不再机械拼 per/val */
  displayText?: string | null;
}
export interface FixedBuff extends BuffInfo {
  baseBuffId: number;
  text: string | null;
}
export interface SkillSegment {
  per: number;
  maxHit: number;
  from?: string;
}
/** 派生指标(蓝转/攻转/闪避率/血蓝比…),提取阶段算好,前端纯渲染 */
export interface SkillMetric {
  key: string;
  label: string;
  value: number | null;
  display: string | number | null;
}
export interface SkillBaselineLevel {
  level: number;
  xRaw: number;
  x: number;
  xNearestInteger: number;
  fixedMultiplier: number;
  correctionRatio: number;
}
export interface SkillBaselineStats {
  min: number;
  max: number;
  median: number;
  range: number;
  relativeRange: number | null;
}
export interface SkillBaselineData {
  fixedMultiplierMode: 'static' | 'growth';
  fixedMultiplierStats: SkillBaselineStats;
  correctionRatioStats: SkillBaselineStats;
  medianFixedMultiplier: number;
  medianCorrectionRatio: number;
  levels: SkillBaselineLevel[];
}
export interface SkillChainNode {
  label: string;
  source: string;
  per: number;
  hits: number;
  totalPer: number;
}
export interface SkillChainLane {
  label: string;
  role: string;
  totalHits: number;
  totalPer: number;
  nodes: SkillChainNode[];
}
export interface SkillChainViz {
  kind: string;
  title: string;
  source: string;
  lanes: SkillChainLane[];
}
export interface SkillLevel {
  level: number;
  roleLevel: number | null;
  consumeMp: number | null;
  segmentVals: { val: number; maxHit: number }[];
  totalPer: number;
  totalVal: number;
  growthBuffs: BuffInfo[];
  metrics?: SkillMetric[];
}
export interface SkillWarning {
  code: string;
  detail?: string;
}
export interface SkillCardData {
  skillId: number;
  name: string;
  icon: string | null;
  attribute: number | null;
  entityAction: string | null;
  desIntro: string | null;
  header: {
    kind: string | null;
    segments: SkillSegment[];
    segCount: number;
    totalPer: number | null;
    releaseFrames: number | null;
    releaseSeconds: number | null;
    releaseTimeSource: string;
    cd: number | null;
    addDefendVal: number | null;
    cfgFileResolved: string | null;
    cfgResolveSource: string | null;
    fixedBuffs: FixedBuff[];
    metrics?: SkillMetric[];
    chainViz?: SkillChainViz | null;
    note?: string | null;
  };
  maxLevel: number;
  levels: SkillLevel[];
  warnings: SkillWarning[];
  skillBaseline?: SkillBaselineData | null;
  identicalToBase?: boolean;
  error?: string;
}

function fmt(n: number | null | undefined) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

function fmtX(n: number | null | undefined) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('zh-CN', { maximumFractionDigits: 3 })}X`;
}

function fmtRatio(n: number | null | undefined) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${(n * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`;
}

/** 把段明细折叠成 "N段×系数" 的可读形式 */
function describeSegments(segments: SkillSegment[]) {
  const groups: { per: number; count: number }[] = [];
  for (const s of segments) {
    const last = groups[groups.length - 1];
    if (last && last.per === s.per) last.count += s.maxHit;
    else groups.push({ per: s.per, count: s.maxHit });
  }
  return groups;
}

/** 去掉 buff 名里的"等级N"后缀(成长 buff 各级共用一个名字) */
function cleanBuffName(name: string) {
  return name.replace(/等级\d+$/, '').replace(/[·\-_—]+$/, '').trim();
}

/** buff 持续时间:帧->秒,-1 表示永久 */
function buffDuration(time: number | null) {
  if (time == null) return null;
  if (time < 0) return '永久';
  return `${(time / 30).toFixed(time % 30 === 0 ? 0 : 1)}s`;
}

/** buff 数值描述:per 是百分比/系数,val 是固定值。负数表示减益 */
function buffValueText(v: BuffValue | null) {
  if (!v) return null;
  const parts: string[] = [];
  if (typeof v.per === 'number' && v.per !== 0) parts.push(`${(v.per * 100).toFixed(1)}%`);
  if (typeof v.val === 'number' && v.val !== 0) parts.push(fmt(v.val));
  return parts.length ? parts.join(' + ') : null;
}

function inferGrowthBuffValueLabel(buff: BuffInfo) {
  const text = buff.displayText || cleanBuffName(buff.name);
  if (/固伤/.test(text)) return '固伤';
  if (/护盾|抵挡/.test(text)) return '护盾值';
  if (/恢复.*生命|回血|回复.*生命/.test(text)) return /每秒/.test(text) ? '每秒回血' : '回血值';
  if (/减伤/.test(text)) return /降低|扣减/.test(text) ? '减伤降低' : '减伤值';
  if (/防御/.test(text)) return /降低|扣减/.test(text) ? '防御降低' : '防御值';
  if (/守护/.test(text)) return /降低|扣减/.test(text) ? '守护降低' : '守护值';
  if (/韧性/.test(text)) return /降低|扣减/.test(text) ? '韧性降低' : '韧性值';
  if (/闪避/.test(text)) return /降低|下降|弱化/.test(text) ? '闪避降低' : '闪避值';
  if (/命中/.test(text)) return /降低|下降|弱化/.test(text) ? '命中降低' : '命中值';
  if (/暴击/.test(text)) return /降低|下降|弱化/.test(text) ? '暴击降低' : '暴击值';
  if (/攻击/.test(text)) return /降低|下降|弱化/.test(text) ? '攻击降低' : '攻击值';
  if (/伤害|灼烧|中毒|毒伤|真伤|固伤/.test(text)) return '伤害值';
  return cleanBuffName(buff.name);
}

function fmtPercent(n: number | null | undefined) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${(Math.abs(n) * 100).toLocaleString('zh-CN', { maximumFractionDigits: 3 })}%`;
}

function fmtBuffVal(n: number | null | undefined, semanticText?: string | null) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return fmt(semanticText ? Math.abs(n) : n);
}

function meaningfulValue(v: number | null | undefined) {
  return typeof v === 'number' && !Number.isNaN(v) && v !== 0 ? v : null;
}

function numericTokens(text: string) {
  const tokens = text.match(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g) || [];
  return new Set(tokens.map((token) => token.replace(/,/g, '')));
}

function intersectSets(sets: Set<string>[]) {
  if (!sets.length) return new Set<string>();
  const common = new Set(sets[0]);
  for (const set of sets.slice(1)) {
    for (const token of [...common]) if (!set.has(token)) common.delete(token);
  }
  return common;
}

function compactEffectText(text: string, commonNumbers: Set<string>) {
  return text
    .replace(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g, (token) => {
      const normalized = token.replace(/,/g, '');
      return commonNumbers.has(normalized) ? token : '';
    })
    .replace(/\s+点/g, '点')
    .replace(/(^|[^X\d])点(?=(生命|护盾|防御|守护|韧性|闪避|命中|攻击|伤害|固伤|减伤|生命值|护盾值))/g, '$1')
    .replace(/\+\s*(?=(固伤|生命|护盾|伤害))/g, '+ ')
    .replace(/\s+/g, ' ')
    .replace(/：\s+/g, '：')
    .replace(/，\s+/g, '，')
    .trim();
}

function effectTemplate(buff: BuffInfo, commonNumbers: Set<string>, dynamicVal: boolean, dynamicPer: boolean) {
  const text = buff.displayText?.trim();
  if (!text) return null;
  const valCandidates = new Set(
    [buff.value?.val, Math.abs(buff.value?.val ?? Number.NaN)]
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v) && v !== 0)
      .map(String)
  );
  const perCandidates = new Set(
    [buff.value?.per, Math.abs(buff.value?.per ?? Number.NaN), Math.abs(buff.value?.per ?? Number.NaN) * 100]
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v) && v !== 0)
      .map((v) => String(Number(v.toFixed(6))))
  );
  const templated = text.replace(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g, (token, offset) => {
    const normalized = token.replace(/,/g, '').replace(/%$/, '');
    const after = text.slice(offset + token.length, offset + token.length + 1);
    if (commonNumbers.has(normalized) && /[s秒帧]/.test(after)) return token;
    if (dynamicVal && valCandidates.has(normalized)) return 'X';
    if (dynamicPer && perCandidates.has(normalized)) return 'X';
    return commonNumbers.has(normalized) || commonNumbers.has(`${normalized}%`) ? token : '__DROP_NUM__';
  })
    .replace(/，[^，；。]*__DROP_NUM__[^，；。]*(?=，|；|。|$)/g, '')
    .replace(/；[^，；。]*__DROP_NUM__[^，；。]*(?=，|；|。|$)/g, '')
    .replace(/__DROP_NUM__/g, '');
  return compactEffectText(templated, new Set([...commonNumbers, 'X']));
}

function valuesDiffer(values: (number | null | undefined)[]) {
  const meaningful = values.map(meaningfulValue).filter((v): v is number => v != null);
  return new Set(meaningful.map(String)).size > 1;
}

function fixedMeaningfulValue(values: (number | null | undefined)[]) {
  const meaningful = values.map(meaningfulValue).filter((v): v is number => v != null);
  if (!meaningful.length) return null;
  const unique = new Set(meaningful.map(String));
  return unique.size === 1 ? meaningful[0] : null;
}

function growthBuffGroupKey(buff: BuffInfo) {
  const shape = buff.displayText ? buff.displayText.replace(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g, '#') : '';
  return `${cleanBuffName(buff.name)}::${buff.bindLabel}::${buff.time ?? 'null'}::${shape}`;
}

function growthBuffColumnLabel(effectName: string, valueLabel: string, cardName: string) {
  return effectName === cardName || effectName.startsWith(cardName) ? valueLabel : effectName;
}

interface GrowthBuffGroup {
  key: string;
  effectName: string;
  valueLabel: string;
  bindLabel: string;
  sample: BuffInfo;
  commonNumbers: Set<string>;
  dynamicPer: boolean;
  dynamicVal: boolean;
  fixedPer: number | null;
  fixedVal: number | null;
  template: string | null;
}

interface GrowthBuffColumn {
  key: string;
  label: string;
  subLabel: string | null;
  perLevel: Map<number, string[]>;
}

interface GrowthBuffEffectInfo {
  key: string;
  title: string;
  meta: string;
  detail: string | null;
  formulaNote: string | null;
  fixedParts: string[];
}

function buildGrowthBuffGroups(levels: SkillLevel[]) {
  const byKey = new Map<string, { key: string; effectName: string; bindLabel: string; sample: BuffInfo; buffs: BuffInfo[] }>();
  for (const lv of levels) {
    for (const buff of lv.growthBuffs || []) {
      const key = growthBuffGroupKey(buff);
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          effectName: cleanBuffName(buff.name),
          bindLabel: buff.bindLabel,
          sample: buff,
          buffs: [],
        });
      }
      byKey.get(key)!.buffs.push(buff);
    }
  }

  return [...byKey.values()].map<GrowthBuffGroup>((group) => {
    const displayTexts = group.buffs.map((buff) => buff.displayText?.trim()).filter((text): text is string => Boolean(text));
    const commonNumbers = intersectSets(displayTexts.map(numericTokens));
    const dynamicVal = valuesDiffer(group.buffs.map((buff) => buff.value?.val));
    const dynamicPer = valuesDiffer(group.buffs.map((buff) => buff.value?.per));
    return {
      key: group.key,
      effectName: group.effectName,
      valueLabel: inferGrowthBuffValueLabel(group.sample),
      bindLabel: group.bindLabel,
      sample: group.sample,
      commonNumbers,
      dynamicPer,
      dynamicVal,
      fixedPer: fixedMeaningfulValue(group.buffs.map((buff) => buff.value?.per)),
      fixedVal: fixedMeaningfulValue(group.buffs.map((buff) => buff.value?.val)),
      template: effectTemplate(group.sample, commonNumbers, dynamicVal, dynamicPer),
    };
  });
}

/** 取某级某指标的展示值 */
function metricText(lv: SkillLevel | undefined, key: string) {
  const m = lv?.metrics?.find((x) => x.key === key);
  if (!m || m.display == null) return '—';
  return String(m.display);
}

function effectFormulaNote(group: GrowthBuffGroup, levels: SkillLevel[]) {
  const hasMetric = (key: string) => levels.some((lv) => lv.metrics?.some((metric) => metric.key === key));
  const text = [group.effectName, group.valueLabel, group.template, group.sample.displayText]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  if (/闪避/.test(text) && hasMetric('dodgeRate')) return '闪避率 = 闪避值 /（闪避值 + 当前等级对应角色等级的通用抗值）';
  return null;
}

function BuffRow({ buff }: { buff: BuffInfo }) {
  const dur = buffDuration(buff.time);
  const valTxt = buffValueText(buff.value);

  if (buff.displayText) {
    return (
      <div className="flex flex-col gap-1 rounded-lg bg-card px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-xs font-semibold text-textMain">{cleanBuffName(buff.name)}</span>
          <span className="shrink-0 rounded bg-surface px-1 text-[10px] text-textSub">{buff.bindLabel}</span>
        </div>
        <div className="text-xs text-cta leading-relaxed pl-[20px] break-words">
          {buff.displayText}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <Sparkles className="h-3 w-3 shrink-0 text-primary" />
        <span className="truncate text-xs text-textMain">{cleanBuffName(buff.name)}</span>
        <span className="shrink-0 rounded bg-surface px-1 text-[10px] text-textSub">{buff.bindLabel}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
        {valTxt && <span className="text-cta">{valTxt}</span>}
        {dur && <span className="text-textSub">{dur}</span>}
      </div>
    </div>
  );
}

function ChainViz({ viz }: { viz: SkillChainViz }) {
  return (
    <div className="border-t border-border px-5 py-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-textSub">
        <span>{viz.title}</span>
        <span className="hidden truncate font-mono sm:block">{viz.source}</span>
      </div>
      <div className="space-y-2 overflow-x-auto pb-1">
        {viz.lanes.map((lane) => (
          <div key={`${viz.kind}-${lane.role}-${lane.label}`} className="min-w-[21rem] rounded-lg bg-surface px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-textMain">{lane.label}</span>
              <span className="font-mono text-[11px] text-cta">
                {lane.totalHits}段 ×{fmt(lane.totalPer)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {lane.nodes.map((node, index) => (
                <div key={`${node.source}-${index}`} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-textSub/60" />}
                  <div className="min-w-[6.8rem] rounded-md border border-border bg-card px-2 py-1.5">
                    <div className="truncate text-[11px] font-medium text-textMain">{node.label}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-textSub">
                      {node.hits}段 ×{fmt(node.per)} = ×{fmt(node.totalPer)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const hasGrowthTable = cols.mp || cols.per || cols.val || cols.baselineMultiplier || cols.baselineCorrection || cols.metrics.length > 0 || growthBuffCols.length > 0;
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
  const showDamageSummary = (card.header.segCount ?? 0) !== 0 || (card.header.totalPer ?? 0) !== 0;

  return (
    <div className="flex flex-col rounded-[20px] border border-border bg-card shadow-sm overflow-hidden">
      {/* 卡头 */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Zap className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-textMain">{card.name}</span>
            {badge && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{badge}</span>
            )}
          </div>
          <div className="text-xs text-textSub">{slotLabel}</div>
        </div>
      </div>

      {/* 表头区:不随等级变 */}
      <div className="grid grid-cols-2 gap-px bg-border/40 text-sm">
        {showDamageSummary && <Stat icon={<Layers className="h-3.5 w-3.5" />} label="段数" value={`${card.header.segCount} 段`} />}
        {showDamageSummary && <Stat label="总系数" value={`×${fmt(card.header.totalPer)}`} accent />}
        <Stat
          icon={<Clock className="h-3.5 w-3.5" />}
          label="释放用时"
          value={card.header.releaseSeconds != null ? `${card.header.releaseSeconds.toFixed(3)}s` : '—'}
          hint={card.header.releaseTimeSource === 'sourceDefault30' ? '源码默认30帧' : undefined}
        />
        <Stat label="冷却" value={card.header.cd != null ? `${fmt(card.header.cd)}s` : '—'} />
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
        {cols.staticVal && <Stat label="总固伤" value={fmt(lastRow?.totalVal)} />}
        {cols.staticMp && <Stat label="耗蓝" value={fmt(lastRow?.consumeMp)} />}
      </div>

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
          <div className="rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-textSub">
            {card.header.note}
          </div>
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
            <div key={effect.key} className="rounded-lg bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-xs font-semibold text-textMain">{effect.title}</span>
                {effect.meta && <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-textSub">{effect.meta}</span>}
                {effect.fixedParts.map((part) => (
                  <span key={part} className="rounded bg-card px-1.5 py-0.5 font-mono text-[10px] text-cta">{part}</span>
                ))}
              </div>
              {effect.detail && <div className="mt-1 pl-5 text-xs leading-relaxed text-textSub">{effect.detail}</div>}
              {effect.formulaNote && <div className="mt-1 pl-5 text-xs leading-relaxed text-textSub">{effect.formulaNote}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 成长区:数值随等级变化的列才展示;不随级成长的技能直接看附带效果 */}
      <div className="mt-auto border-t border-border px-5 py-4">
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
                  {cols.val && <Th>总固伤</Th>}
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
                      {cols.val && <Td>{fmt(lv.totalVal)}</Td>}
                      {cols.baselineMultiplier && <Td cta>{fmtX(baseline?.fixedMultiplier)}</Td>}
                      {cols.baselineCorrection && <Td cta>{fmtRatio(baseline?.correctionRatio)}</Td>}
                      {growthBuffCols.map((c) => <Td key={c.key} cta wrap>{(c.perLevel.get(lv.level) || ['—']).join(' / ')}</Td>)}
                      {cols.metrics.map((c) => <Td key={c.key} cta>{metricText(lv, c.key)}</Td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg bg-card px-2.5 py-2 text-[11px] italic text-textSub/80">
            本技能数值不随等级成长
          </div>
        )}
      </div>

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

function Stat({ icon, label, value, accent, hint }: { icon?: React.ReactNode; label: string; value: string; accent?: boolean; hint?: string }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <div className="flex items-center gap-1 text-[11px] text-textSub">{icon}{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${accent ? 'text-primary' : 'text-textMain'}`}>{value}</div>
      {hint && <div className="text-[10px] text-amber-500">{hint}</div>}
    </div>
  );
}

function Th({ children, sticky }: { children: React.ReactNode; sticky?: boolean }) {
  const pin = sticky ? 'sticky left-0 z-20 bg-card shadow-[4px_0_10px_rgba(15,23,42,0.08)]' : '';
  return <th className={`px-2 py-1 text-left font-medium whitespace-nowrap ${pin}`}>{children}</th>;
}
function Td({ children, accent, cta, wrap, sticky }: { children: React.ReactNode; accent?: boolean; cta?: boolean; wrap?: boolean; sticky?: boolean }) {
  const tone = accent ? 'text-textMain font-semibold' : cta ? 'text-cta' : 'text-textSub';
  const flow = wrap ? 'min-w-[8rem] max-w-[18rem] whitespace-normal break-words leading-relaxed' : 'whitespace-nowrap';
  const pin = sticky ? 'sticky left-0 z-10 bg-card shadow-[4px_0_10px_rgba(15,23,42,0.08)]' : '';
  return <td className={`px-2 py-1 align-top ${flow} ${tone} ${pin}`}>{children}</td>;
}
