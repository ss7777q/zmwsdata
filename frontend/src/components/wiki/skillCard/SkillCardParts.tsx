import { ArrowRight } from 'lucide-react';
import type { PassiveCost, SkillChainViz, BuffInfo, SkillLevel } from './SkillCardTypes';
import { buffDuration, buffValueText, cleanBuffName, fmt } from './SkillCardUtils';

export function BuffRow({ buff }: { buff: BuffInfo }) {
  const dur = buffDuration(buff.time);
  const valTxt = buffValueText(buff.value);

  if (buff.displayText) {
    return (
      <div className="flex flex-col gap-1 rounded-lg bg-card px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 rounded bg-surface px-1 text-[10px] text-textSub">{buff.bindLabel}</span>
          <span className="text-xs font-semibold text-textMain">{cleanBuffName(buff.name)}</span>
        </div>
        <div className="whitespace-pre-line text-xs text-cta leading-relaxed pl-[4px] break-words">
          {buff.displayText}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 rounded bg-surface px-1 text-[10px] text-textSub">{buff.bindLabel}</span>
        <span className="truncate text-xs text-textMain">{cleanBuffName(buff.name)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
        {valTxt && <span className="text-cta">{valTxt}</span>}
        {dur && <span className="text-textSub">{dur}</span>}
      </div>
    </div>
  );
}

function valueToText(value: unknown) {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function costText(cost: PassiveCost[] | null) {
  if (!cost?.length) return '—';
  return cost.map((item) => `${item.name}×${valueToText(item.count)}`).join(' / ');
}

export function PassiveLevelBlock({ level }: { level: SkillLevel }) {
  const passive = level.passive;
  if (!passive) return null;
  const allBeskills = [
    ...passive.directBeskills,
    ...passive.initializeBeskills,
    ...passive.makeUpBeskills,
  ];
  const effectRows = allBeskills.flatMap((be) => be.effects || []);
  const uniqueEffects = effectRows.filter((effect, index) => {
    const key = `${effect.label}::${valueToText(effect.value)}`;
    return effectRows.findIndex((item) => `${item.label}::${valueToText(item.value)}` === key) === index;
  });

  return (
    <div className="rounded-lg bg-surface px-3 py-3 border-l-2 border-purple-500/40">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-card px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">Lv.{level.level}</span>
        {level.roleLevel != null && <span className="rounded bg-card px-2 py-0.5 text-[11px] text-textSub">角色等级 {level.roleLevel}</span>}
        <span className="rounded bg-card px-2 py-0.5 text-[11px] text-textSub">升级消耗 {costText(passive.rankCost)}</span>
      </div>
      {passive.text && <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-textMain">{passive.text}</div>}
      <div className="mt-3 grid gap-1.5">
        {uniqueEffects.map((effect, index) => (
          <div key={`${effect.label}-${index}`} className="rounded-md border border-border bg-card px-3 py-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-textSub">{effect.label}</div>
                <div className="mt-1 break-words text-xs leading-relaxed text-textMain">{valueToText(effect.value)}</div>
              </div>
            </div>
          </div>
        ))}
        {!uniqueEffects.length && (
          <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-textSub">
            当前等级没有可展示的额外数值。
          </div>
        )}
      </div>
    </div>
  );
}

export function ChainViz({ viz }: { viz: SkillChainViz }) {
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

export function Stat({ icon, label, value, accent, hint }: { icon?: React.ReactNode; label: string; value: string; accent?: boolean; hint?: string }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <div className="flex items-center gap-1 text-[11px] text-textSub">{icon}{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${accent ? 'text-primary' : 'text-textMain'}`}>{value}</div>
      {hint && <div className="text-[10px] text-amber-500">{hint}</div>}
    </div>
  );
}

export function Th({ children, sticky }: { children: React.ReactNode; sticky?: boolean }) {
  const pin = sticky ? 'sticky left-0 z-20 bg-card shadow-[4px_0_10px_rgba(15,23,42,0.08)] w-20 min-w-[5rem]' : '';
  return <th className={`px-2 py-1 text-center font-medium whitespace-nowrap ${pin}`}>{children}</th>;
}
export function Td({ children, accent, cta, wrap, sticky }: { children: React.ReactNode; accent?: boolean; cta?: boolean; wrap?: boolean; sticky?: boolean }) {
  const tone = accent ? 'text-textMain font-semibold' : cta ? 'text-cta' : 'text-textSub';
  const flow = wrap ? 'min-w-[8rem] max-w-[18rem] whitespace-normal break-words leading-relaxed text-left' : 'whitespace-nowrap text-center';
  const pin = sticky ? 'sticky left-0 z-10 bg-card shadow-[4px_0_10px_rgba(15,23,42,0.08)] w-20 min-w-[5rem]' : '';
  return <td className={`px-2 py-1 align-top ${flow} ${tone} ${pin}`}>{children}</td>;
}
