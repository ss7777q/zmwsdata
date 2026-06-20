import { useEffect, useMemo, useState } from 'react';
import { fetchColdKnowledge, type ColdKnowledgeArticle, type ColdKnowledgeDifficulty } from '../lib/api';

type DifficultyFilter = '全部' | ColdKnowledgeDifficulty;

const ALL_CATEGORY = '全部';
const difficultyOptions: DifficultyFilter[] = ['全部', '入门', '进阶'];

function textMatches(article: ColdKnowledgeArticle, query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return [article.title, article.category, article.difficulty, article.summary, article.playerQuestion, article.playerTip, ...article.quickAnswer, ...article.misconceptions, ...article.mechanism].join(' ').toLowerCase().includes(keyword);
}

function BulletList({ items, tone = 'normal' }: { items: string[]; tone?: 'normal' | 'good' | 'warn' }) {
  if (items.length === 0) return null;
  const marker = tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <p key={item} className="flex gap-3 text-sm leading-7 text-textSub">
          <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${marker}`} />
          <span className="break-words">{item}</span>
        </p>
      ))}
    </div>
  );
}

function hasItems(items: string[]) {
  return items.length > 0;
}

export default function ColdKnowledge() {
  const [allArticles, setAllArticles] = useState<ColdKnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const categories = useMemo(() => [ALL_CATEGORY, ...Array.from(new Set(allArticles.map((item) => item.category)))], [allArticles]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('全部');
  const [activeId, setActiveId] = useState('');
  const articles = useMemo(() => allArticles.filter((article) => {
    if (category !== ALL_CATEGORY && article.category !== category) return false;
    if (difficulty !== '全部' && article.difficulty !== difficulty) return false;
    return textMatches(article, query);
  }), [allArticles, category, difficulty, query]);
  const activeArticle = articles.find((article) => article.id === activeId) || articles[0] || allArticles[0];

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    fetchColdKnowledge(controller.signal)
      .then((response) => {
        setAllArticles(response.data);
        setActiveId(response.data[0]?.id ?? '');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);
  if (!loading && !loadError && allArticles.length === 0) {
    return (
      <div className="card text-center py-20 border border-dashed border-border bg-card shadow-sm rounded-2xl flex flex-col items-center justify-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface text-textSub">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-textMain">暂无冷知识机制数据</h3>
        <p className="mt-2 text-xs text-textSub max-w-sm leading-5">机制分析报告正在整理中，请耐心等待后续版本更新。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:p-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto] md:items-end">
          <label className="text-sm text-textSub"><span className="mb-2 block font-medium">搜索</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="input w-full" placeholder="输入关键字进行搜索..." /></label>
          <label className="text-sm text-textSub"><span className="mb-2 block font-medium">分类</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="input w-full">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-sm text-textSub"><span className="mb-2 block font-medium">难度</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as DifficultyFilter)} className="input w-full">{difficultyOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <div className="rounded-lg border border-border bg-surface px-3 py-3 text-sm text-textSub">已选 {articles.length} / {allArticles.length}</div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-8rem)] xl:overflow-auto">
          <h2 className="px-2 py-2 text-sm font-semibold text-textMain">文章列表</h2>
          <div className="space-y-2">
            {articles.map((article) => {
              const selected = article.id === activeArticle?.id;
              return (
                <button key={article.id} type="button" onClick={() => setActiveId(article.id)} className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border bg-surface/45 hover:border-primary/40 hover:bg-surface'}`}>
                  <div className="flex items-center justify-between gap-3 text-xs text-textSub"><span>{article.category}</span><span>{article.difficulty}</span></div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-textMain">{article.title}</div>
                  <div className="mt-2 line-clamp-2 text-xs leading-5 text-textSub">{article.summary}</div>
                </button>
              );
            })}
            {articles.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-textSub">没有找到相关的文章</div> : null}
          </div>
        </aside>

        <article className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm lg:p-7">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <h3 className="text-base font-semibold text-textMain">正在加载冷知识机制数据</h3>
              <p className="mt-1 max-w-xs text-xs leading-5 text-textSub">正在读取 Markdown 文章内容。</p>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <h3 className="text-base font-semibold text-textMain">冷知识机制数据加载失败</h3>
              <p className="mt-1 max-w-md text-xs leading-5 text-textSub">{loadError}</p>
            </div>
          ) : !activeArticle ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-surface text-textSub">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-textMain">没有找到匹配的冷知识数据</h3>
              <p className="mt-1 text-xs text-textSub max-w-xs leading-5">请尝试清理搜索关键词或重置筛选条件。</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-textSub"><span className="rounded-lg border border-border bg-surface px-2.5 py-1">{activeArticle.category}</span><span className="rounded-lg border border-border bg-surface px-2.5 py-1">{activeArticle.difficulty}</span><span className="rounded-lg border border-border bg-surface px-2.5 py-1">{activeArticle.readingMinutes} 分钟</span></div>
              <h2 className="mt-4 text-2xl font-bold leading-tight text-textMain lg:text-3xl">{activeArticle.title}</h2>
              <p className="mt-3 text-sm leading-7 text-textSub">{activeArticle.summary}</p>
              {activeArticle.playerQuestion ? <div className="mt-6 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm leading-7 text-textMain"><span className="font-semibold text-primary">玩家提问：</span>{activeArticle.playerQuestion}</div> : null}
              <div className="mt-7 space-y-6">
                {hasItems(activeArticle.quickAnswer) ? <section className="border-t border-border pt-5"><h3 className="mb-4 font-semibold text-textMain">快捷回答</h3><BulletList items={activeArticle.quickAnswer} tone="good" /></section> : null}
                {hasItems(activeArticle.misconceptions) ? <section className="border-t border-border pt-5"><h3 className="mb-4 font-semibold text-textMain">常见误解</h3><BulletList items={activeArticle.misconceptions} tone="warn" /></section> : null}
                {hasItems(activeArticle.mechanism) ? <section className="border-t border-border pt-5"><h3 className="mb-4 font-semibold text-textMain">核心机制</h3><BulletList items={activeArticle.mechanism} /></section> : null}
                {activeArticle.playerTip ? <section className="border-t border-border pt-5"><h3 className="mb-4 font-semibold text-textMain">实战建议</h3><div className="rounded-xl border border-cta/25 bg-cta/10 px-4 py-3 text-sm leading-7 text-textMain">{activeArticle.playerTip}</div></section> : null}
                {hasItems(activeArticle.sourceExcerpt) ? <section className="border-t border-border pt-5"><h3 className="mb-4 font-semibold text-textMain">报告原文</h3><div className="space-y-3">{activeArticle.sourceExcerpt.map((excerpt) => <blockquote key={excerpt} className="border-l-4 border-border bg-surface px-4 py-3 text-sm leading-7 text-textSub">{excerpt}</blockquote>)}</div>{activeArticle.sourceFile ? <p className="mt-3 text-xs text-textSub">数据来源：{activeArticle.sourceFile}</p> : null}</section> : null}
              </div>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
