import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useTempPreviewCatalog, useTempPreviewUnit } from '../hooks/useTempPreviewData';
import type { TempPreviewCatalogCategory, TempPreviewCategoryItem, TempPreviewExport } from '../lib/temp-preview-api';

type CategoryId = 'role' | 'pet' | 'ride';

const CATEGORY_META: Record<CategoryId, { label: string; description: string }> = {
  role: {
    label: '角色',
    description: '查看当前已有角色的介绍与多表数值详情。',
  },
  pet: {
    label: '宠物',
    description: '宠物模块占位中，后续接正式数据。',
  },
  ride: {
    label: '坐骑',
    description: '坐骑模块占位中，后续接正式数据。',
  },
};

function formatDate(value?: string | null) {
  if (!value) {
    return '未知';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function stringifyCell(value: unknown) {
  if (value == null) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function useCategoryMap(categories: TempPreviewCatalogCategory[] | undefined) {
  return useMemo(() => {
    const map = new Map<string, TempPreviewCatalogCategory>();
    for (const category of categories || []) {
      map.set(category.id, category);
    }
    return map;
  }, [categories]);
}

function UpgradeLayout({ children }: { children: React.ReactNode }) {
  const { data, loading, error } = useTempPreviewCatalog();
  const categories = data?.categories || [];
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5">
          <Link to="/upgrade/category/role" className="flex items-center gap-3 text-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg font-black text-lg">
              数
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight">数值站点预览</div>
              <div className="text-sm text-slate-500">临时路由版站点骨架</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-3 lg:flex">
            <Link to="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-slate-300 hover:text-slate-900">
              返回旧面板
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-8 px-6 py-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-sky-600">Upgrade Data</div>
            <h2 className="mt-2 text-2xl font-black">升级数据</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">左侧是分类入口，右侧是列表或详情页面。当前优先接入角色。</p>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">正在加载分类...</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">{error}</div>
          ) : (
            <div className="mobile-scroll-container">
              <div className="mobile-scroll-list-lg">
                {categories.map((category) => {
                  const meta = CATEGORY_META[category.id as CategoryId];
                  const active = location.pathname.startsWith(`/upgrade/category/${category.id}`);
                  return (
                    <Link
                      key={category.id}
                      to={`/upgrade/category/${category.id}`}
                      className={`mobile-scroll-item-lg flex items-start gap-3 rounded-2xl border px-4 py-4 transition-all ${
                        active
                          ? 'border-sky-200 bg-sky-50 text-sky-900'
                          : 'border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white'
                      }`}
                    >
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${active ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/20' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                        {meta.label[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold">{meta.label}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{meta.description}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="mobile-scroll-mask-lg" />
            </div>
          )}
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-2">
          {item.to ? <Link to={item.to} className="hover:text-slate-900">{item.label}</Link> : <span className="font-semibold text-slate-900">{item.label}</span>}
          {index < items.length - 1 && <ChevronRight className="h-4 w-4" />}
        </span>
      ))}
    </nav>
  );
}

function UnitCard({ unit }: { unit: TempPreviewCategoryItem }) {
  const title = String(unit.roleName || unit.label || unit.unitSlug || '未命名单元');
  const subtitle = `展示行 ${String(unit.excelDisplayRowsCount ?? 0)} / 未解决 ${String(unit.unresolvedCount ?? 0)}`;
  const unitSlug = String(unit.unitSlug || unit.roleKey || '');

  return (
    <Link
      to={`/upgrade/unit/${unitSlug}`}
      className="group rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-100"
    >
      <div className="flex aspect-square items-center justify-center rounded-[20px] bg-[radial-gradient(circle_at_top,#dbeafe,transparent_60%),linear-gradient(135deg,#f8fafc,#eef2ff)] text-4xl font-black text-sky-700">
        {title.slice(0, 2)}
      </div>
      <div className="mt-4 text-xl font-black tracking-tight text-slate-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</div>
    </Link>
  );
}

function CategoryPage() {
  const { categoryId = 'role' } = useParams();
  const { data, loading, error } = useTempPreviewCatalog();
  const categoryMap = useCategoryMap(data?.categories);
  const category = categoryMap.get(categoryId);
  const meta = CATEGORY_META[(categoryId in CATEGORY_META ? categoryId : 'role') as CategoryId];

  if (loading) {
    return <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-slate-500 shadow-sm">正在加载分类内容...</div>;
  }

  if (error) {
    return <div className="rounded-[28px] border border-red-200 bg-red-50 p-10 text-red-700 shadow-sm">分类加载失败：{error}</div>;
  }

  if (!category) {
    return <Navigate to="/upgrade/category/role" replace />;
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: '首页', to: '/upgrade/category/role' },
          { label: '升级数据', to: `/upgrade/category/${category.id}` },
          { label: meta.label },
        ]}
      />

      <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-5xl font-black tracking-tight text-slate-900">{meta.label}</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">{category.description}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-5 py-4 text-right">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">当前单位数</div>
            <div className="mt-2 text-3xl font-black text-slate-900">{category.items.length}</div>
          </div>
        </div>
      </section>

      {category.id !== 'role' ? (
        <section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <div className="text-2xl font-black text-slate-900">{meta.label}模块筹备中</div>
          <p className="mt-3 text-slate-500">{meta.description}</p>
        </section>
      ) : (
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="w-1 h-5 rounded bg-sky-600"></span>
            <h2 className="text-2xl font-black text-slate-900">当前所有单位</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {category.items.map((item) => (
              <UnitCard key={String(item.unitSlug || item.roleKey)} unit={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BasicInfoGrid({ data }: { data: TempPreviewExport }) {
  const sectionCounts = Object.fromEntries(
    Object.entries(data.sections || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]),
  );

  const rows = [
    ['角色 Key', data.meta.roleKey],
    ['角色名', data.meta.roleName],
    ['展示表数', String(sectionCounts.excelDisplayRows || 0)],
    ['基础技能', String(sectionCounts.baseSkills || 0)],
    ['觉醒分支', String(sectionCounts.awakenSkills || 0)],
    ['变身技能', String(sectionCounts.transSkills || 0)],
    ['衍生技能', String(sectionCounts.derivedSkills || 0)],
    ['Buff 规则', String(sectionCounts.buffRules || 0)],
    ['生成时间', formatDate(data.meta.generatedAt)],
  ];

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-black text-slate-900">单位基础信息</h2>
      <div className="mt-5 grid gap-0 overflow-hidden rounded-2xl border border-slate-200 md:grid-cols-2">
        {rows.map(([label, value], index) => (
          <div key={`${label}-${index}`} className="grid grid-cols-[160px_minmax(0,1fr)] border-b border-r border-slate-200 bg-white p-4 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0">
            <div className="font-bold text-slate-600">{label}</div>
            <div className="text-slate-900">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataTableGroup({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  if (!rows.length) {
    return null;
  }
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h3 className="text-2xl font-black text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-4 py-3 text-left font-bold text-slate-600">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`} className="border-t border-slate-100 align-top">
                {columns.map((column) => (
                  <td key={column} className="whitespace-pre-wrap px-4 py-3 text-slate-900">
                    {stringifyCell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExcelDisplayTable({ row }: { row: Record<string, unknown> }) {
  const columns = Array.isArray(row.columns) ? row.columns as string[] : [];
  const rows = Array.isArray(row.rows) ? row.rows as Array<Record<string, unknown>> : [];
  const notes = typeof row.notes === 'string' ? row.notes : null;

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-black text-slate-900">{String(row.excelLabel || '未命名表')}</h3>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">{String(row.excelRef || '无引用')}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{String(row.excelSheet || '未知来源')}</span>
        </div>
        {notes && <p className="mt-3 text-sm leading-6 text-slate-500">{notes}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-4 py-3 text-left font-bold text-slate-600">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={`${String(row.excelRef)}-${index}`} className="border-t border-slate-100 align-top">
                {columns.map((column) => (
                  <td key={column} className="whitespace-pre-wrap px-4 py-3 text-slate-900">
                    {stringifyCell(item[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UnitDetailPage() {
  const { unitSlug = '' } = useParams();
  const { data, loading, error } = useTempPreviewUnit(unitSlug);

  if (loading) {
    return <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-slate-500 shadow-sm">正在加载单位详情...</div>;
  }

  if (error) {
    return <div className="rounded-[28px] border border-red-200 bg-red-50 p-10 text-red-700 shadow-sm">单位详情加载失败：{error}</div>;
  }

  if (!data) {
    return <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-slate-500 shadow-sm">未找到该单位。</div>;
  }

  const exportData = data.export;
  const notes = exportData.notes || [];
  const excelDisplayRows = Array.isArray(exportData.sections?.excelDisplayRows) ? exportData.sections.excelDisplayRows as Array<Record<string, unknown>> : [];
  const rawSections = Object.entries(exportData.sections || {})
    .filter(([key, value]) => key !== 'excelDisplayRows' && Array.isArray(value) && value.length > 0)
    .map(([key, value]) => [key, value as Array<Record<string, unknown>>] as const);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: '首页', to: '/upgrade/category/role' },
          { label: '升级数据', to: '/upgrade/category/role' },
          { label: '角色', to: '/upgrade/category/role' },
          { label: data.unitMeta.roleName },
        ]}
      />

      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-8 p-8 lg:grid-cols-[1.1fr_420px]">
          <div>
            <div className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">
              Unit Detail
            </div>
            <h1 className="mt-5 text-5xl font-black tracking-tight text-slate-900">{data.unitMeta.roleName}</h1>
            <div className="mt-4 max-w-3xl space-y-3 text-base leading-8 text-slate-600">
              {notes.slice(0, 4).map((note, index) => (
                <p key={`${note}-${index}`}>{note}</p>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center rounded-[28px] bg-[radial-gradient(circle_at_top,#dbeafe,transparent_58%),linear-gradient(135deg,#f8fafc,#eef2ff)] p-8">
            <div className="flex h-[320px] w-[320px] items-center justify-center rounded-[32px] border border-white/70 bg-white/50 text-center text-6xl font-black text-sky-700 shadow-inner">
              {data.unitMeta.roleName.slice(0, 2)}
            </div>
          </div>
        </div>
      </section>

      <BasicInfoGrid data={exportData} />

      <section className="space-y-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900">详细升级数据</h2>
          <p className="mt-2 text-slate-500">先按 Excel 展示层输出，再补充原始技能/觉醒/buff 分区。</p>
        </div>
        <div className="space-y-4">
          {excelDisplayRows.map((row, index) => (
            <ExcelDisplayTable key={`${String(row.excelRef)}-${index}`} row={row} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900">原始分区数据</h2>
          <p className="mt-2 text-slate-500">保留原始导出分区，便于继续细化到更多复杂数值结构。</p>
        </div>
        <div className="space-y-4">
          {rawSections.map(([key, value]) => (
            <DataTableGroup key={key} title={key} rows={value} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function UpgradeSite() {
  return (
    <UpgradeLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/upgrade/category/role" replace />} />
        <Route path="/category/:categoryId" element={<CategoryPage />} />
        <Route path="/unit/:unitSlug" element={<UnitDetailPage />} />
        <Route path="*" element={<Navigate to="/upgrade/category/role" replace />} />
      </Routes>
    </UpgradeLayout>
  );
}
