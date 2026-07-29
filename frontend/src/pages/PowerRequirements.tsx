import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';

type StarPower = {
  star: number;
  power: number;
};

type GodwarStarRow = {
  battlefield?: number | string;
  rewardLv?: number;
  name?: string;
  battlefieldLv?: number;
  stars?: StarPower[];
  rideStars?: StarPower[];
  sameRide?: boolean;
};

type LinglongGradeRow = {
  level?: number;
  grades?: number[];
  sweepPower?: number;
};

type StagePowerRow = {
  id?: number | string;
  name?: string;
  lv?: number;
  power?: number;
  sweepPower?: number;
};

type PetTowerRow = {
  floor?: number;
  stage?: number;
  power?: number;
};

type PetChampionTowerRow = {
  floor?: number;
  power?: number;
  point?: number;
  worldLv?: { min?: number; max?: number } | number[] | null;
};

type PetHoleRow = {
  bossLevel?: number;
  elitePower?: number | null;
  recommendPower?: number | null;
};

type LeagueBossRow = {
  kind?: string;
  group?: number;
  name?: string;
  level?: number;
  power?: number;
};

type StarHavocRow = {
  rewardGroup?: number;
  value?: number;
  power?: number;
  sweepPower?: number;
};

type SectionGroup = {
  type?: number;
  label?: string;
  group?: number;
  rows: any[];
};

type Section = {
  key: string;
  label: string;
  description?: string;
  rows?: any[];
  groups?: SectionGroup[];
};

type PowerRequirementsPayload = {
  sections?: Section[];
};

interface Props {
  dataSources: Record<string, any>;
}

const numberFormatter = new Intl.NumberFormat('zh-CN');

function formatNumber(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return numberFormatter.format(value);
}

function asPayload(value: unknown): PowerRequirementsPayload {
  if (!value || typeof value !== 'object') return {};
  const payload = value as PowerRequirementsPayload;
  return {
    sections: Array.isArray(payload.sections) ? payload.sections : [],
  };
}

const thBase = 'px-4 py-3 font-semibold';
const thRight = 'px-4 py-3 text-right font-semibold';
const tdText = 'px-4 py-3 text-textMain';
const tdName = 'px-4 py-3 font-semibold text-textMain';
const tdPower = 'px-4 py-3 text-right font-mono font-semibold text-primary';
const tdSweep = 'px-4 py-3 text-right font-mono font-semibold text-cta';
const tdMono = 'px-4 py-3 text-right font-mono text-textMain';

function TableShell({ minWidth, children }: { minWidth?: number; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="max-h-[82vh] overflow-auto">
        <table className="w-full text-sm" style={{ minWidth: minWidth ?? 560 }}>
          {children}
        </table>
      </div>
    </section>
  );
}

function EmptyRows() {
  return (
    <div className="card text-center py-20 border border-dashed border-border bg-transparent">
      <h3 className="text-xl text-textSub font-medium">该模块暂无数据</h3>
    </div>
  );
}

function starPowerMap(list?: StarPower[]) {
  const map = new Map<number, number>();
  (list || []).forEach((item) => {
    if (item && typeof item.star === 'number') map.set(item.star, item.power);
  });
  return map;
}

