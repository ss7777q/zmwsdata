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

export function labelByBuffType(buff: BuffInfo): string | null {
  const type = buff.type;
  if (typeof type !== 'number') return null;

  const val = buff.value?.val;
  const per = buff.value?.per;
  const isNeg = (typeof val === 'number' && val < 0) || (typeof per === 'number' && per < 0);
  const text = buff.displayText || '';

  switch (type) {
    // 攻击类
    case 5:   // BUFF_ATK
    case 133: // BUFF_ATK_VSKILL
    case 134: // BUFF_ATK_BESKILL
    case 656: // BUFF_ADD_ATK_DAMAGE
      return isNeg ? '攻击降低' : '攻击提升';

    // 防御类
    case 6:   // BUFF_DEF
    case 202: // BUFF_DEF_2
    case 300: // BUFF_DEF_P
      return isNeg ? '防御降低' : '防御提升';
    case 301: // BUFF_DEFSUBTRACT_P
    case 501: // BUFF_RUODIAN_DEF
      return '防御降低';

    // 命中类
    case 7:   // BUFF_HITVAL
    case 271: // BUFF_HITVAL_2
    case 302: // BUFF_HITVAL_P
      return isNeg ? '命中降低' : '命中提升';

    // 闪避类
    case 8:   // BUFF_DODGE
    case 272: // BUFF_DODGE_2
    case 303: // BUFF_DODGE_P
      return isNeg ? '闪避降低' : '闪避提升';

    // 暴击类
    case 9:   // BUFF_CRIT
    case 307: // BUFF_CRIT_P
    case 500: // BUFF_RUODIAN_CRIT
      return isNeg ? '暴击降低' : '暴击提升';

    // 韧性类
    case 10:  // BUFF_TENACITY
    case 245: // BUFF_TENACITY_2
    case 304: // BUFF_TENACITY_P
      return isNeg ? '韧性降低' : '韧性提升';

    // 幸运类
    case 11:  // BUFF_LUCKY
    case 305: // BUFF_LUCKY_P
      return isNeg ? '幸运降低' : '幸运提升';

    // 守护类
    case 12:  // BUFF_GUARDIAN
    case 306: // BUFF_GUARDIAN_P
      return isNeg ? '守护降低' : '守护提升';

    // 护盾类
    case 13:  // BUFF_SHIELD_BLOOD
    case 187: // BUFF_SHIELD_DORSUM
    case 290: // BUFF_SHIELD_ADD
      return '护盾值';

    // 生命与回血类
    case 1:   // BUFF_CHANGE_HP
    case 165: // BUFF_CHANGE_HP_OTHER_PROP
      if (isNeg) return '生命扣减';
      return /每秒/.test(text) ? '每秒回血' : '回血值';

    case 29:  // BUFF_HEALHP
    case 257: // BUFF_HEALHP_2
    case 297: // BUFF_HEALHP_MAXHP
      return isNeg ? '回血降低' : '回血提升';

    case 19:  // BUFF_MAX_HP
      return isNeg ? '生命上限降低' : '生命上限提升';

    case 36:  // BUFF_CURE_PER
      return isNeg ? '治疗降低' : '治疗提升';
    case 37:  // BUFF_SHOW_CURE_PER
      return '治疗无效化';
    case 148: // BUFF_CURE
      return isNeg ? '治疗降低' : '治疗提升';

    case 32:  // BUFF_SUCK_HP
    case 195: // BUFF_SUCK_HP_MAX
      return '生命偷取';

    // 移速类
    case 4:   // BUFF_SPEED
    case 154: // BUFF_SPD_2
    case 265: // BUFF_FLY_SPD
      return isNeg ? '移速降低' : '移速提升';

    // 法力与回魔
    case 16:  // BUFF_CHANGE_MP
      return isNeg ? '法力扣减' : '法力回复';
    case 30:  // BUFF_HEALMP
    case 279: // BUFF_HEALMP_MAXMP
      return isNeg ? '回魔降低' : '回魔提升';

    // 无双
    case 22:  // BUFF_CHANGE_SP
    case 504: // BUFF_ADD_COUNT_SP
      return '无双回复';

    default:
      return null;
  }
}

export function inferGrowthBuffValueLabel(buff: BuffInfo) {
  const typeLabel = labelByBuffType(buff);
  if (typeLabel) return typeLabel;
  return cleanBuffName(buff.name) || '数值';
}

function growthBuffStatText(group: Pick<GrowthBuffGroup, 'effectName' | 'valueLabel' | 'template' | 'sample'>) {
  const sampleCleanText = (group.sample.displayText || '').split(/[；。]/)[0].replace(/^(?:命中附加|命中后|受击触发|受击后|释放附加|释放后|造成伤害时|攻击时|普攻时)/, '');
  return [group.effectName, group.valueLabel, sampleCleanText, cleanBuffName(group.sample.name)]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

export function growthBuffMetricLabelCandidates(group: Pick<GrowthBuffGroup, 'effectName' | 'valueLabel' | 'template' | 'sample'>) {
  const text = growthBuffStatText(group);
  const baseName = group.effectName.replace(/(强化|弱化|降低|提升|增加|减少|等级\d+.*|状态)/g, '');
  const candidates = [baseName + '率', group.valueLabel.replace(/值(?:\(.+\))?$/, '率'), group.effectName + '率'];
  if (/闪避/.test(text)) candidates.push('闪避率');
  if (/命中/.test(text)) candidates.push('命中率');
  if (/幸运/.test(text)) candidates.push('幸运率', '暴击增伤率');
  if (/守护/.test(text)) candidates.push('守护率', '暴击免伤率');
  if (/暴击/.test(text)) candidates.push('暴击率');
  if (/韧性/.test(text)) candidates.push('负暴击率');
  return [...new Set(candidates.filter(Boolean))];
}

export function growthBuffMetricMeaningLabel(group: Pick<GrowthBuffGroup, 'effectName' | 'valueLabel' | 'template' | 'sample'>, metricLabel?: string | null) {
  if (metricLabel) return metricLabel;
  const text = growthBuffStatText(group);
  if (/闪避/.test(text)) return '闪避率';
  if (/命中/.test(text)) return '命中率';
  if (/幸运/.test(text)) return '暴击增伤率';
  if (/守护/.test(text)) return '暴击免伤率';
  if (/暴击/.test(text)) return '暴击率';
  if (/韧性/.test(text)) return '负暴击率';
  return null;
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

export function growthBuffColumnLabel(effectName: string, valueLabel: string, _cardName?: string) {
  return valueLabel || effectName;
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
  metricLabel: string | null;
  subLabel: string | null;
  perLevel: Map<number, (string | React.ReactNode)[]>;
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
  const metrics = Array.isArray(lv?.metrics) ? lv.metrics : [];
  const m = metrics.find((x) => x.key === key);
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
