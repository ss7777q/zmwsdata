
export interface BuffValue {
  per: number | null;
  val: number | null;
}
export interface BuffInfo {
  name: string;
  bindLabel: string;
  time: number | string | null;
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
export interface SkillMechanic {
  label: string;
  value: string;
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
  totalPer: number | null;
  totalVal: number | null;
  growthBuffs: BuffInfo[];
  metrics?: SkillMetric[];
  passive?: PassiveLevelInfo;
}
export interface PassiveMetric {
  label: string;
  value: string | number | boolean | null;
  raw?: unknown;
}
export interface PassiveBeskillInfo {
  id: number;
  source: string;
  name: string;
  label: string | null;
  type: number | null;
  attribute: unknown;
  otherData: unknown;
  text: string | null;
  desc: string | null;
  effects?: PassiveMetric[];
}
export interface PassiveCost {
  itemId: number;
  name: string;
  count: number | string | Record<string, number> | null;
}
export interface PassiveLevelInfo {
  id: number;
  group: number;
  passiveName: string;
  text: string | null;
  unlockType: number | null;
  number: unknown;
  rankCost: PassiveCost[] | null;
  inherit: number | null;
  label: number | null;
  stageType: unknown;
  stageTypeNo: unknown;
  closeRankUp: unknown;
  directBeskills: PassiveBeskillInfo[];
  makeUpBeskills: PassiveBeskillInfo[];
  initializeBeskills: PassiveBeskillInfo[];
}
export interface SkillWarning {
  code: string;
  detail?: string;
}
export interface SkillCardData {
  skillId: number;
  name: string;
  icon: string | null;
  extraKind?: string;
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
    mechanics?: SkillMechanic[];
    chainViz?: SkillChainViz | null;
    note?: string | null;
    totalValLabel?: string | null;
  };
  maxLevel: number;
  levels: SkillLevel[];
  warnings: SkillWarning[];
  skillBaseline?: SkillBaselineData | null;
  identicalToBase?: boolean;
  passiveKind?: boolean;
  error?: string;
}
