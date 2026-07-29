import { Activity, Clock3, Database, Download, RefreshCw, Settings2, ShieldCheck, Sparkles, TerminalSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchVisitorHistory, type VisitorHistoryResponse } from '../lib/api';
import { type AdminSettingsInput, type AdminTask, useOpsStatus } from '../hooks/useOpsStatus';

function formatTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatDuration(value: number | null) {
  if (value == null) return '—';
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${minutes}m ${remain}s`;
}

function statusTone(running: boolean, lastError: string | null) {
  if (running) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (lastError) return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
}

export default function OpsDashboard() {
  const { status, latestLogLines, loading, error, token, setToken, refresh, runTask, updateSettings } = useOpsStatus();
  const [visitorHistory, setVisitorHistory] = useState<VisitorHistoryResponse | null>(null);
  const [visitorHistoryLoading, setVisitorHistoryLoading] = useState(true);
  const [submittingTask, setSubmittingTask] = useState<AdminTask | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [maxLevelInput, setMaxLevelInput] = useState('220');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshIntervalInput, setAutoRefreshIntervalInput] = useState('360');
  const [autoRefreshOnStart, setAutoRefreshOnStart] = useState(false);

  const cards = useMemo(() => [
    { label: 'dataApi JSON', value: status.dataApiFileCount, hint: `最近更新 ${formatTime(status.latestDataApiAt)}`, icon: Download },
    { label: 'output JSON', value: status.outputFileCount, hint: `最近更新 ${formatTime(status.latestOutputAt)}`, icon: Database },
    { label: '自动更新', value: status.autoRefreshEnabled ? `${status.autoRefreshIntervalMinutes} 分钟` : '已关闭', hint: `下次执行 ${formatTime(status.nextRunAt)}`, icon: Clock3 },
    { label: '服务在线', value: `${status.uptimeSeconds}s`, hint: `服务器时间 ${formatTime(status.serverTime)}`, icon: Activity },
  ], [status]);

  useEffect(() => {
    setMaxLevelInput(String(status.configuredMaxLevel ?? 220));
    setAutoRefreshEnabled(Boolean(status.autoRefreshEnabled));
    setAutoRefreshIntervalInput(String(status.autoRefreshIntervalMinutes || 360));
    setAutoRefreshOnStart(Boolean(status.autoRefreshOnStart));
  }, [
    status.autoRefreshEnabled,
    status.autoRefreshIntervalMinutes,
    status.autoRefreshOnStart,
    status.configuredMaxLevel,
  ]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();

    async function loadVisitorHistory() {
      try {
        const nextHistory = await fetchVisitorHistory(30, controller.signal);
        if (!disposed) {
          setVisitorHistory(nextHistory);
        }
      } catch (nextError) {
        if (!disposed) {
          console.error(nextError);
        }
      } finally {
        if (!disposed) {
          setVisitorHistoryLoading(false);
        }
      }
    }

    void loadVisitorHistory();
    const timer = window.setInterval(() => {
      void loadVisitorHistory();
    }, 60 * 1000);

    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  async function handleSaveSettings() {
    const maxLevel = Number(maxLevelInput);
    const intervalMinutes = Number(autoRefreshIntervalInput);

    if (maxLevelInput.trim() === '' || !Number.isInteger(maxLevel) || maxLevel < 0) {
      window.alert('最大等级必须是非负整数');
      return;
    }

    if (autoRefreshIntervalInput.trim() === '' || !Number.isInteger(intervalMinutes) || intervalMinutes <= 0) {
      window.alert('自动更新周期必须是正整数分钟');
      return;
    }

    const nextSettings: AdminSettingsInput = {
      maxLevel,
      autoRefreshEnabled,
      autoRefreshIntervalMinutes: intervalMinutes,
      autoRefreshOnStart,
    };

    setSavingSettings(true);
    try {
      await updateSettings(nextSettings);
      await refresh();
    } catch (nextError) {
      console.error(nextError);
      window.alert(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleRun(task: AdminTask) {
    setSubmittingTask(task);
    try {
      await runTask(task);
      await refresh();
    } catch (nextError) {
      console.error(nextError);
      window.alert(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmittingTask(null);
    }
  }

  return (
    <div className="space-y-6 pb-20">
      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="card border border-border bg-card/90 backdrop-blur-sm cursor-default hover:translate-y-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase">
                <Sparkles className="w-4 h-4" />
                部署控制台
              </div>
              <h2 className="mt-4 text-2xl font-bold text-textMain">资源同步与展示服务</h2>
            </div>
            <div className={`px-3 py-2 rounded-xl border text-sm font-semibold ${statusTone(status.running, status.lastError)}`}>
              {status.running ? '任务执行中' : status.lastError ? '最近一次失败' : '服务正常'}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-border bg-surface/70 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-textSub">{card.label}</span>
                    <Icon className="w-4 h-4 text-cta" />
                  </div>
                  <div className="mt-3 text-2xl font-bold text-textMain">{card.value}</div>
                  <div className="mt-2 text-xs text-textSub leading-5">{card.hint}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card border border-border bg-card/90 cursor-default hover:translate-y-0">
          <div className="flex items-center gap-2 text-lg font-semibold text-textMain">
            <ShieldCheck className="w-5 h-5 text-cta" />
            面板访问
          </div>
          <p className="mt-3 text-sm text-textSub leading-6">
            只有用 `*-ops` 命令启动时，这个设置面板和管理接口才会开放。普通启动不会显示运维入口。
          </p>

          <label className="block mt-5">
            <span className="text-sm text-textSub">管理员令牌</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="input mt-2 w-full"
              placeholder={status.authRequired ? '请输入 settings.js 里的 adminToken' : '当前未设置 adminToken，可留空'}
            />
          </label>

          <div className="mt-4 rounded-2xl border border-border bg-surface/70 p-4 text-sm text-textSub leading-6">
            <div>
              面板状态：<span className="text-textMain font-semibold">{status.opsEnabled ? '已启用' : '未启用'}</span>
            </div>
            <div className="mt-2">
              认证状态：<span className="text-textMain font-semibold">{status.authRequired ? '需要令牌' : '无需令牌'}</span>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 leading-6">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card border border-border bg-card/90 cursor-default hover:translate-y-0">
          <div className="flex items-center gap-2 text-lg font-semibold text-textMain">
            <Settings2 className="w-5 h-5 text-cta" />
            服务设置
          </div>
          <p className="mt-3 text-sm text-textSub leading-6">
            这里保存的是项目根目录 `settings.js`。修改后会立即更新自动调度，重启服务后仍然保留。
          </p>

          <div className="mt-5 space-y-5">
            <div className="rounded-2xl border border-border bg-surface/70 p-4">
              <div className="text-base font-semibold text-textMain">全局等级过滤</div>
              <div className="mt-2 text-sm text-textSub leading-6">
                前端各模块不传 `maxLevel` 时，默认使用这里的等级上限。
              </div>
              <label className="block mt-4">
                <span className="text-sm text-textSub">最大等级</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={maxLevelInput}
                  onChange={(event) => setMaxLevelInput(event.target.value)}
                  className="input mt-2 w-full"
                  placeholder="例如 220"
                />
              </label>
              <div className="mt-3 text-sm text-textSub">
                当前生效：<span className="text-textMain font-semibold">Lv.{status.configuredMaxLevel}</span>
                <span className="mx-2">·</span>
                默认值：<span className="text-textMain font-semibold">Lv.{status.defaultMaxLevel}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface/70 p-4">
              <div className="text-base font-semibold text-textMain">自动更新</div>
              <div className="mt-2 text-sm text-textSub leading-6">
                这是简单的分钟周期调度。如果你要“每周四早上 8 点更新并重启”，请在服务器上用 `cron` 调 `manage.sh update`。
              </div>

              <label className="mt-4 flex items-center gap-3 text-sm text-textMain">
                <input
                  type="checkbox"
                  checked={autoRefreshEnabled}
                  onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                启用自动更新
              </label>

              <label className="block mt-4">
                <span className="text-sm text-textSub">自动更新周期（分钟）</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={autoRefreshIntervalInput}
                  onChange={(event) => setAutoRefreshIntervalInput(event.target.value)}
                  className="input mt-2 w-full"
                  placeholder="例如 60"
                />
              </label>

              <label className="mt-4 flex items-center gap-3 text-sm text-textMain">
                <input
                  type="checkbox"
                  checked={autoRefreshOnStart}
                  onChange={(event) => setAutoRefreshOnStart(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                服务启动后先执行一次全量更新
              </label>

              <div className="mt-3 text-sm text-textSub leading-6">
                当前状态：
                <span className="ml-1 text-textMain font-semibold">{status.autoRefreshEnabled ? '已启用' : '已关闭'}</span>
                <span className="mx-2">·</span>
                周期：<span className="text-textMain font-semibold">{status.autoRefreshIntervalMinutes} 分钟</span>
                <span className="mx-2">·</span>
                启动即更新：<span className="text-textMain font-semibold">{status.autoRefreshOnStart ? '是' : '否'}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={savingSettings || loading}
              onClick={() => void handleSaveSettings()}
              className="btn-primary min-w-40 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Settings2 className={`w-4 h-4 ${savingSettings ? 'animate-spin' : ''}`} />
              {savingSettings ? '保存中' : '保存 settings.js'}
            </button>
          </div>
        </div>

        <div className="card border border-border bg-card/90 cursor-default hover:translate-y-0">
          <div className="flex items-center gap-2 text-lg font-semibold text-textMain">
            <RefreshCw className="w-5 h-5 text-cta" />
            手动任务
          </div>
          <p className="mt-3 text-sm text-textSub leading-6">
            建议日常只点一键全量更新；如果你只想快速同步上游文件或重建展示数据，也可以分别执行单步任务。
          </p>

          <div className="mt-5 space-y-3">
            {[
              { task: 'pipeline' as const, title: '一键全量更新', desc: '拉取资源站、转换 dataApi，并重建 output 展示数据。' },
              { task: 'sync' as const, title: '仅拉取资源', desc: '只同步上游 config JS 并转换为 dataApi JSON。' },
              { task: 'extract' as const, title: '仅重建展示数据', desc: '基于当前 dataApi 重新生成 output JSON。' },
            ].map((item) => {
              const busy = submittingTask === item.task;
              return (
                <div key={item.task} className="rounded-2xl border border-border bg-surface/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-textMain">{item.title}</div>
                      <div className="mt-1 text-sm text-textSub leading-6">{item.desc}</div>
                    </div>
                    <button
                      type="button"
                      disabled={status.running || busy || loading}
                      onClick={() => void handleRun(item.task)}
                      className="btn-primary min-w-36 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                      {busy ? '提交中' : '立即执行'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl border border-border bg-surface/70 p-4">
              <div className="text-textSub">当前任务</div>
              <div className="mt-2 text-textMain font-semibold">{status.task || '空闲'}</div>
              <div className="mt-1 text-textSub">触发方式：{status.trigger || '—'}</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface/70 p-4">
              <div className="text-textSub">最近耗时</div>
              <div className="mt-2 text-textMain font-semibold">{formatDuration(status.lastDurationMs)}</div>
              <div className="mt-1 text-textSub">退出码：{status.lastExitCode ?? '—'}</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="card border border-border bg-card/90 cursor-default hover:translate-y-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-textMain">
                <Activity className="w-5 h-5 text-cta" />
                访问历史
              </div>
              <p className="mt-2 text-sm text-textSub leading-6">
                最近 30 天的每日去重访客数。这里看的不是访问次数，而是每天有多少个不同访客打开过站点。
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface/70 px-4 py-3 text-sm text-textSub">
              最近 30 天合计
              <div className="mt-1 text-2xl font-bold text-textMain">{visitorHistory?.totalVisitors ?? '—'}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1.4fr_0.6fr] gap-6">
            <div className="rounded-2xl border border-border bg-surface/60 p-4">
              {visitorHistoryLoading ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-textSub">访问历史加载中...</div>
              ) : visitorHistory && visitorHistory.items.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={visitorHistory.items} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="visitorArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'currentColor', fontSize: 12 }}
                        tickFormatter={(value: string) => value.slice(5)}
                        stroke="rgba(148, 163, 184, 0.35)"
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'currentColor', fontSize: 12 }}
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
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fill="url(#visitorArea)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-textSub">还没有可展示的访问历史。</div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-surface/60 p-4">
              <div className="text-sm font-semibold text-textMain">最近每日明细</div>
              <div className="mt-4 max-h-[280px] space-y-2 overflow-auto pr-1">
                {visitorHistory?.items.slice().reverse().map((item) => (
                  <div key={item.date} className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-3 py-2 text-sm">
                    <span className="text-textSub">{item.date}</span>
                    <span className="font-semibold text-textMain">{item.visitors} 人</span>
                  </div>
                ))}
                {!visitorHistoryLoading && (!visitorHistory || visitorHistory.items.length === 0) ? (
                  <div className="text-sm text-textSub">暂无数据</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="card border border-border bg-card/90 cursor-default hover:translate-y-0">
          <div className="flex items-center gap-2 text-lg font-semibold text-textMain">
            <TerminalSquare className="w-5 h-5 text-cta" />
            最近日志
          </div>
          <div className="mt-4 rounded-2xl border border-border bg-[#08111f] text-slate-100 p-4 min-h-96 max-h-[36rem] overflow-auto">
            {latestLogLines.length === 0 ? (
              <div className="text-sm text-slate-400">暂无任务日志。</div>
            ) : (
              <div className="space-y-2 font-mono text-xs leading-6">
                {latestLogLines.map((line, index) => (
                  <div key={`${index}-${line}`} className="break-all text-slate-200">{line}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
