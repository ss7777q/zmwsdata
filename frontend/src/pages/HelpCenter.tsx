import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CheckCircle2,
  LoaderCircle,
  ShieldAlert,
} from 'lucide-react';
import { fetchVisitorHistory, submitFeedback, type FeedbackCategory, type VisitorHistoryResponse } from '../lib/api';

const TITLE_LIMIT = 60;
const MESSAGE_LIMIT = 500;
const CONTACT_LIMIT = 80;
const VISITOR_HISTORY_DAYS = 30;
const VISITOR_TREND_CHART_HEIGHT_PX = 260;
const VISITOR_TREND_COLOR = '#f59e0b';

const coreHighlights = [
  {
    title: '集中查询养成消耗',
    description: '把角色、翅膀、宠物、坐骑、时装、修炼等系统的材料和成长成本集中到一个站点里。',
  },
  {
    title: '直接查看结果',
    description: '像神魔相关和 BOSS 属性这类模块，不只是看配置，还能直接看数值结果。',
  },
  {
    title: '少翻表，少对文件',
    description: '很多页面会先给总览，再给逐项细节，适合做规划、核对和分析。',
  },
];

const moduleGroups = [
  {
    title: '角色成长相关',
    items: [
      '角色装备：查看打造、升级、重铸等总消耗和逐级明细。',
      '灵宝系统：查看法宝、神器、阵法等成长内容。',
      '角色时装：查看时装球升级、续期和相关花费。',
      '翅膀系统：查看升级、进阶、洗练和强运成本。',
      '修炼系统：查看修心、内丹、炼体等长期成长内容。',
    ],
  },
  {
    title: '宠物与坐骑',
    items: [
      '宠物系统：查看技能、潜能、升星进阶 and 宠物装备。',
      '坐骑系统：查看图鉴、升星、技能 and 装备打造升级。',
    ],
  },
  {
    title: '特色分析模块',
    items: [
      '神魔相关：查看神魔属性结果，以及神灵石、魔灵石获取明细。',
      'BOSS 属性：按关卡类型查看 BOSS 属性和相关数值。',
      '玩家改名记录：输入 UID 查看历史名字时间线。',
    ],
  },
];

const usageSteps = [
  '先从左侧导航进入你要查询的系统。',
  '进入模块后，优先切换顶部标签页，把内容缩小到真正关心的分支。',
  '支持搜索的模块可以在顶部直接搜材料名、名称或关键字。',
  '推荐先看总量汇总，再看展开明细，这样更适合做养成规划。',
];

const scenarios = [
  '做养成规划，提前估算从当前阶段升到目标阶段的大致消耗。',
  '查材料去向，确认某个材料会在哪些系统里使用。',
  '做数值比对，比较不同 BOSS、不同阶段或不同条件下的数据差异。',
  '做记录检索，按 UID 查询玩家历史名字。',
];

const categoryOptions: Array<{ value: FeedbackCategory; label: string; hint: string }> = [
  { value: 'feature', label: '功能建议', hint: '适合提新增功能、交互优化或入口调整。' },
  { value: 'data', label: '数据问题', hint: '适合反馈数值异常、顺序不对、缺数据等问题。' },
  { value: 'ux', label: '页面体验', hint: '适合反馈显示异常、移动端问题、布局不顺手。' },
  { value: 'other', label: '其他反馈', hint: '上面都不太符合时就放这里。' },
];

const areaOptions = [
  '通用建议',
  '角色装备',
  '灵宝系统',
  '角色时装',
  '翅膀系统',
  '修炼系统',
  '宠物系统',
  '坐骑系统',
  '神魔相关',
  'BOSS 属性',
  '玩家改名记录',
] as const;

function formatTime(value: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString('zh-CN');
}

