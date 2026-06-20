import type { BuffInfo, BuffValue, SkillLevel, SkillSegment } from './SkillCardTypes';

export function fmt(n: number | null | undefined) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

export function fmtX(n: number | null | undefined) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('zh-CN', { maximumFractionDigits: 3 })}X`;
}

export function fmtRatio(n: number | null | undefined) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${(n * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`;
}

/** 把段明细折叠成 "N段×系数" 的可读形式 */
export function describeSegments(segments: SkillSegment[]) {
  const groups: { per: number; count: number }[] = [];
  for (const s of segments) {
    const last = groups[groups.length - 1];
    if (last && last.per === s.per) last.count += s.maxHit;
    else groups.push({ per: s.per, count: s.maxHit });
  }
  return groups;
}

/** 去掉 buff 名里的"等级N"后缀(成长 buff 各级共用一个名字) */
export function cleanBuffName(name: string) {
  return name.replace(/等级\d+$/, '').replace(/[·\-_—]+$/, '').trim();
}

/** buff 持续时间:帧->秒;无可靠时间时前端不展示持续时间 */
export function buffDuration(time: number | string | null) {
  if (typeof time !== 'number') return null;
  if (time <= 0) return null;
  return `${(time / 30).toFixed(time % 30 === 0 ? 0 : 1)}s`;
}

/** buff 数值描述:per 是百分比/系数,val 是固定值。负数表示减益 */
export function buffValueText(v: BuffValue | null) {
  if (!v) return null;
  const parts: string[] = [];
  if (typeof v.per === 'number' && v.per !== 0) parts.push(`${(v.per * 100).toFixed(1)}%`);
  if (typeof v.val === 'number' && v.val !== 0) parts.push(fmt(v.val));
  return parts.length ? parts.join(' + ') : null;
}

export function inferGrowthBuffValueLabel(buff: BuffInfo) {
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

export function fmtPercent(n: number | null | undefined) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${(Math.abs(n) * 100).toLocaleString('zh-CN', { maximumFractionDigits: 3 })}%`;
}

export function fmtBuffVal(n: number | null | undefined, semanticText?: string | null) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return fmt(semanticText ? Math.abs(n) : n);
}

export function meaningfulValue(v: number | null | undefined) {
  return typeof v === 'number' && !Number.isNaN(v) && v !== 0 ? v : null;
}

export function numericTokens(text: string) {
  const tokens = text.match(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g) || [];
  return new Set(tokens.map((token) => token.replace(/,/g, '')));
}

export function intersectSets(sets: Set<string>[]) {
  if (!sets.length) return new Set<string>();
  const common = new Set(sets[0]);
  for (const set of sets.slice(1)) {
    for (const token of [...common]) if (!set.has(token)) common.delete(token);
  }
  return common;
}

export function compactEffectText(text: string, commonNumbers: Set<string>) {
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

export function effectTemplate(buff: BuffInfo, commonNumbers: Set<string>, dynamicVal: boolean, dynamicPer: boolean) {
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

export function valuesDiffer(values: (number | null | undefined)[]) {
  const meaningful = values.map(meaningfulValue).filter((v): v is number => v != null);
  return new Set(meaningful.map(String)).size > 1;
}

export function fixedMeaningfulValue(values: (number | null | undefined)[]) {
  const meaningful = values.map(meaningfulValue).filter((v): v is number => v != null);
  if (!meaningful.length) return null;
  const unique = new Set(meaningful.map(String));
  return unique.size === 1 ? meaningful[0] : null;
}

export function growthBuffGroupKey(buff: BuffInfo) {
  const shape = buff.displayText ? buff.displayText.replace(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g, '#') : '';
  return `${cleanBuffName(buff.name)}::${buff.bindLabel}::${buff.time ?? 'null'}::${shape}`;
}

export function growthBuffColumnLabel(effectName: string, valueLabel: string, cardName: string) {
  return effectName === cardName || effectName.startsWith(cardName) ? valueLabel : effectName;
}

export interface GrowthBuffGroup {
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

export interface GrowthBuffColumn {
  key: string;
  label: string;
  subLabel: string | null;
  perLevel: Map<number, string[]>;
}

export interface GrowthBuffEffectInfo {
  key: string;
  title: string;
  meta: string;
  detail: string | null;
  formulaNote: string | null;
  fixedParts: string[];
}

export function buildGrowthBuffGroups(levels: SkillLevel[]) {
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
export function metricText(lv: SkillLevel | undefined, key: string) {
  const m = lv?.metrics?.find((x) => x.key === key);
  if (!m || m.display == null) return '—';
  return String(m.display);
}

export function effectFormulaNote(group: GrowthBuffGroup, levels: SkillLevel[]) {
  const hasMetric = (key: string) => levels.some((lv) => lv.metrics?.some((metric) => metric.key === key));
  const text = [group.effectName, group.valueLabel, group.template, group.sample.displayText]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  if (/闪避/.test(text) && hasMetric('dodgeRate')) return '闪避率 = 闪避值 /（闪避值 + 当前等级对应角色等级的通用抗值）';
  return null;
}
