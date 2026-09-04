import { Database, Info } from 'lucide-react';
import { ScrollTableFrame } from './CallGodAttributeTab';
import type { StageLimitPayload, StageLimitValue } from './callGodStatsShared';

const BATTLEFIELD_COLUMNS = [
  { key: 'actualSkillLv', label: '角色技能' },
  { key: 'rideSkillLimit', label: '坐骑技能' },
  { key: 'danyuanLimit', label: '丹元' },
  { key: 'wingSkillLimit', label: '翅膀技能' },
  { key: 'equipFashionSkillLimit', label: '装备时装技能' },
];

const ENTITY_TYPE_LABELS: Record<string, string> = {
  role: '角色',
  ride: '坐骑',
};

function limitValue(limits: StageLimitValue[], key: string) {
  return limits.find((entry) => entry.key === key)?.value ?? null;
}

function LimitList({ limits }: { limits: StageLimitValue[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {limits.map((limit) => (
        <span key={limit.key} className="whitespace-nowrap">
          <span className="text-textSub">{limit.label}</span>
          <strong className="ml-1.5 font-mono text-textMain">{limit.value}</strong>
        </span>
      ))}
    </div>
  );
}

function SkillMechanismNotice({ note }: { note?: StageLimitPayload['skillMechanismNote'] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 shadow-sm dark:border-blue-500/20 dark:bg-blue-950/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 shrink-0">
          <Info size={20} aria-hidden="true" />
        </div>
        <div className="space-y-3 flex-1 text-sm">
          <div>
            <h3 className="text-base font-semibold text-textMain">
              {note?.title || '角色技能调整规则'}
            </h3>
            <p className="mt-1 text-textSub">
              {note?.summary || '神魔战场实际上没有固定的角色技能等级上限，而是根据角色当前等级、战场等级以及局外技能等级进行动态平移调整。'}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-surface/70 p-3.5 space-y-1.5">
              <div className="text-xs font-semibold text-textSub">技能等级动态调整规则</div>
              <p className="text-xs text-textSub leading-relaxed">
                进入神魔战场后，如果角色等级受到战场压制，角色等级每被压低 5 级，技能等级相应扣减 1 级：
              </p>
              <div className="mt-1 rounded bg-card px-2.5 py-1.5 font-mono text-xs text-primary border border-border/40">
                {note?.formula || '局内技能等级 = 局外技能等级 + (战场等级 - 自身等级) ÷ 5'}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-surface/70 p-3.5 space-y-1.5">
              <div className="text-xs font-semibold text-textSub">满级角色局内实际表现</div>
              <p className="text-xs text-textSub leading-relaxed">
                玩家在局外满级满技能进入战场时，实际生效的技能等级固定为：
              </p>
              <div className="mt-1 rounded bg-card px-2.5 py-1.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-border/40">
                满级实际技能 = (战场等级 ÷ 5) + 1
              </div>
              <p className="text-[11px] text-textSub">
                例如：17 阶（战场 230 级）局内实际为 <strong>47 级</strong>；15 阶（战场 210 级）局内实际为 <strong>43 级</strong>。
              </p>
            </div>
          </div>

          <div className="text-xs text-textSub/90 border-t border-border/40 pt-2.5 flex items-center gap-1.5">
            <span className="font-semibold text-textMain">对照说明：</span>
            <span>{note?.rideComparison || '坐骑技能则有固定上限，严格按表内配置的上限截断（例如 17 阶坐骑技能上限固定为 46 级）。'}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceStrip({ sources }: { sources: StageLimitPayload['sources'] }) {
  return (
    <section className="border-y border-border bg-surface/45 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-textSub">
        <span className="flex items-center gap-2 font-semibold text-textMain">
          <Database size={15} aria-hidden="true" />
          配置来源
        </span>
        <span>战场阶数: {sources.battlefieldTiers}</span>
        <span>特殊关卡: {sources.specialStages}</span>
        <span>实体覆盖: {sources.entityOverrides}</span>
      </div>
    </section>
  );
}

function BattlefieldLimitTable({ payload }: { payload: StageLimitPayload }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold text-textMain">阪泉与神魔战场阶数上限</h2>
      </div>
      <ScrollTableFrame>
        <table className="w-full min-w-[1040px] whitespace-nowrap text-center text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-xs text-textSub shadow-sm">
            <tr className="border-b border-border">
              <th className="sticky left-0 z-20 border-r border-border/50 bg-surface px-4 py-3 text-left font-semibold shadow-[4px_0_12px_rgba(0,0,0,0.08)]">
                战场
              </th>
              <th className="border-r border-border/50 px-4 py-3 font-semibold">战场等级</th>
              {BATTLEFIELD_COLUMNS.map((column) => (
                <th key={column.key} className="border-r border-border/50 px-4 py-3 font-semibold">
                  {column.label}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold">魔王等级</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-textMain">
            {payload.battlefieldTiers.map((tier) => {
              const demonValues = [...new Set(tier.devilLimits.map((entry) => entry.value))].sort((a, b) => a - b);
              return (
                <tr key={tier.id} className="transition-colors hover:bg-surface/60">
                  <td className="sticky left-0 z-10 border-r border-border/50 bg-card/95 px-4 py-3 text-left font-semibold shadow-[4px_0_12px_rgba(0,0,0,0.08)]">
                    {tier.name}
                  </td>
                  <td className="border-r border-border/50 px-4 py-3 font-mono">{tier.battlefieldLevel}</td>
                  {BATTLEFIELD_COLUMNS.map((column) => (
                    <td key={`${tier.id}-${column.key}`} className="border-r border-border/50 px-4 py-3 font-mono font-semibold text-primary">
                      {limitValue(tier.limits, column.key) ?? '-'}
                    </td>
                  ))}
                  <td className="px-4 py-3 font-mono font-semibold text-amber-600 dark:text-amber-400">
                    {demonValues.length > 0 ? demonValues.join(' / ') : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollTableFrame>
      <div className="border-t border-border/50 bg-surface/30 px-5 py-3 text-xs text-textSub leading-relaxed">
        <strong>* 提示：</strong>角色技能并无固定上限，表格展示的是局外满级角色进场后的实际生效等级，计算公式为 <code>战场等级 ÷ 5 + 1</code>。若玩家在局外未满级，则按等级差动态缩放，详见上方规则说明。
      </div>
    </section>
  );
}

function DemonLimitTable({ payload }: { payload: StageLimitPayload }) {
  const demonNames = [...new Set(payload.battlefieldTiers.flatMap((tier) => tier.devilLimits.map((entry) => entry.name)))];
  if (demonNames.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold text-textMain">各魔王等级上限</h2>
      </div>
      <ScrollTableFrame>
        <table className="w-full min-w-[1280px] whitespace-nowrap text-center text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-xs text-textSub shadow-sm">
            <tr className="border-b border-border">
              <th className="sticky left-0 z-20 border-r border-border/50 bg-surface px-4 py-3 text-left font-semibold shadow-[4px_0_12px_rgba(0,0,0,0.08)]">
                战场
              </th>
              {demonNames.map((name) => (
                <th key={name} className="border-r border-border/50 px-4 py-3 font-semibold last:border-r-0">{name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-textMain">
            {payload.battlefieldTiers.map((tier) => {
              const limitsByName = new Map(tier.devilLimits.map((entry) => [entry.name, entry.value]));
              return (
                <tr key={`demon-${tier.id}`} className="transition-colors hover:bg-surface/60">
                  <td className="sticky left-0 z-10 border-r border-border/50 bg-card/95 px-4 py-3 text-left font-semibold shadow-[4px_0_12px_rgba(0,0,0,0.08)]">
                    {tier.name}
                  </td>
                  {demonNames.map((name) => (
                    <td key={`${tier.id}-${name}`} className="border-r border-border/50 px-4 py-3 font-mono font-semibold last:border-r-0">
                      {limitsByName.get(name) ?? '-'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollTableFrame>
    </section>
  );
}

function OtherLimitTables({ payload }: { payload: StageLimitPayload }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-textMain">特殊关卡上限</h2>
        </div>
        <div className="divide-y divide-border/50">
          {payload.specialStages.map((stage) => (
            <div key={stage.id} className="px-5 py-4">
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h3 className="font-semibold text-textMain">{stage.name}</h3>
                <span className="text-xs text-textSub">subType {stage.subType}</span>
              </div>
              <LimitList limits={stage.limits} />
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-textMain">按实体覆盖的上限</h2>
        </div>
        <ScrollTableFrame>
          <table className="w-full min-w-[720px] whitespace-nowrap text-left text-sm">
            <thead className="bg-surface text-xs text-textSub">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-semibold">适用关卡</th>
                <th className="px-4 py-3 font-semibold">对象</th>
                <th className="px-4 py-3 font-semibold">类型</th>
                <th className="px-4 py-3 font-semibold">等级上限</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-textMain">
              {payload.entityOverrides.map((entry) => (
                <tr key={`${entry.type}-${entry.id}`} className="transition-colors hover:bg-surface/60">
                  <td className="px-4 py-3">
                    {entry.stageNames.length > 0 ? entry.stageNames.join('、') : entry.subTypes.map((value) => `subType ${value}`).join('、')}
                  </td>
                  <td className="px-4 py-3 font-semibold">{entry.name}</td>
                  <td className="px-4 py-3 text-textSub">{ENTITY_TYPE_LABELS[entry.type] || entry.type}</td>
                  <td className="px-4 py-3"><LimitList limits={entry.limits} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTableFrame>
      </section>
    </div>
  );
}

export function StageLimitsTab({ payload }: { payload: StageLimitPayload | null }) {
  if (!payload) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center text-textSub">
        暂未生成关卡等级上限数据。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SourceStrip sources={payload.sources} />
      <SkillMechanismNotice note={payload.skillMechanismNote} />
      <BattlefieldLimitTable payload={payload} />
      <DemonLimitTable payload={payload} />
      <OtherLimitTables payload={payload} />
    </div>
  );
}
