import type { SearchResult } from '../../lib/search';

interface Props {
  currentLabel: string;
  query: string;
  results: SearchResult[];
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!text) return null;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-cta/20 text-cta rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

export default function SearchResults({ currentLabel, query, results }: Props) {
  // 按 category 分组
  const groupedResults = results.reduce((acc, result) => {
    const cat = result.category || '未分类';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <section className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-surface/50 border border-border/60 rounded-2xl p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm text-textSub">当前模块搜索</div>
          <h2 className="text-xl font-semibold text-textMain">
            “<span className="text-cta">{query}</span>” 在 {currentLabel} 中匹配到 {results.length} 个单位
          </h2>
        </div>
        <div className="text-sm text-textSub">
          搜索模块
        </div>
      </div>

      {results.length === 0 ? (
        <div className="card !cursor-default text-center py-14 border border-dashed border-border/80">
          <div className="relative flex items-center justify-center w-12 h-12 mx-auto mb-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-slate-500/10 animate-ping opacity-60"></span>
            <div className="relative inline-flex rounded-full h-8 w-8 bg-slate-500/15 border border-slate-500/30 items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            </div>
          </div>
          <h3 className="mt-4 text-sm font-semibold text-textMain">没有找到相关内容</h3>
          <p className="mt-2 text-xs text-textSub">可以尝试搜索时装名称、所需材料名称（如: 织虹灵线、经验）等关键词。</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedResults).map(([category, catResults]) => (
            <div key={category} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border/40 border-l-2 border-purple-500 pl-2.5">
                <h3 className="text-base font-bold text-textMain tracking-wide">{category}</h3>
                <span className="text-[10px] text-textSub bg-slate-500/[0.06] px-2 py-0.5 rounded-md font-medium">
                  {catResults.length} 项
                </span>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {catResults.map((result) => (
                  <article
                    key={result.id}
                    className="card !cursor-default hover:translate-y-0 hover:shadow-lg border border-border/60 bg-card/90 backdrop-blur-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-textSub/80 font-mono">
                          <span>{result.source}</span>
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-textMain break-words">
                          <Highlight text={result.title} query={query} />
                        </h3>
                        {result.subtitle && (
                          <p className="mt-1 text-xs text-textSub/80 font-medium">
                            <Highlight text={result.subtitle} query={query} />
                          </p>
                        )}
                        {/* 实体核心数据展示 */}
                        {result.details && result.details.length > 0 && (
                          <div className="mt-4 flex flex-col gap-2 bg-slate-500/[0.02] dark:bg-white/[0.01] px-4 py-3 rounded-xl border border-border/40">
                            {result.details.map((detail, dIdx) => (
                              <div key={`${result.id}-d${dIdx}`} className="flex gap-4 text-xs items-start py-1 border-b border-border/20 last:border-0 last:pb-1">
                                <div className="text-textSub/80 shrink-0 min-w-[100px] md:w-32 font-medium whitespace-nowrap">{detail.label}</div>
                                <div className="text-textMain break-words flex-1 font-mono font-medium">
                                  <Highlight text={detail.value} query={query} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      {result.matches.map((match, idx) => (
                        <div key={`${result.id}-m${idx}`} className="rounded-xl border border-border/40 bg-surface/40 px-3 py-2 flex gap-3 text-xs">
                          <div className="text-textSub/70 shrink-0 w-24">[{match.path}]</div>
                          <div className="text-textMain break-all flex-1 font-medium">
                            <Highlight text={match.value} query={query} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
