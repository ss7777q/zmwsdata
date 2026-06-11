import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, Clock3, LoaderCircle, SearchCheck, Server } from 'lucide-react';
import { fetchPlayerNameHistory, type PlayerNameHistoryResponse } from '../lib/api';

function formatTime(value: number | null | undefined) {
  if (value == null) {
    return '—';
  }
  return new Date(value).toLocaleString('zh-CN');
}

export default function PlayerLookup() {
  const [uidInput, setUidInput] = useState('');
  const [history, setHistory] = useState<PlayerNameHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const historyAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    historyAbortRef.current?.abort();
  }, []);

  async function runHistory(uid: string) {
    const nextUid = uid.trim();
    if (!nextUid) {
      setHistory(null);
      setHistoryError('先输入 UID');
      return;
    }

    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    setHistoryLoading(true);
    setHistoryError('');
    setUidInput(nextUid);

    try {
      const result = await fetchPlayerNameHistory(nextUid, controller.signal);
      setHistory(result);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setHistory(null);
      setHistoryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (historyAbortRef.current === controller) {
        historyAbortRef.current = null;
      }
      setHistoryLoading(false);
    }
  }

  function handleUidSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runHistory(uidInput);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <form onSubmit={handleUidSubmit} className="rounded-[24px] border border-border bg-card px-5 py-5 shadow-sm lg:px-6">
            <div className="flex items-center gap-2 text-lg font-semibold text-textMain">
              <Server className="h-5 w-5 text-cta" />
              UID 历史记录
            </div>
            <p className="mt-3 text-sm leading-6 text-textSub">
              输入 UID 后查询这个角色出现过的历史名字。
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <input
                value={uidInput}
                onChange={(event) => setUidInput(event.target.value)}
                placeholder="例如：2058952028|4399|22"
                className="input w-full font-mono"
              />
              <button
                type="submit"
                disabled={historyLoading}
                className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {historyLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                查看 UID 历史
              </button>
            </div>

            {historyError ? (
              <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {historyError}
              </div>
            ) : null}
          </form>


          <div className="rounded-[24px] border border-border bg-surface/40 px-5 py-5 text-sm leading-6 text-textSub shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-textMain">
              <AlertTriangle className="h-4 w-4 text-cta" />
              使用提醒
            </div>
            <ul className="mt-3 space-y-2">
              <li>数据源全部来自于自25年6月开始的神魔精彩战报的记录</li>
              <li>一定会出现漏记的情况,自己参考着玩吧</li>
            </ul>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-card px-5 py-5 shadow-sm lg:px-6">
          <div className="flex flex-col gap-4 border-b border-border/70 pb-4">
            <div className="flex items-center gap-2 text-lg font-semibold text-textMain">
              <SearchCheck className="h-5 w-5 text-primary" />
              历史名字时间线
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm text-textSub sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-surface/60 px-4 py-3">
                <div>当前名字</div>
                <div className="mt-1 text-base font-semibold text-textMain">{history?.currentName || '—'}</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-surface/60 px-4 py-3">
                <div>最近一次记录</div>
                <div className="mt-1 text-base font-semibold text-textMain">{formatTime(history?.currentTime)}</div>
              </div>
            </div>
          </div>

          {!history && !historyLoading && !historyError ? (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-textSub">
                <Clock3 className="h-7 w-7" />
              </div>
              <div className="mt-4 text-lg font-medium text-textMain">输入一个 UID 后在这里查看历史</div>
              <p className="mt-2 text-sm leading-6 text-textSub">
                展示这个 UID 出现过的历史名字、首次出现时间、最近出现时间和采集次数。
              </p>
            </div>
          ) : null}

          {historyLoading ? (
            <div className="py-12 text-center text-textSub">
              <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-primary" />
              <div className="mt-3">正在拉取该 UID 的历史名字...</div>
            </div>
          ) : null}

          {history ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-border/70 bg-surface/40 px-4 py-4 text-sm text-textSub">
                UID：<span className="font-mono text-textMain">{history.uid}</span>
                <span className="mx-2">·</span>
                采集记录 {history.rawRecordCount} 条
                <span className="mx-2">·</span>
                不同名字 {history.distinctNameCount} 个
              </div>

              <div className="space-y-3">
                {history.items.map((item) => (
                  <article
                    key={`${history.uid}-${item.name}`}
                    className={`rounded-2xl border px-4 py-4 ${item.isCurrent
                      ? 'border-primary/30 bg-primary/8'
                      : 'border-border/70 bg-surface/35'
                      }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-semibold text-textMain">{item.name}</h4>
                          {item.isCurrent ? (
                            <span className="rounded-full border border-primary/20 bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary">
                              当前名字
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-textSub">
                          共采集到 {item.seenCount} 次
                        </div>
                      </div>
                      <div className="grid gap-2 text-sm text-textSub sm:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                          <div className="text-xs uppercase tracking-[0.16em]">首次出现</div>
                          <div className="mt-1 text-textMain">{formatTime(item.firstSeenAt)}</div>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                          <div className="text-xs uppercase tracking-[0.16em]">最近出现</div>
                          <div className="mt-1 text-textMain">{formatTime(item.lastSeenAt)}</div>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