function formatVisitorDate(value: string) {
  return value.slice(5).replace('-', '/');
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="w-1.5 h-8 bg-primary rounded-full shrink-0"></div>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-textMain">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-textSub">{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function HelpCenter() {
  const [category, setCategory] = useState<FeedbackCategory>('feature');
  const [area, setArea] = useState<string>('通用建议');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null);
  const [visitorHistory, setVisitorHistory] = useState<VisitorHistoryResponse | null>(null);
  const [visitorHistoryLoading, setVisitorHistoryLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    async function loadVisitorHistory() {
      setVisitorHistoryLoading(true);
      try {
        const response = await fetchVisitorHistory(VISITOR_HISTORY_DAYS, controller.signal);
        if (!disposed) {
          setVisitorHistory(response);
        }
      } catch {
        if (!disposed) {
          setVisitorHistory(null);
        }
      } finally {
        if (!disposed) {
          setVisitorHistoryLoading(false);
        }
      }
    }

    void loadVisitorHistory();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, []);

  const selectedCategory = useMemo(
    () => categoryOptions.find((item) => item.value === category) || categoryOptions[0],
    [category]
  );

  const remainingMessage = MESSAGE_LIMIT - message.length;
  const canSubmit = title.trim().length >= 4 && message.trim().length >= 10 && !submitting;
  const visitorTrendItems = visitorHistory?.items ?? [];
  const visitorTrendTotal = visitorHistory?.totalVisitors ?? 0;
  const visitorTrendPeak = visitorHistory?.maxVisitors ?? 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setError('请至少填写 4 个字的标题和 10 个字的建议内容。');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await submitFeedback({
        category,
        area,
        title,
        message,
        contact,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      });

      setSuccessMessage(response.message);
      setLastSubmittedAt(response.receivedAt);
      setTitle('');
      setMessage('');
      setContact('');
      setArea('通用建议');
      setCategory('feature');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <section className="rounded-[28px] border border-border bg-card px-6 py-7 shadow-sm lg:px-8 lg:py-8">
        <div className="w-full min-w-0 space-y-6">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-bold tracking-[0.18em] text-primary uppercase">
            HELP & FEEDBACK
          </div>

          <div className="max-w-5xl min-w-0 space-y-4">
            <h2 className="text-3xl font-bold tracking-tight text-textMain">这个网站能做什么</h2>
            <p className="max-w-4xl text-base leading-8 text-textSub break-words">
              《造梦无双资源消耗》是一个面向普通使用者的查询站，把分散的养成消耗、阶段配置、数值结果和记录查询整合在一起。
              你不用反复翻表或对照文件，就能更快找到自己想看的内容。
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {coreHighlights.map((item) => {
              return (
                <article key={item.title} className="rounded-2xl border-y border-r border-l-4 border-l-primary border-border bg-surface/60 p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-textMain">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-textSub break-words">{item.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm lg:p-8">
          <SectionTitle
            title="主要模块能看什么"
            description="按模块快速了解站里都能查哪些内容。"
          />

          <div className="mt-6 space-y-5">
            {moduleGroups.map((group) => (
              <div key={group.title} className="rounded-2xl border border-border bg-surface/45 p-5">
                <h3 className="text-lg font-semibold text-textMain">{group.title}</h3>
                <div className="mt-4 space-y-3 text-sm leading-7 text-textSub">
                  {group.items.map((item) => (
                    <p key={item} className="break-words">{item}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm lg:p-7">
            <SectionTitle
              title="推荐使用方式"
              description="按这个顺序看，通常会更顺手。"
            />

            <div className="mt-5 space-y-3">
              {usageSteps.map((step, index) => (
                <div key={step} className="flex gap-4 rounded-2xl border border-border bg-surface/50 px-4 py-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-7 text-textSub break-words">{step}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-border bg-card p-6 shadow-sm lg:p-7">
            <SectionTitle
              title="适合哪些场景"
              description="如果你平时主要用来看这些，就会很合适。"
            />

            <div className="mt-5 space-y-3">
              {scenarios.map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-surface/50 px-4 py-4 text-sm leading-7 text-textSub break-words">
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm lg:p-7">
          <SectionTitle
            title="建议反馈"
            description="发现数据问题、显示异常，或者想提功能建议，都可以在这里提交。"
          />

          <div className="mt-6 space-y-3">
            {categoryOptions.map((item) => (
              <div key={item.value} className="rounded-2xl border border-border bg-surface/55 px-4 py-4">
                <div className="text-sm font-semibold text-textMain">{item.label}</div>
                <div className="mt-1 text-sm leading-6 text-textSub">{item.hint}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-sm leading-7 text-amber-700 dark:text-amber-200">
            造梦无双数值群 : 513291473
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-surface/55 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-textMain">
                  <span className="w-1 h-4 bg-cta rounded-full shrink-0"></span>
                  访问趋势
                </div>
                <p className="mt-1 text-xs leading-5 text-textSub">最近 {VISITOR_HISTORY_DAYS} 天每日访客变化</p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full border border-border bg-card px-3 py-1 text-textSub">累计 {visitorTrendTotal}</span>
                <span className="rounded-full border border-border bg-card px-3 py-1 text-textSub">峰值 {visitorTrendPeak}</span>
              </div>
            </div>

            <div className="mt-4" style={{ height: VISITOR_TREND_CHART_HEIGHT_PX }}>
              {visitorHistoryLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-textSub">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  正在加载访问趋势
                </div>
              ) : visitorTrendItems.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visitorTrendItems} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="helpVisitorTrendArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={VISITOR_TREND_COLOR} stopOpacity={0.42} />
                        <stop offset="100%" stopColor={VISITOR_TREND_COLOR} stopOpacity={0.06} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: 'currentColor', fontSize: 11 }}
                      tickFormatter={formatVisitorDate}
                      stroke="rgba(148, 163, 184, 0.35)"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: 'currentColor', fontSize: 11 }}
                      stroke="rgba(148, 163, 184, 0.35)"
                    />
                    <Tooltip
                      formatter={(value) => [`${Number(value ?? 0)} 人`, '当天访客']}
                      labelFormatter={(label) => `日期 ${String(label ?? '')}`}
                      contentStyle={{
                        borderRadius: '16px',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        background: 'rgba(15, 23, 42, 0.92)',
                        color: '#f8fafc',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      stroke={VISITOR_TREND_COLOR}
                      strokeWidth={2}
                      fill="url(#helpVisitorTrendArea)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-textSub">还没有可展示的访问历史。</div>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[28px] border border-border bg-card p-6 shadow-sm lg:p-7">
          <div className="grid gap-5">
            <label className="space-y-2">
              <span className="text-sm font-medium text-textSub">反馈类型</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
                className="input w-full"
              >
                {categoryOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <p className="text-xs leading-6 text-textSub">{selectedCategory.hint}</p>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-textSub">相关模块</span>
              <select value={area} onChange={(event) => setArea(event.target.value)} className="input w-full">
                {areaOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-textSub">标题</span>
                <span className="text-xs text-textSub">{title.length}/{TITLE_LIMIT}</span>
              </div>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value.slice(0, TITLE_LIMIT))}
                maxLength={TITLE_LIMIT}
                className="input w-full"
                placeholder="例如：神魔相关页面文字显示太挤"
              />
            </label>

            <label className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-textSub">建议内容</span>
                <span className={`text-xs ${remainingMessage < 60 ? 'text-amber-500' : 'text-textSub'}`}>
                  {message.length}/{MESSAGE_LIMIT}
                </span>
              </div>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_LIMIT))}
                maxLength={MESSAGE_LIMIT}
                rows={8}
                className="input min-h-[220px] w-full resize-y"
                placeholder="尽量写清楚出现在哪个模块、什么情况下出现、你希望怎么改。"
              />
            </label>

            <label className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-textSub">联系方式或备注（可选）</span>
                <span className="text-xs text-textSub">{contact.length}/{CONTACT_LIMIT}</span>
              </div>
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value.slice(0, CONTACT_LIMIT))}
                maxLength={CONTACT_LIMIT}
                className="input w-full"
                placeholder="例如：QQ / 邮箱 / 留空也可以"
              />
            </label>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-200">
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-700 dark:text-emerald-200">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                {successMessage}
              </div>
              {lastSubmittedAt ? (
                <div className="mt-1 text-xs opacity-80">提交时间：{formatTime(lastSubmittedAt)}</div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm leading-6 text-textSub">
              <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-cta" />
              <span>请勿短时间内重复提交相同内容，后台会保留记录，后续我会手动查看。</span>
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary inline-flex min-w-40 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {submitting ? '提交中' : '提交建议'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
