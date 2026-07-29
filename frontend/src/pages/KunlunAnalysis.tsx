import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Castle, Coins, Search, Swords } from 'lucide-react';
import { clsx } from 'clsx';

type SkillRef = {
  id: number;
  slot: string;
  name: string | null;
  cd?: number | null;
  lockRange?: number | null;
  maxRadius?: number | null;
  beSkill?: number[] | null;
};

type BuffRef = { id: number; name: string | null; text: string | null; value: unknown };

type StageLevelStat = { lv: number; atk: number | null; hp: number | null };

type TowerLevel = {
  id: number;
  name: string;
  level: number;
  desc: string | null;
  icon: string | null;
  buildCost: number | null;
  upgradeCost: number | null;
  dismantleReturn: number | null;
  atkCoef: number | number[];
  hpCoef: number | number[];
  atkCd: number | null;
  skills: SkillRef[];
  initBuffs: BuffRef[];
  statsByStageLevel: StageLevelStat[];
  stageLimitCount: number | null;
};

type AnalysisSkill = { id: number; name: string; slot: string; cd: number | null; desc: string };
type AnalysisBuff = { id: number; name: string; effect: string };
type AnalysisLevel = {
  id: number;
  name: string;
  level: number;
  attack?: { atkCoef?: unknown; hpCoef?: unknown; atkCd?: unknown; range?: unknown };
  skills?: AnalysisSkill[];
  buffs?: AnalysisBuff[];
  mechanics?: string;
};

type CostEntry = { itemId: number; name: string; count: number };

type TowerGroup = {
  group: number;
  groupName: string;
  levelChain: string[];
  category: string | null;
  role: string | null;
  overview: string | null;
  targeting: string | null;
  counters: string | null;
  weaknesses: string | null;
  synergy: string | null;
  analysisLevels: AnalysisLevel[] | null;
  uncertainties: string[] | null;
  hasAnalysis: boolean;
  unlock: {
    unlockType: number | null;
    unlockCost: CostEntry[] | null;
    canTry: boolean;
  } | null;
  levels: TowerLevel[];
};

type Wave = {
  waveId: number;
  hp: number;
  hpDouble: number;
  atk: number;
  moneyMonster: [number, number] | null;
  moneyWave: number | null;
};

type KunlunStage = {
  id: number;
  group: number;
  groupName: string;
  name: string;
  level: number;
  normal: { stageId: number; desc: string | null; initMoney: number; waves: Wave[] };
  speed: { stageId: number; initMoney: number; waves: Wave[] };
};

type KunlunPayload = {
  towerGroups?: TowerGroup[];
  stages?: KunlunStage[];
  stageLevels?: number[];
  notes?: Record<string, string>;
};

type PvpUnlock = { buildPoints?: number | null; buildCost?: number | null; upgradeCost?: number | null; perWave?: number | null };
type PvpUnit = {
  id?: number;
  name?: string;
  stats?: Record<string, number | string | null>;
  skills?: { name: string; cd?: number | null; desc: string }[];
  desc?: string;
};
type PvpLevel = {
  id: number;
  name: string;
  level: number;
  unlock?: PvpUnlock;
  stats?: Record<string, number | string | null>;
  skills?: { name: string; cd?: number | null; desc: string }[];
  buffs?: { name: string; effect: string }[];
  mechanics?: string;
  unit?: PvpUnit | null;
};
type PvpSeries = {
  key: string;
  kind: string;
  groupName: string;
  element?: string;
  resist?: string;
  role?: string;
  overview?: string;
  targeting?: string;
  counters?: string;
  weaknesses?: string;
  synergy?: string;
  levels: PvpLevel[];
  featureText?: string;
  uncertainties?: string[];
};
type PvpWave = { waveId: number; hp: number; atk: number; moneyMonster: [number, number] | null; moneyWave: number | null };
type PvpPayload = {
  series?: PvpSeries[];
  waves?: PvpWave[];
  rules?: Record<string, string>;
};