function GodwarStarTables({ rows }: { rows: GodwarStarRow[] }) {
  if (!rows.length) return <EmptyRows />;

  const allSameRide = rows.every((row) => row.sameRide);

  const buildTable = (title: string, pick: (row: GodwarStarRow) => StarPower[] | undefined, note?: string) => {
    const maxStar = rows.reduce((max, row) => {
      const list = pick(row) || [];
      return list.reduce((inner, item) => Math.max(inner, item?.star ?? 0), max);
    }, 0);
    const starCols: number[] = [];
    for (let star = 0; star <= maxStar; star += 1) starCols.push(star);

    return (
      <div className="space-y-2" key={title}>
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-sm font-semibold text-textMain">{title}</h4>
          {note ? <span className="text-xs text-textSub">{note}</span> : null}
        </div>
        <TableShell minWidth={720}>
          <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
            <tr className="border-b border-border">
              <th className={thBase}>战场</th>
              <th className={thRight}>开放等级</th>
              {starCols.map((star) => (
                <th key={star} className={thRight}>
                  {star}星
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((row, index) => {
              const map = starPowerMap(pick(row));
              return (
                <tr key={`${row.battlefield ?? ''}-${row.rewardLv ?? index}`} className="hover:bg-surface/50">
                  <td className={tdName}>{row.name ?? '-'}</td>
                  <td className={tdMono}>{formatNumber(row.battlefieldLv)}</td>
                  {starCols.map((star) => (
                    <td key={star} className={tdPower}>
                      {formatNumber(map.get(star))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      </div>
    );
  };

  if (allSameRide) {
    return <div className="space-y-4">{buildTable('星级战力门槛', (row) => row.stars, '坐骑星级门槛相同')}</div>;
  }

  return (
    <div className="space-y-4">
      {buildTable('神将星级', (row) => row.stars)}
      {buildTable('坐骑星级', (row) => row.rideStars)}
    </div>
  );
}

function LinglongGradeTable({ rows }: { rows: LinglongGradeRow[] }) {
  if (!rows.length) return <EmptyRows />;
  const gradeCount = rows.reduce((max, row) => Math.max(max, row.grades?.length ?? 0), 0);
  const gradeCols: number[] = [];
  for (let index = 0; index < gradeCount; index += 1) gradeCols.push(index);

  return (
    <TableShell minWidth={720}>
      <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
        <tr className="border-b border-border">
          <th className={thBase}>塔等级</th>
          {gradeCols.map((index) => (
            <th key={index} className={thRight}>
              品阶{index + 1}
            </th>
          ))}
          <th className={thRight}>扫荡解锁</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map((row, rowIndex) => (
          <tr key={row.level ?? rowIndex} className="hover:bg-surface/50">
            <td className={tdName}>{row.level != null ? `Lv.${row.level}` : '-'}</td>
            {gradeCols.map((index) => (
              <td key={index} className={tdPower}>
                {formatNumber(row.grades?.[index])}
              </td>
            ))}
            <td className={tdSweep}>{formatNumber(row.sweepPower)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function StagePowerTable({ rows }: { rows: StagePowerRow[] }) {
  if (!rows.length) return <EmptyRows />;
  return (
    <TableShell>
      <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
        <tr className="border-b border-border">
          <th className={thBase}>关卡</th>
          <th className={thRight}>等级</th>
          <th className={thRight}>推荐战力</th>
          <th className={thRight}>扫荡解锁</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map((row, index) => (
          <tr key={`${row.id ?? index}`} className="hover:bg-surface/50">
            <td className={tdName}>{row.name ?? '-'}</td>
            <td className={tdMono}>{formatNumber(row.lv)}</td>
            <td className={tdPower}>{formatNumber(row.power)}</td>
            <td className={tdSweep}>{formatNumber(row.sweepPower)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function PetTowerTable({ rows }: { rows: PetTowerRow[] }) {
  if (!rows.length) return <EmptyRows />;
  return (
    <TableShell>
      <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
        <tr className="border-b border-border">
          <th className={thBase}>层</th>
          <th className={thRight}>关</th>
          <th className={thRight}>推荐战力</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map((row, index) => (
          <tr key={`${row.floor ?? index}-${row.stage ?? index}`} className="hover:bg-surface/50">
            <td className={tdName}>{row.floor != null ? `第${row.floor}层` : '-'}</td>
            <td className={tdMono}>{formatNumber(row.stage)}</td>
            <td className={tdPower}>{formatNumber(row.power)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function formatWorldLv(worldLv: PetChampionTowerRow['worldLv']) {
  if (!worldLv) return '-';
  if (Array.isArray(worldLv)) {
    if (!worldLv.length) return '-';
    return worldLv.length > 1 ? `${worldLv[0]}-${worldLv[worldLv.length - 1]}` : `${worldLv[0]}`;
  }
  if (typeof worldLv === 'object') {
    const { min, max } = worldLv;
    if (min == null && max == null) return '-';
    if (min != null && max != null) return min === max ? `${min}` : `${min}-${max}`;
    return `${min ?? max}`;
  }
  return `${worldLv}`;
}

function PetChampionTowerTable({ rows }: { rows: PetChampionTowerRow[] }) {
  if (!rows.length) return <EmptyRows />;
  const hasWorldLv = rows.some((row) => row.worldLv != null);
  return (
    <TableShell>
      <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
        <tr className="border-b border-border">
          <th className={thBase}>层</th>
          <th className={thRight}>推荐战力</th>
          <th className={thRight}>积分</th>
          {hasWorldLv ? <th className={thRight}>世界等级</th> : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map((row, index) => (
          <tr key={`${row.floor ?? ''}-${index}`} className="hover:bg-surface/50">
            <td className={tdName}>{row.floor != null ? `第${row.floor}层` : '-'}</td>
            <td className={tdPower}>{formatNumber(row.power)}</td>
            <td className={tdMono}>{formatNumber(row.point)}</td>
            {hasWorldLv ? <td className={tdMono}>{formatWorldLv(row.worldLv)}</td> : null}
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function PetHoleTable({ rows }: { rows: PetHoleRow[] }) {
  if (!rows.length) return <EmptyRows />;
  return (
    <TableShell>
      <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
        <tr className="border-b border-border">
          <th className={thBase}>首领等级</th>
          <th className={thRight}>精英战力</th>
          <th className={thRight}>推荐战力</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map((row, index) => (
          <tr key={`${row.bossLevel ?? ''}-${index}`} className="hover:bg-surface/50">
            <td className={tdName}>{row.bossLevel != null ? `Lv.${row.bossLevel}` : '-'}</td>
            <td className={tdPower}>{formatNumber(row.elitePower)}</td>
            <td className={tdPower}>{formatNumber(row.recommendPower)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function LeagueBossTable({ rows }: { rows: LeagueBossRow[] }) {
  if (!rows.length) return <EmptyRows />;
  return (
    <TableShell>
      <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
        <tr className="border-b border-border">
          <th className={thBase}>类型</th>
          <th className={thBase}>名称</th>
          <th className={thRight}>等级</th>
          <th className={thRight}>推荐战力</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map((row, index) => (
          <tr key={`${row.group ?? ''}-${row.name ?? ''}-${index}`} className="hover:bg-surface/50">
            <td className={tdText}>{row.kind ?? '-'}</td>
            <td className={tdName}>{row.name ?? '-'}</td>
            <td className={tdMono}>{formatNumber(row.level)}</td>
            <td className={tdPower}>{formatNumber(row.power)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function StarHavocTable({ rows }: { rows: StarHavocRow[] }) {
  if (!rows.length) return <EmptyRows />;
  return (
    <TableShell>
      <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-textSub shadow-sm">
        <tr className="border-b border-border">
          <th className={thBase}>进度值</th>
          <th className={thRight}>推荐战力</th>
          <th className={thRight}>扫荡解锁</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {rows.map((row, index) => (
          <tr key={`${row.value ?? ''}-${index}`} className="hover:bg-surface/50">
            <td className={tdName}>{formatNumber(row.value)}</td>
            <td className={tdPower}>{formatNumber(row.power)}</td>
            <td className={tdSweep}>{formatNumber(row.sweepPower)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function groupKeyOf(group: SectionGroup, index: number) {
  if (group.type != null) return `type-${group.type}`;
  if (group.group != null) return `group-${group.group}`;
  return `idx-${index}`;
}

function groupLabelOf(group: SectionGroup, index: number) {
  if (group.label) return group.label;
  if (group.group != null) return `第${group.group}组`;
  if (group.type != null) return `类型${group.type}`;
  return `分组${index + 1}`;
}

function GroupedSection({
  section,
  renderRows,
}: {
  section: Section;
  renderRows: (rows: any[]) => ReactNode;
}) {
  const groups = section.groups || [];
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const activeGroup = useMemo(() => {
    if (!groups.length) return null;
    const found = groups.find((group, index) => groupKeyOf(group, index) === activeKey);
    return found || groups[0];
  }, [activeKey, groups]);

  if (!groups.length) return <EmptyRows />;

  const activeGroupKey = activeGroup ? groupKeyOf(activeGroup, groups.indexOf(activeGroup)) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {groups.map((group, index) => {
          const key = groupKeyOf(group, index);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveKey(key)}
              className={clsx(
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                activeGroupKey === key
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-card text-textSub hover:text-textMain'
              )}
            >
              {groupLabelOf(group, index)}
            </button>
          );
        })}
      </div>
      {renderRows(activeGroup?.rows || [])}
    </div>
  );
}

function SectionContent({ section }: { section: Section }) {
  const rows = section.rows || [];
  switch (section.key) {
    case 'godwar_star':
      return <GodwarStarTables rows={rows as GodwarStarRow[]} />;
    case 'linglong_grade':
      return <LinglongGradeTable rows={rows as LinglongGradeRow[]} />;
    case 'stage_power':
      return (
        <GroupedSection
          section={section}
          renderRows={(groupRows) => <StagePowerTable rows={groupRows as StagePowerRow[]} />}
        />
      );
    case 'pet_tower':
      return <PetTowerTable rows={rows as PetTowerRow[]} />;
    case 'pet_champion_tower':
      return <PetChampionTowerTable rows={rows as PetChampionTowerRow[]} />;
    case 'pet_hole':
      return <PetHoleTable rows={rows as PetHoleRow[]} />;
    case 'league_boss':
      return <LeagueBossTable rows={rows as LeagueBossRow[]} />;
    case 'star_havoc':
      return (
        <GroupedSection
          section={section}
          renderRows={(groupRows) => <StarHavocTable rows={groupRows as StarHavocRow[]} />}
        />
      );
    default:
      return <EmptyRows />;
  }
}

export default function PowerRequirements({ dataSources }: Props) {
  const payload = asPayload(dataSources.power_requirements?.data);
  const sections = payload.sections || [];
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);

  const activeSection = useMemo(() => {
    if (!sections.length) return null;
    return sections.find((section) => section.key === activeSectionKey) || sections[0];
  }, [activeSectionKey, sections]);

  if (!dataSources.power_requirements) {
    return (
      <div className="card text-center py-20 border border-dashed border-border bg-transparent">
        <h3 className="text-xl text-textSub font-medium">正在加载战力需求数据...</h3>
      </div>
    );
  }

  if (!activeSection) {
    return (
      <div className="card text-center py-20 border border-dashed border-border bg-transparent">
        <h3 className="text-xl text-textSub font-medium">未找到战力需求数据</h3>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveSectionKey(section.key)}
            className={clsx(
              'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              activeSection.key === section.key
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-card text-textSub hover:text-textMain'
            )}
          >
            {section.label}
          </button>
        ))}
      </div>

      {activeSection.description ? (
        <p className="text-sm text-textSub">{activeSection.description}</p>
      ) : null}

      <SectionContent key={activeSection.key} section={activeSection} />
    </div>
  );
}
