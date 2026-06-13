import { useMemo, useState } from 'react';
import { useTempPreviewCatalog, useTempPreviewRole } from '../hooks/useTempPreviewData';
import type { TempPreviewCatalogCategory, TempPreviewExport } from '../lib/temp-preview-api';

type CategoryId = 'role' | 'pet' | 'ride';

const CATEGORY_META: Record<CategoryId, { subtitle: string }> = {
  role: { subtitle: '按角色导出结构自动展示 excelDisplayRows 与技能分区。' },
  pet: { subtitle: '临时占位，后续接宠物导出结构。' },
  ride: { subtitle: '临时占位，后续接坐骑导出结构。' },
};

function formatDate(value?: string | null) {
  if (!value) {
    return '未知';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function stringifyCell(value: unknown) {
  if (value == null) {
    return '-';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

function DisplayRowTable({ row }: { row: Record<string, unknown> }) {
  const columns = Array.isArray(row.columns) ? row.columns as string[] : [];
  const rows = Array.isArray(row.rows) ? row.rows as Array<Record<string, unknown>> : [];
  const notesText = typeof row.notes === 'string' ? row.notes : null;

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-surface/70">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-semibold text-textMain">{String(row.excelLabel || '未命名展示行')}</div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {String(row.excelRef || '无引用')}
          </span>
          <span className="rounded-full bg-cta/10 px-3 py-1 text-xs font-medium text-cta">
            {String(row.excelSheet || '未知工作表')}
          </span>
        </div>
        {notesText && (
          <p className="mt-2 text-sm text-textSub">{notesText}</p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-surface/50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 text-left font-semibold text-textSub whitespace-nowrap">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={`${String(row.excelRef)}-${index}`} className="border-t border-border/80 align-top">
                {columns.map((column) => (
                  <td key={column} className="px-4 py-3 text-textMain whitespace-pre-wrap">
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

function GenericSectionCards({ title, items }: { title: string; items: unknown[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="w-1.5 h-4 bg-primary rounded-full shrink-0"></span>
        <h3 className="text-lg font-semibold text-textMain">{title}</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item, index) => {
          const entry = item as Record<string, unknown>;
          const label = String(entry.label || entry.skillName || entry.excelLabel || `条目 ${index + 1}`);
          const excelRef = entry.excelRef == null ? null : String(entry.excelRef);
          return (
            <article key={`${title}-${label}-${index}`} className="rounded-xl border border-border bg-surface/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-semibold text-textMain">{label}</div>
                {excelRef && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                    {excelRef}
                  </span>
                )}
              </div>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-background/70 p-3 text-xs text-textSub">
                {JSON.stringify(entry, null, 2)}
              </pre>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RolePreviewPanel({ data }: { data: TempPreviewExport }) {
  const sections = data.sections || {};
  const excelDisplayRows = Array.isArray(sections.excelDisplayRows) ? sections.excelDisplayRows : [];
  const genericSections = Object.entries(sections)
    .filter(([key, value]) => key !== 'excelDisplayRows' && Array.isArray(value) && value.length > 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-textMain">{data.meta.roleName}</h2>
            <p className="mt-2 text-sm text-textSub">
              角色 Key: {data.meta.roleKey} | 导出版本: {data.meta.exportVersion} | 生成时间: {formatDate(data.meta.generatedAt)}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-surface px-4 py-3 text-sm">
              <div className="text-textSub">展示行</div>
              <div className="mt-1 text-xl font-semibold text-textMain">{excelDisplayRows.length}</div>
            </div>
            <div className="rounded-xl bg-surface px-4 py-3 text-sm">
              <div className="text-textSub">未解决项</div>
              <div className="mt-1 text-xl font-semibold text-textMain">{data.unresolved.length}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-textMain">Excel 展示层</h3>
          <p className="mt-1 text-sm text-textSub">前端优先按 `excelDisplayRows` 渲染，不做角色特判，直接根据列定义展示。</p>
        </div>
        <div className="space-y-4">
          {excelDisplayRows.map((row, index) => (
            <DisplayRowTable key={`${String((row as Record<string, unknown>).excelRef)}-${index}`} row={row as Record<string, unknown>} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-textMain">原始分区</h3>
          <p className="mt-1 text-sm text-textSub">保留 base / awaken / buffRules / derived 等结构，便于后续继续泛化展示。</p>
        </div>
        <div className="space-y-4">
          {genericSections.map(([key, value]) => (
            <GenericSectionCards key={key} title={key} items={value as unknown[]} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PlaceholderPanel({ category }: { category: TempPreviewCatalogCategory }) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-primary font-bold text-lg">
        待
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-textMain">{category.label}模块筹备中</h2>
      <p className="mt-2 text-textSub">{category.description}</p>
    </section>
  );
}

export default function ValuePreview() {
  const { data: catalog, loading: catalogLoading, error: catalogError } = useTempPreviewCatalog();
  const [activeCategory, setActiveCategory] = useState<CategoryId>('role');

  const roleCategory = useMemo(
    () => catalog?.categories.find((item) => item.id === 'role'),
    [catalog],
  );
  const roleItems = roleCategory?.items ?? [];
  const [activeRoleKey, setActiveRoleKey] = useState<string | null>(null);

  const currentRoleKey = useMemo(() => {
    if (activeCategory !== 'role') {
      return null;
    }
    if (activeRoleKey && roleItems.some((item) => item.roleKey === activeRoleKey)) {
      return activeRoleKey;
    }
    return roleItems.find((item) => item.roleKey)?.roleKey ?? null;
  }, [activeCategory, activeRoleKey, roleItems]);

  const { data: roleData, loading: roleLoading, error: roleError } = useTempPreviewRole(currentRoleKey);

  const currentCategory = catalog?.categories.find((item) => item.id === activeCategory) ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(30,64,175,0.08),rgba(245,158,11,0.12),rgba(255,255,255,0.96))] p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              Temp Preview
            </div>
            <h1 className="mt-3 text-3xl font-bold text-textMain">数值展示模块</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['role', 'pet', 'ride'] as CategoryId[]).map((categoryId) => {
              const meta = CATEGORY_META[categoryId];
              const active = activeCategory === categoryId;
              return (
                <button
                  key={categoryId}
                  type="button"
                  onClick={() => setActiveCategory(categoryId)}
                  className={`rounded-2xl border px-4 py-4 text-left transition-all ${active
                      ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20'
                      : 'border-border bg-white/80 text-textMain hover:border-primary/30 hover:bg-white'
                    }`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${active ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>
                      {categoryId.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-3 text-base font-semibold">{categoryId === 'role' ? '角色' : categoryId === 'pet' ? '宠物' : '坐骑'}</div>
                  <div className={`mt-1 text-xs ${active ? 'text-white/80' : 'text-textSub'}`}>
                    {meta.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {catalogLoading ? (
        <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm text-textSub">
          正在加载临时预览目录...
        </section>
      ) : catalogError ? (
        <section className="rounded-2xl border border-red-300 bg-red-50 p-8 text-center text-red-700 shadow-sm">
          临时预览目录加载失败：{catalogError}
        </section>
      ) : currentCategory == null ? (
        <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm text-textSub">
          未找到当前分类。
        </section>
      ) : activeCategory !== 'role' ? (
        <PlaceholderPanel category={currentCategory} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-textMain">角色目录</h2>
              <p className="mt-1 text-sm text-textSub">选择角色后，右侧按参数驱动展示导出结构。</p>
            </div>
            <div className="space-y-2">
              {roleItems.map((item) => {
                const active = item.roleKey === currentRoleKey;
                return (
                  <button
                    key={item.roleKey}
                    type="button"
                    onClick={() => setActiveRoleKey(item.roleKey ?? null)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${active
                        ? 'border-primary bg-primary text-white shadow-md shadow-primary/15'
                        : 'border-border bg-surface/60 text-textMain hover:border-primary/30 hover:bg-surface'
                      }`}
                  >
                    <div className="font-semibold">{item.roleName || item.roleKey}</div>
                    <div className={`mt-1 text-xs ${active ? 'text-white/80' : 'text-textSub'}`}>
                      展示行 {String(item.excelDisplayRowsCount ?? 0)} | 未解决 {String(item.unresolvedCount ?? 0)}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div>
            {roleLoading ? (
              <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm text-textSub">
                正在加载角色导出...
              </section>
            ) : roleError ? (
              <section className="rounded-2xl border border-red-300 bg-red-50 p-8 text-center text-red-700 shadow-sm">
                角色导出加载失败：{roleError}
              </section>
            ) : roleData ? (
              <RolePreviewPanel data={roleData} />
            ) : (
              <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm text-textSub">
                请选择一个角色。
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