interface Props {
  dataSources: Record<string, any>;
}

const CATEGORY_ORDER = ['输出塔', '控制塔', '辅助塔', '召唤塔', '法阵', '陷阱', '城墙', '特殊'];
const ALL_CATEGORY = '全部';

function fmtNum(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-Hans-CN');
}

function fmtCoef(coef: number | number[]) {
  if (Array.isArray(coef)) return `×${coef[0]}${coef[1] ? ` +${coef[1]}` : ''}`;
  return `×${coef}`;
}

function TowerStatsTable({ tower }: { tower: TowerGroup }) {
  const levels = tower.levels;
  const stageLevels = levels[0]?.statsByStageLevel.map((s) => s.lv) ?? [];
  const showAtk = levels.some((l) => (Array.isArray(l.atkCoef) ? l.atkCoef[0] : l.atkCoef) > 0);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-slate-500/[0.04] text-xs text-textSub">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">关卡等级</th>
              {levels.map((l) => (
                <th key={l.id} className="px-3 py-2.5 text-center font-semibold" colSpan={showAtk ? 1 : 1}>
                  {l.name}
                  <div className="mt-0.5 font-normal text-[11px]">
                    {showAtk ? `攻击${fmtCoef(l.atkCoef)}` : `血量${fmtCoef(l.hpCoef)}`}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {stageLevels.map((lv, rowIdx) => (
              <tr key={lv}>
                <td className="px-3 py-2 font-mono text-xs text-textSub">Lv.{lv}</td>
                {levels.map((l) => {
                  const stat = l.statsByStageLevel[rowIdx];
                  return (
                    <td key={l.id} className="px-3 py-2 text-center font-mono text-xs text-textMain">
                      {showAtk ? fmtNum(stat?.atk) : fmtNum(stat?.hp)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border/50 px-3 py-2 text-[11px] leading-5 text-textSub">
        {showAtk ? '表内为各关卡等级下的实际攻击力(基准攻击 × 塔系数)。' : '该塔系无攻击,表内为实际血量(基准血量 × 塔系数)。'}
        攻击节奏与机制详见上方逐级解析。
      </div>
    </div>
  );
}

function EconomyRow({ tower }: { tower: TowerGroup }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tower.levels.map((l, i) => (
        <span key={l.id} className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-textSub">
          {l.name}：{i === 0 ? `建造 ${fmtNum(l.buildCost)}` : `升级 ${fmtNum(tower.levels[i - 1].upgradeCost)}`}
          {l.dismantleReturn != null ? ` · 拆除返还 ${fmtNum(l.dismantleReturn)}` : ''}
        </span>
      ))}
    </div>
  );
}

function AnalysisSection({ tower }: { tower: TowerGroup }) {
  if (!tower.hasAnalysis) return null;
  const infoRows: Array<[string, string | null]> = [
    ['索敌方式', tower.targeting],
    ['适用场景', tower.counters],
    ['短板', tower.weaknesses],
    ['联动机制', tower.synergy],
  ];
  return (
    <>
      {tower.overview ? (
        <section className="border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-textMain">机制总览</h3>
          <p className="text-sm leading-7 text-textSub">{tower.overview}</p>
        </section>
      ) : null}
      <section className="border-t border-border pt-5">
        <h3 className="mb-3 text-sm font-semibold text-textMain">作战要点</h3>
        <div className="space-y-2.5">
          {infoRows.filter(([, v]) => v && v.trim()).map(([label, value]) => (
            <p key={label} className="flex gap-3 text-sm leading-7 text-textSub">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <span className="break-words"><span className="font-semibold text-textMain">{label}：</span>{value}</span>
            </p>
          ))}
        </div>
      </section>
      {(tower.analysisLevels || []).some((l) => (l.skills || []).length || (l.buffs || []).length || l.mechanics) ? (
        <section className="border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-textMain">逐级解析</h3>
          <div className="space-y-4">
            {(tower.analysisLevels || []).map((l) => (
              <div key={l.id} className="rounded-lg border border-border bg-surface/45 p-4">
                <div className="text-sm font-semibold text-textMain">{l.level} 级 · {l.name}</div>
                {l.mechanics ? <p className="mt-2 text-sm leading-7 text-textSub">{l.mechanics}</p> : null}
                {(l.skills || []).length ? (
                  <div className="mt-3 space-y-1.5">
                    {(l.skills || []).map((s) => (
                      <p key={`${s.id}-${s.slot}`} className="text-xs leading-6 text-textSub">
                        <span className="font-semibold text-textMain">{s.name}</span>
                        {s.cd ? <span className="ml-1.5 text-primary">CD {s.cd}s</span> : null}
                        {s.desc ? <span className="ml-1.5">{s.desc}</span> : null}
                      </p>
                    ))}
                  </div>
                ) : null}
                {(l.buffs || []).length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(l.buffs || []).map((b) => (
                      <span key={b.id} className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                        {b.name}{b.effect ? `：${b.effect}` : ''}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {(tower.uncertainties || []).length ? (
        <section className="border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-textMain">仍待核对</h3>
          <div className="space-y-2.5">
            {(tower.uncertainties || []).map((item) => (
              <p key={item} className="flex gap-3 text-sm leading-7 text-textSub">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <span className="break-words">{item}</span>
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function TowersView({ towerGroups }: { towerGroups: TowerGroup[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);

  const categories = useMemo(() => {
    const present = new Set(towerGroups.map((t) => t.category).filter(Boolean) as string[]);
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [towerGroups]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return towerGroups.filter((t) => {
      if (category !== ALL_CATEGORY && t.category !== category) return false;
      if (!keyword) return true;
      const text = `${t.groupName} ${t.levelChain.join(' ')} ${t.overview || ''} ${t.role || ''}`.toLowerCase();
      return text.includes(keyword);
    });
  }, [towerGroups, query, category]);

  const active = filtered.find((t) => t.group === selectedGroup) || filtered[0] || null;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm lg:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px] md:items-end">
          <label className="text-sm text-textSub">
            <span className="mb-2 flex items-center gap-2 font-medium"><Search className="h-4 w-4" />搜索</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="input w-full" placeholder="塔名、机制关键词" />
          </label>
          <label className="text-sm text-textSub">
            <span className="mb-2 flex items-center gap-2 font-medium"><Castle className="h-4 w-4" />类型</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input w-full">
              <option value={ALL_CATEGORY}>{ALL_CATEGORY}</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-lg border border-border bg-card p-3 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-8rem)] xl:overflow-auto">
          <div className="mb-2 px-2 py-2 text-sm font-semibold text-textMain">防御塔（{filtered.length}）</div>
          <div className="mobile-scroll-container">
            <div className="mobile-scroll-list-xl custom-scrollbar">
              {filtered.map((t) => {
                const selected = t.group === active?.group;
                return (
                  <button
                    key={t.group}
                    type="button"
                    onClick={() => setSelectedGroup(t.group)}
                    className={clsx(
                      'mobile-scroll-item-xl rounded-lg border px-4 py-3 text-left transition-colors',
                      selected ? 'border-primary bg-primary/10' : 'border-border bg-surface/45 hover:border-primary/40 hover:bg-surface'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 text-xs text-textSub">
                      <span>{t.category || '未分类'}</span>
                      <span>{t.levels.length} 级</span>
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-6 text-textMain">{t.groupName}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-textSub">{t.role || t.levelChain.join(' → ')}</div>
                  </button>
                );
              })}
              {filtered.length === 0 ? <div className="w-full rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-textSub">没有匹配的防御塔</div> : null}
            </div>
            <div className="mobile-scroll-mask-xl" />
          </div>
        </aside>

        <article className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm lg:p-6">
          {!active ? (
            <div className="py-20 text-center text-sm text-textSub">昆仑解析数据尚未生成</div>
          ) : (
            <div className="space-y-6">
              <header>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-textSub">
                  {active.category ? <span className="rounded-md border border-border bg-surface px-2.5 py-1">{active.category}</span> : null}
                  {active.unlock?.unlockCost?.length ? (
                    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-600">
                      解锁：{active.unlock.unlockCost.map((c) => `${c.name}×${c.count}`).join('、')}
                    </span>
                  ) : (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-600">默认解锁</span>
                  )}
                  {active.unlock?.canTry ? <span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">可试用</span> : null}
                  {active.levels[0]?.stageLimitCount ? <span className="rounded-md border border-border bg-surface px-2.5 py-1">全场限 {active.levels[0].stageLimitCount} 座</span> : null}
                  {!active.hasAnalysis ? (
                    <span className="flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />机制解析待补充
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-4 text-2xl font-bold leading-tight text-textMain lg:text-3xl">{active.groupName}</h2>
                <p className="mt-2 text-sm text-textSub">{active.levelChain.join(' → ')}</p>
                {active.role ? <p className="mt-3 text-sm leading-7 text-textSub"><span className="font-semibold text-textMain">定位：</span>{active.role}</p> : null}
              </header>

              <section className="border-t border-border pt-5">
                <h3 className="mb-3 text-sm font-semibold text-textMain">官方描述</h3>
                <div className="space-y-3">
                  {active.levels.map((l) => (
                    <div key={l.id} className="rounded-lg border border-border bg-surface/45 p-3">
                      <div className="text-xs font-semibold text-textMain">{l.level} 级 · {l.name}</div>
                      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-textSub">{l.desc || '无'}</p>
                    </div>
                  ))}
                </div>
              </section>

              <AnalysisSection tower={active} />

              <section className="border-t border-border pt-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-textMain"><Swords className="h-4 w-4" />属性成长</h3>
                <TowerStatsTable tower={active} />
              </section>

              <section className="border-t border-border pt-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-textMain"><Coins className="h-4 w-4" />建造经济（昆仑币）</h3>
                <EconomyRow tower={active} />
              </section>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

function WaveTable({ waves, initMoney }: { waves: Wave[]; initMoney: number }) {
  const bossWaveId = waves.length ? waves[waves.length - 1].waveId : null;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-slate-500/[0.04] text-xs text-textSub">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">波次</th>
              <th className="px-3 py-2.5 text-center font-semibold">血量系数</th>
              <th className="px-3 py-2.5 text-center font-semibold">攻击系数</th>
              <th className="px-3 py-2.5 text-center font-semibold">单怪掉落</th>
              <th className="px-3 py-2.5 text-center font-semibold">过波奖励</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {waves.map((w) => (
              <tr key={w.waveId} className={clsx(w.waveId === bossWaveId && 'bg-red-500/[0.04]')}>
                <td className="px-3 py-2 text-xs font-semibold text-textMain">
                  第 {w.waveId} 波{w.waveId === bossWaveId ? <span className="ml-1.5 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-500">BOSS</span> : null}
                </td>
                <td className="px-3 py-2 text-center font-mono text-xs text-textSub">×{w.hp}</td>
                <td className="px-3 py-2 text-center font-mono text-xs text-textSub">×{w.atk}</td>
                <td className="px-3 py-2 text-center font-mono text-xs text-textSub">{w.moneyMonster ? `${w.moneyMonster[0]}~${w.moneyMonster[1]}` : '-'}</td>
                <td className="px-3 py-2 text-center font-mono text-xs text-textSub">{w.moneyWave != null ? fmtNum(w.moneyWave) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border/50 px-3 py-2 text-[11px] text-textSub">初始昆仑币 {fmtNum(initMoney)}；系数作用于该关基准属性。</div>
    </div>
  );
}

function StagesView({ stages }: { stages: KunlunStage[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<'normal' | 'speed'>('normal');
  const active = stages.find((s) => s.id === selectedId) || stages[0] || null;

  const groups = useMemo(() => {
    const map = new Map<number, KunlunStage[]>();
    for (const s of stages) {
      if (!map.has(s.group)) map.set(s.group, []);
      map.get(s.group)!.push(s);
    }
    return [...map.entries()];
  }, [stages]);

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-lg border border-border bg-card p-3 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-8rem)] xl:overflow-auto">
        <div className="mb-2 px-2 py-2 text-sm font-semibold text-textMain">关卡（{stages.length}）</div>
        <div className="space-y-4">
          {groups.map(([groupId, list]) => (
            <div key={groupId}>
              <div className="px-2 pb-1.5 text-xs font-semibold text-textSub">{list[0].groupName}</div>
              <div className="space-y-1.5">
                {list.map((s) => {
                  const selected = s.id === active?.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={clsx(
                        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                        selected ? 'border-primary bg-primary/10' : 'border-border bg-surface/45 hover:border-primary/40 hover:bg-surface'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-textMain">{s.name}</span>
                        <span className="font-mono text-xs text-textSub">Lv.{s.level}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <article className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm lg:p-6">
        {!active ? (
          <div className="py-20 text-center text-sm text-textSub">昆仑关卡数据尚未生成</div>
        ) : (
          <div className="space-y-6">
            <header>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-textSub">
                <span className="rounded-md border border-border bg-surface px-2.5 py-1">{active.groupName}</span>
                <span className="rounded-md border border-border bg-surface px-2.5 py-1">解锁等级 Lv.{active.level}</span>
              </div>
              <h2 className="mt-4 text-2xl font-bold leading-tight text-textMain lg:text-3xl">{active.name}</h2>
              {active.normal.desc ? <p className="mt-3 text-sm leading-7 text-textSub">{active.normal.desc}</p> : null}
            </header>

            <div className="flex gap-2">
              {(['normal', 'speed'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={clsx(
                    'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    mode === m ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-textSub hover:text-textMain'
                  )}
                >
                  {m === 'normal' ? `普通（${active.normal.waves.length} 波）` : `极速（${active.speed.waves.length} 波）`}
                </button>
              ))}
            </div>

            <WaveTable
              waves={mode === 'normal' ? active.normal.waves : active.speed.waves}
              initMoney={mode === 'normal' ? active.normal.initMoney : active.speed.initMoney}
            />

            <p className="text-xs leading-6 text-textSub">
              各关 BOSS 的完整属性（含波次系数换算后的血量/攻击）见「BOSS 属性 → 昆仑副本」。
            </p>
          </div>
        )}
      </article>
    </div>
  );
}

const PVP_KIND_ORDER = ['攻方兵营', '守方防御塔', '召唤塔', '英雄防御塔', '特殊'];

function PvpStatChips({ stats }: { stats?: Record<string, number | string | null> }) {
  if (!stats) return null;
  const labels: Record<string, string> = { atkCoef: '攻击系数', hpCoef: '血量系数', atkCd: '攻击间隔(秒)', speed: '移速' };
  const entries = Object.entries(stats).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-textSub">
          {labels[k] || k}: {String(v)}
        </span>
      ))}
    </div>
  );
}

function PvpView({ payload }: { payload: PvpPayload }) {
  const series = payload.series || [];
  const rules = payload.rules || {};
  const waves = payload.waves || [];
  const [kindFilter, setKindFilter] = useState('全部');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  const kinds = useMemo(() => PVP_KIND_ORDER.filter((k) => series.some((s) => s.kind === k)), [series]);
  const filtered = useMemo(
    () => (kindFilter === '全部' ? series : series.filter((s) => s.kind === kindFilter)),
    [series, kindFilter]
  );
  const active = filtered.find((s) => s.key === selectedKey) || filtered[0] || null;

  if (!series.length) {
    return <div className="rounded-lg border border-border bg-card py-20 text-center text-sm text-textSub">瑶台争锋解析数据尚未生成</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm lg:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {['全部', ...kinds].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={clsx(
                'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                kindFilter === k ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-textSub hover:text-textMain'
              )}
            >
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            className={clsx(
              'ml-auto rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              showRules ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-textSub hover:text-textMain'
            )}
          >
            对局规则
          </button>
        </div>
        {showRules ? (
          <div className="mt-4 space-y-2.5 border-t border-border pt-4">
            {Object.values(rules).map((text) => (
              <p key={text} className="flex gap-3 text-sm leading-7 text-textSub">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span className="break-words">{text}</span>
              </p>
            ))}
            {waves.length ? (
              <p className="flex gap-3 text-sm leading-7 text-textSub">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span>小兵强度随波次增长:第 1 波至第 {waves.length} 波,血量倍率 ×{waves[0]?.hp} 一路升至 ×{waves[waves.length - 1]?.hp},攻击倍率 ×{waves[0]?.atk} 升至 ×{waves[waves.length - 1]?.atk}。</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-lg border border-border bg-card p-3 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-8rem)] xl:overflow-auto">
          <div className="mb-2 px-2 py-2 text-sm font-semibold text-textMain">单位（{filtered.length}）</div>
          <div className="space-y-1.5">
            {filtered.map((s) => {
              const selected = s.key === active?.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSelectedKey(s.key)}
                  className={clsx(
                    'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                    selected ? 'border-primary bg-primary/10' : 'border-border bg-surface/45 hover:border-primary/40 hover:bg-surface'
                  )}
                >
                  <div className="flex items-center justify-between gap-3 text-xs text-textSub">
                    <span>{s.kind}</span>
                    {s.element ? <span>{s.element}属性</span> : null}
                  </div>
                  <div className="mt-1.5 text-sm font-semibold leading-6 text-textMain">{s.groupName}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-textSub">{s.role || ''}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <article className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm lg:p-6">
          {!active ? (
            <div className="py-20 text-center text-sm text-textSub">暂无该类单位</div>
          ) : (
            <div className="space-y-6">
              <header>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-textSub">
                  <span className="rounded-md border border-border bg-surface px-2.5 py-1">{active.kind}</span>
                  {active.element ? <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-sky-600">{active.element}属性</span> : null}
                </div>
                <h2 className="mt-4 text-2xl font-bold leading-tight text-textMain lg:text-3xl">{active.groupName}</h2>
                {active.role ? <p className="mt-3 text-sm leading-7 text-textSub"><span className="font-semibold text-textMain">定位：</span>{active.role}</p> : null}
                {active.resist ? <p className="mt-2 text-sm leading-7 text-textSub"><span className="font-semibold text-textMain">抗性：</span>{active.resist}</p> : null}
              </header>

              {active.featureText ? (
                <section className="border-t border-border pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-textMain">官方描述</h3>
                  <p className="whitespace-pre-line text-sm leading-7 text-textSub">{active.featureText}</p>
                </section>
              ) : null}

              {active.overview ? (
                <section className="border-t border-border pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-textMain">机制总览</h3>
                  <p className="text-sm leading-7 text-textSub">{active.overview}</p>
                </section>
              ) : null}

              <section className="border-t border-border pt-5">
                <h3 className="mb-3 text-sm font-semibold text-textMain">作战要点</h3>
                <div className="space-y-2.5">
                  {([['出兵/索敌', active.targeting], ['适用场景', active.counters], ['短板', active.weaknesses], ['联动', active.synergy]] as const)
                    .filter(([, v]) => v && v.trim())
                    .map(([label, value]) => (
                      <p key={label} className="flex gap-3 text-sm leading-7 text-textSub">
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        <span className="break-words"><span className="font-semibold text-textMain">{label}：</span>{value}</span>
                      </p>
                    ))}
                </div>
              </section>

              <section className="border-t border-border pt-5">
                <h3 className="mb-3 text-sm font-semibold text-textMain">逐级解析</h3>
                <div className="space-y-4">
                  {active.levels.map((l) => (
                    <div key={l.id} className="rounded-lg border border-border bg-surface/45 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-textMain">{l.level} 级 · {l.name}</div>
                        {l.unlock ? (
                          <div className="flex flex-wrap gap-1.5 text-[11px] text-textSub">
                            {l.unlock.buildPoints != null ? <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600">{l.unlock.buildPoints}建筑点解锁</span> : null}
                            {l.unlock.buildCost != null ? <span className="rounded bg-surface px-1.5 py-0.5 border border-border">建造 {l.unlock.buildCost}金</span> : null}
                            {l.unlock.upgradeCost != null ? <span className="rounded bg-surface px-1.5 py-0.5 border border-border">升级 {l.unlock.upgradeCost}金</span> : null}
                            {l.unlock.perWave != null ? <span className="rounded bg-surface px-1.5 py-0.5 border border-border">每波 {l.unlock.perWave} 个</span> : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2"><PvpStatChips stats={l.stats} /></div>
                      {l.mechanics ? <p className="mt-2 text-sm leading-7 text-textSub">{l.mechanics}</p> : null}
                      {(l.skills || []).length ? (
                        <div className="mt-3 space-y-1.5">
                          {(l.skills || []).map((s) => (
                            <p key={s.name} className="text-xs leading-6 text-textSub">
                              <span className="font-semibold text-textMain">{s.name}</span>
                              {s.cd ? <span className="ml-1.5 text-primary">CD {s.cd}秒</span> : null}
                              <span className="ml-1.5">{s.desc}</span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {(l.buffs || []).length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(l.buffs || []).map((b) => (
                            <span key={b.name} className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                              {b.name}{b.effect ? `：${b.effect}` : ''}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {l.unit ? (
                        <div className="mt-3 rounded-md border border-border/60 bg-card p-3">
                          <div className="text-xs font-semibold text-textMain">产出单位：{l.unit.name}</div>
                          <div className="mt-1.5"><PvpStatChips stats={l.unit.stats} /></div>
                          {l.unit.desc ? <p className="mt-1.5 text-xs leading-6 text-textSub">{l.unit.desc}</p> : null}
                          {(l.unit.skills || []).length ? (
                            <div className="mt-1.5 space-y-1">
                              {(l.unit.skills || []).map((s) => (
                                <p key={s.name} className="text-xs leading-5 text-textSub">
                                  <span className="font-semibold text-textMain">{s.name}</span>
                                  <span className="ml-1.5">{s.desc}</span>
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              {(active.uncertainties || []).length ? (
                <section className="border-t border-border pt-5">
                  <h3 className="mb-3 text-sm font-semibold text-textMain">仍待核对</h3>
                  <div className="space-y-2.5">
                    {(active.uncertainties || []).map((item) => (
                      <p key={item} className="flex gap-3 text-sm leading-7 text-textSub">
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                        <span className="break-words">{item}</span>
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

export default function KunlunAnalysis({ dataSources }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const payload: KunlunPayload = dataSources.kunlun_analysis?.data || {};
  const pvpPayload: PvpPayload = dataSources.kunlun_pvp_analysis?.data || {};
  const towerGroups = payload.towerGroups || [];
  const stages = payload.stages || [];
  const view = location.pathname.endsWith('/stages') ? 'stages' : location.pathname.endsWith('/pvp') ? 'pvp' : 'towers';

  return (
    <div className="space-y-6 pb-16">
      <div className="flex gap-2">
        {([['towers', '防御塔'], ['stages', '关卡波次'], ['pvp', '瑶台争锋']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => navigate(`/kunlun/${key}`)}
            className={clsx(
              'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              view === key ? 'border-primary bg-primary text-white shadow-md shadow-primary/20' : 'border-border bg-surface text-textSub hover:text-textMain'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'towers' ? <TowersView towerGroups={towerGroups} /> : view === 'pvp' ? <PvpView payload={pvpPayload} /> : <StagesView stages={stages} />}
    </div>
  );
}
