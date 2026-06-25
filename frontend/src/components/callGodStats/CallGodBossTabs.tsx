import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type { BossCommonSkillAnalysis, BossMechanismEntry, BossSkillAnalysis, BossAnalysisEntry, BossTalentAnalysis } from './callGodStatsShared';
import { FRAMES_PER_SECOND } from './callGodStatsShared';

function formatCoefficientValue(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function frameText(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value}帧`;
}

function secondsText(frames: number | null | undefined) {
  if (typeof frames !== 'number' || !Number.isFinite(frames)) return '—';
  if (frames === 0) return '无冷却';
  const seconds = frames / FRAMES_PER_SECOND;
  return `${Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(3))}s`;
}

function rawSecondsText(seconds: number | null | undefined) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—';
  if (seconds === 0) return '无冷却';
  return `${Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(3))}s`;
}

function attackRateText(totalCoefficient: number | null | undefined, frames: number | null | undefined) {
  if (typeof totalCoefficient !== 'number' || !Number.isFinite(totalCoefficient)) return null;
  if (typeof frames !== 'number' || !Number.isFinite(frames) || frames <= 0) return null;
  return formatCoefficientValue(totalCoefficient / (frames / FRAMES_PER_SECOND));
}

function groupDamageSegments(skill: BossSkillAnalysis) {
  const groups: Array<{ coefficient: number | null; hits: number; unknownHits: boolean; frames: number[]; intervals: number[] }> = [];
  for (const segment of (skill.damageSegments || []).filter((item) => item.damage)) {
    const coefficient = segment.damage?.coefficient ?? null;
    const hitCount = typeof segment.maxHit === 'number' && Number.isFinite(segment.maxHit) && segment.maxHit > 0 && segment.maxHit <= 50 ? segment.maxHit : null;
    const keyMatch = groups.find((group) => group.coefficient === coefficient);
    const group = keyMatch || { coefficient, hits: 0, unknownHits: false, frames: [], intervals: [] };
    if (hitCount == null) group.unknownHits = true;
    else group.hits += hitCount;
    if (typeof segment.frame === 'number' && Number.isFinite(segment.frame) && !group.frames.includes(segment.frame)) group.frames.push(segment.frame);
    if (typeof segment.interval === 'number' && segment.interval > 0 && !group.intervals.includes(segment.interval)) group.intervals.push(segment.interval);
    if (!keyMatch) groups.push(group);
  }
  return groups;
}

function damageFormulaText(skill: BossSkillAnalysis) {
  if (skill.damageDisplay?.formula) return skill.damageDisplay.formula;
  const groups = groupDamageSegments(skill);
  if (groups.length === 0) return '无直接伤害';
  return groups.map((group) => {
    const hitText = group.unknownHits ? (group.hits > 0 ? `${group.hits}+未确认` : '未确认') : String(group.hits);
    return `${formatCoefficientValue(group.coefficient)}×${hitText}连击`;
  }).join(' + ');
}

function hitTimingText(skill: BossSkillAnalysis) {
  if (skill.damageDisplay?.timing) return skill.damageDisplay.timing;
  const frames = [...new Set((skill.damageSegments || [])
    .map((segment) => segment.frame)
    .filter((frame): frame is number => typeof frame === 'number' && Number.isFinite(frame)))].sort((a, b) => a - b);
  if (!frames.length) return null;
  const shown = frames.slice(0, 8).map((frame) => `第${frame}帧`).join('、');
  return frames.length > 8 ? `${shown}等` : shown;
}

function formatMechanismText(text: string | undefined | null) {
  return String(text || '')
    .replace(/：(?=[①②③④⑤⑥⑦⑧⑨⑩])/g, '：\n')
    .replace(/；(?=[①②③④⑤⑥⑦⑧⑨⑩])/g, '；\n');
}

function MechanismList({ items, emptyText }: { items: BossMechanismEntry[] | undefined; emptyText: string }) {
  const visibleItems = (items || []).filter((item) => item.text || item.source?.name);
  if (visibleItems.length === 0) {
    return <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-textSub">{emptyText}</div>;
  }

  return (
    <div className="space-y-2">
      {visibleItems.map((item, index) => (
        <div key={`${item.type}-${item.source?.id || index}`} className="rounded-lg bg-surface px-3 py-2">
          <div className="text-[11px] font-semibold text-primary">{item.type}</div>
          <div className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-textMain">{formatMechanismText(item.text || item.source?.name)}</div>
        </div>
      ))}
    </div>
  );
}

function SkillDamageTable({ skill }: { skill: BossSkillAnalysis }) {
  if (skill.damageDisplay?.breakdown?.length) {
    return (
      <div className="border-t border-border px-5 py-3">
        <div className="mb-2 text-[11px] text-textSub">伤害拆分</div>
        <div className="space-y-2">
          {skill.damageDisplay.breakdown.map((item, index) => (
            <div key={`${skill.id}-override-${index}`} className="rounded-lg bg-surface px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-textMain">{item.label}</span>
                <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">{item.text}</span>
              </div>
              {item.detail ? <div className="mt-1 break-words leading-5 text-textSub">{item.detail}</div> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (skill.damageDisplay?.hideAutoBreakdown) {
    return null;
  }
  const groups = groupDamageSegments(skill);
  if (groups.length === 0) {
    return <div className="border-t border-border px-5 py-3 text-sm text-textSub">该技能不靠直接伤害吃饭，重点看下方附带效果。</div>;
  }

  return (
    <div className="border-t border-border px-5 py-3">
      <div className="mb-2 text-[11px] text-textSub">伤害拆分</div>
      <div className="space-y-2">
        {groups.map((group, index) => (
          <div key={`${skill.id}-${index}`} className="rounded-lg bg-surface px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-textMain">第{index + 1}段</span>
              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                {formatCoefficientValue(group.coefficient)}×{group.unknownHits ? (group.hits > 0 ? `${group.hits}+未确认` : '未确认') : group.hits}连击
              </span>
            </div>
            <div className="mt-1 break-words font-mono leading-5 text-textSub">
              {group.frames.length ? group.frames.sort((a, b) => a - b).map((frame) => `第${frame}帧`).join('、') : '命中节奏未解析'}
              {group.intervals.length ? `；命中间隔${group.intervals.map(frameText).join('/')}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BossSkillCard({ skill }: { skill: BossSkillAnalysis }) {
  const attackRate = attackRateText(skill.totalCoefficient, skill.actionFrames);
  const timing = hitTimingText(skill);
  const mechanics = skill.mechanics || [];
  const totalText = skill.damageDisplay?.total || formatCoefficientValue(skill.totalCoefficient);
  return (
    <section className="flex flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-slate-500/[0.02] px-5 py-3.5 dark:bg-white/[0.01]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="break-words text-base font-bold text-textMain">{skill.name}</span>
            </div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-textSub/85">{skill.category}</div>
          </div>
          {skill.warnings?.length ? <span className="shrink-0 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">有提示</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-border/40 text-sm sm:grid-cols-2">
        <BossStat label="伤害系数" value={damageFormulaText(skill)} accent />
        <BossStat label="总系数" value={totalText} accent />
        <BossStat label="冷却" value={rawSecondsText(skill.cooldownSeconds ?? skill.cooldownFrames)} />
        <BossStat label="释放用时" value={secondsText(skill.actionFrames)} />
        {attackRate && <BossStat label="攻转" value={attackRate} accent />}
        {timing && <BossStat label="命中节奏" value={timing} />}
      </div>

      <SkillDamageTable skill={skill} />

      {mechanics?.length ? (
        <div className="border-t border-border px-5 py-3">
          <div className="mb-2 text-[11px] text-textSub">机制说明</div>
          <MechanismList items={mechanics} emptyText="该技能未解析到附加机制。" />
        </div>
      ) : null}

      {skill.warnings?.length ? (
        <details className="mt-auto border-t border-border px-5 py-2">
          <summary className="cursor-pointer text-xs text-amber-600 dark:text-amber-300">{skill.warnings.length} 条数据提示</summary>
          <ul className="mt-2 space-y-1 text-[11px] leading-5 text-textSub">
            {skill.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function BossAttackCard({ skills }: { skills: BossSkillAnalysis[] }) {
  if (!skills.length) return null;
  const total = skills.reduce((sum, skill) => typeof skill.totalCoefficient === 'number' ? sum + skill.totalCoefficient : sum, 0);
  const hasTotal = skills.some((skill) => typeof skill.totalCoefficient === 'number');
  return (
    <section className="flex flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-slate-500/[0.02] px-5 py-3.5 dark:bg-white/[0.01]">
        <div className="text-base font-bold text-textMain">普攻 / 跳攻</div>
        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-textSub/85">基础攻击合并展示</div>
      </div>
      <div className="grid grid-cols-1 gap-px bg-border/40 text-sm sm:grid-cols-2">
        <BossStat label="总系数合计" value={hasTotal ? formatCoefficientValue(total) : '—'} accent />
        <BossStat label="动作数量" value={`${skills.length} 个`} />
      </div>
      <div className="space-y-2 border-t border-border px-5 py-3">
        {skills.map((skill, index) => (
          <div key={`${skill.category}-${skill.id}-${index}`} className="rounded-lg bg-surface px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-textMain">{skill.name}</span>
              <span className="rounded bg-card px-1.5 py-0.5 text-[10px] text-textSub">{skill.category}</span>
            </div>
            <div className="mt-1 font-mono text-xs leading-5 text-rose-600 dark:text-rose-400">{damageFormulaText(skill)}；总系数 {formatCoefficientValue(skill.totalCoefficient)}</div>
            <div className="mt-1 text-xs leading-5 text-textSub">释放用时 {secondsText(skill.actionFrames)}{hitTimingText(skill) ? `；命中节奏 ${hitTimingText(skill)}` : ''}</div>
            {(skill.mechanics || []).filter((item) => item.type === '毒素机制').map((item, itemIndex) => (
              <div key={`${skill.id}-poison-${itemIndex}`} className="mt-2 rounded-md bg-card px-2 py-1.5 text-xs leading-5 text-textMain">
                {formatMechanismText(item.text)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function BossStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <div className="text-[11px] text-textSub">{label}</div>
      <div className={clsx('mt-0.5 break-words font-mono text-sm font-semibold', accent ? 'text-rose-600 dark:text-rose-400' : 'text-textMain')}>{value}</div>
    </div>
  );
}

export function BossTalentsTable({ talents }: { talents: BossTalentAnalysis[] }) {
  if (talents.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-textMain">通用魔王天赋</h3>
        <span className="text-xs text-textSub">{talents.length} 个天赋</span>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {talents.map((talent) => {
          const effectText = talent.effects.map((item) => item.description || item.text || item.name).filter(Boolean).join('；');
          return (
            <article key={talent.talentGroup} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-textMain">{talent.name}</h4>
                  <span className="rounded bg-surface px-2 py-0.5 text-[11px] text-textSub">
                    {talent.unlockStageRange ? `${talent.unlockStageRange[0]}-${talent.unlockStageRange[1]}阶` : '解锁阶数未配置'}
                  </span>
                  <span className="rounded bg-surface px-2 py-0.5 text-[11px] text-textSub">最高 {talent.maxLevel} 级</span>
                </div>
                {effectText ? <p className="mt-2 text-xs leading-5 text-textSub">{effectText}</p> : null}
              </div>
              <div className="divide-y divide-border/60">
                {talent.levels.map((level) => (
                  <div key={`${talent.talentGroup}-${level.level}`} className="grid grid-cols-[3.75rem_1fr] gap-3 px-5 py-3 text-sm sm:grid-cols-[4.5rem_1fr]">
                    <div className="font-mono font-semibold text-primary">Lv.{level.level}</div>
                    <div className="min-w-0">
                      <div className="break-words leading-6 text-textMain">{level.text || '—'}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-textSub">
                        {typeof level.cost === 'number' ? <span>消耗 {level.cost}</span> : null}
                        {level.stages.length ? <span>适用战场：{level.stages.join('、')}</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function BossAnalysisTab({ payload }: { payload: BossAnalysisEntry[] }) {
  const bosses = useMemo(() => payload, [payload]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  useEffect(() => {
    if (bosses.length === 0) return;
    if (!bosses.some((boss) => String(boss.groupId) === selectedGroupId)) {
      setSelectedGroupId(String(bosses[0].groupId));
    }
  }, [bosses, selectedGroupId]);

  if (payload.length === 0 || bosses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center text-textSub">
        暂未生成魔王解析数据。执行神魔提取后会显示技能系数和机制解析。
      </div>
    );
  }

  const activeBoss = bosses.find((boss) => String(boss.groupId) === selectedGroupId) || bosses[0];
  const activeBossKey = String(activeBoss.groupId);
  const visibleSkills = (activeBoss.skills || []).filter((skill) => !skill.missing && skill.showAsSkillCard !== false);
  const attackSkills = visibleSkills.filter((skill) => skill.category === '普攻' || skill.category === '空中攻击');
  const activeSkills = visibleSkills.filter((skill) => skill.category !== '普攻' && skill.category !== '空中攻击');
  const passiveMechanisms = activeBoss.baseMechanisms || [];

  return (
    <div key={activeBossKey} className="space-y-5">
      <section className="flex flex-col gap-4 rounded-[24px] border border-border bg-card px-5 py-4 shadow-sm">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {bosses.map((boss) => {
            const active = activeBossKey === String(boss.groupId);
            return (
              <button
                key={String(boss.groupId)}
                onClick={() => setSelectedGroupId(String(boss.groupId))}
                className={clsx(
                  'min-h-11 shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-surface text-textSub hover:text-textMain'
                )}
              >
                {boss.name}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-textMain">{activeBoss.name}</h2>
            <span className="rounded bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-300">只有系数伤害</span>
            {activeBoss.warnings?.length ? <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-300">{activeBoss.warnings.length} 条数据提示</span> : null}
          </div>
          {activeBoss.description ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-textSub">{activeBoss.description}</p> : null}
          <p className="mt-3 text-sm leading-6 text-textMain">魔王技能伤害不展示固伤；没有特别标注真伤时，默认按受防御影响的系数伤害理解。</p>
        </div>
      </section>

      {passiveMechanisms.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMain">本体机制</h3>
            <span className="text-xs text-textSub">{passiveMechanisms.length} 条</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {passiveMechanisms.map((item, index) => (
              <section key={`${item.type}-${item.source?.id || index}`} className="rounded-[20px] border border-border bg-card px-5 py-4 shadow-sm">
                <div className="text-[10px] font-medium uppercase tracking-wide text-textSub/85">{item.type}</div>
                <div className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-textMain">{formatMechanismText(item.text)}</div>
              </section>
            ))}
          </div>
        </section>
      )}

      {activeSkills.length > 0 || attackSkills.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMain">技能解析</h3>
            <span className="text-xs text-textSub">{activeSkills.length + (attackSkills.length ? 1 : 0)} 张</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <BossAttackCard skills={attackSkills} />
            {activeSkills.map((skill) => <BossSkillCard key={`${activeBossKey}-${skill.category}-${skill.id}`} skill={skill} />)}
          </div>
        </section>
      ) : null}

      {activeBoss.fashions?.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-textMain">外观/皮肤机制</h3>
            <span className="text-xs text-textSub">{activeBoss.fashions.length} 件</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeBoss.fashions.map((fashion) => (
              <div key={fashion.id} className="rounded-[20px] border border-border bg-card p-5 shadow-sm">
                <div className="font-semibold text-textMain">{fashion.name}</div>
                <div className="mt-2 text-sm leading-6 text-textSub whitespace-pre-line">{fashion.description}</div>
                {fashion.effects.length ? (
                  <div className="mt-3 space-y-2 text-sm text-textMain">
                    {fashion.effects.map((effect) => <div key={effect.id} className="rounded-lg bg-surface px-3 py-2 leading-6">{effect.description || effect.text || effect.name}</div>)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function BossTalentsTab({ talents }: { talents: BossTalentAnalysis[] }) {
  if (talents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center text-textSub">
        暂未生成通用魔王天赋数据。执行神魔提取后会显示天赋等级和效果。
      </div>
    );
  }

  return <BossTalentsTable talents={talents} />;
}

function CommonSkillFacts({ skill }: { skill: BossCommonSkillAnalysis }) {
  const facts = skill.facts || [];
  if (!facts.length) return null;
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border/60 text-sm sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={`${skill.id}-${fact.label}`} className="bg-card px-3 py-2">
          <div className="text-[11px] text-textSub">{fact.label}</div>
          <div className="mt-0.5 break-words text-sm font-semibold text-textMain">{fact.value}</div>
        </div>
      ))}
    </div>
  );
}

function CommonSkillDamageList({ skill }: { skill: BossCommonSkillAnalysis }) {
  const damageRows = (skill.summons || []).flatMap((summon) => (
    (summon.damage || []).map((damage) => ({ ...damage, summonName: summon.name }))
  ));
  if (!damageRows.length) return null;
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-textSub">伤害拆分</div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
        {damageRows.map((damage) => (
          <div key={`${skill.id}-${damage.summonName}-${damage.skillId}`} className="grid grid-cols-[minmax(6rem,8rem)_1fr] gap-3 bg-card px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="break-words font-semibold text-textMain">{damage.skillName}</div>
              <div className="mt-0.5 text-[11px] text-textSub">{damage.summonName}</div>
            </div>
            <div className="min-w-0 text-right">
              <div className="break-words font-mono font-semibold text-rose-600 dark:text-rose-400">{damage.formula}</div>
              {damage.total ? <div className="mt-0.5 text-[11px] text-textSub">总系数 {damage.total.replace(/系数$/, '')}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommonSkillEffects({ skill }: { skill: BossCommonSkillAnalysis }) {
  const effects = [
    ...(skill.actionEffects || []),
    ...(skill.teleportEffects || []),
    ...(skill.summons || []).flatMap((summon) => summon.effects || []),
  ].filter(Boolean);
  const uniqueEffects = [...new Set(effects)];
  if (!uniqueEffects.length) return null;
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-textSub">机制说明</div>
      <div className="space-y-1.5">
        {uniqueEffects.map((effect, index) => (
          <div key={`${skill.id}-effect-${index}`} className="break-words rounded-lg bg-surface px-3 py-2 text-sm leading-6 text-textMain">
            {effect}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommonSkillCard({ skill }: { skill: BossCommonSkillAnalysis }) {
  return (
    <article className="flex flex-col gap-4 rounded-[20px] border border-border bg-card p-5 shadow-sm">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="break-words text-base font-semibold text-textMain">{skill.name}</h4>
          <span className="rounded bg-surface px-2 py-0.5 text-[11px] text-textSub">#{skill.sort}</span>
        </div>
        <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-textMain">{skill.playerText}</p>
      </div>

      <CommonSkillFacts skill={skill} />
      <CommonSkillEffects skill={skill} />
      <CommonSkillDamageList skill={skill} />

      {skill.warnings?.length ? (
        <details className="mt-auto border-t border-border pt-2">
          <summary className="cursor-pointer text-xs text-amber-600 dark:text-amber-300">{skill.warnings.length} 条数据提示</summary>
          <ul className="mt-2 space-y-1 text-[11px] leading-5 text-textSub">
            {skill.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

export function BossCommonSkillsTab({ skills }: { skills: BossCommonSkillAnalysis[] }) {
  const sortedSkills = useMemo(() => [...skills].sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0)), [skills]);
  if (sortedSkills.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center text-textSub">
        暂未生成通用魔王技能数据。执行神魔提取后会显示技能机制和数值。
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-textMain">通用魔王技能</h3>
        <span className="text-xs text-textSub">{sortedSkills.length} 个技能</span>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sortedSkills.map((skill) => <CommonSkillCard key={skill.id} skill={skill} />)}
      </div>
    </section>
  );
}
