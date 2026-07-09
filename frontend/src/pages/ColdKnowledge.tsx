import { useEffect, useMemo, useState, useRef } from 'react';
import { marked } from 'marked';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import { type ColdKnowledgeArticle, type ColdKnowledgeResponse } from '../lib/api';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function protectMath(text: string) {
  const segments: string[] = [];
  const source = text.replace(
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^\n\\$])+(?<!\\)\$)/g,
    (match) => {
      const index = segments.push(match) - 1;
      return `@@COLD_KNOWLEDGE_MATH_${index}@@`;
    }
  );

  return {
    source,
    restore(html: string) {
      return html.replace(/@@COLD_KNOWLEDGE_MATH_(\d+)@@/g, (_match, index) => escapeHtml(segments[Number(index)] ?? ''));
    },
  };
}

function formatMarkdown(text: string, inline = false): string {
  const math = protectMath(text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim());
  const markdownSource = math.source.replace(/(?<=\d)~(?=\d)/g, () => '\\~');
  if (!markdownSource) return '';

  const html = inline
    ? (marked.parseInline(markdownSource, { gfm: true, breaks: false }) as string)
    : (marked.parse(markdownSource, { gfm: true, breaks: false }) as string);
  return math
    .restore(html)
    .replace(/<table>/g, '<div class="markdown-table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

function Markdown({ text, className, inline = false }: { text: string; className?: string; inline?: boolean }) {
  const containerRef = useRef<HTMLSpanElement | HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = formatMarkdown(text, inline);
      try {
        renderMathInElement(containerRef.current, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true },
          ],
          throwOnError: false,
        });
      } catch (e) {
        console.error('KaTeX rendering error:', e);
      }
    }
  }, [inline, text]);

  const Component = inline ? 'span' : 'div';
  return <Component ref={containerRef as never} className={className} />;
}

const ALL_CATEGORY = '全部';

function textMatches(article: ColdKnowledgeArticle, query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return [
    article.title,
    article.category,
    article.summary,
    article.playerQuestion,
    article.playerQuestionMarkdown,
    article.mechanismMarkdown,
    ...article.mechanism,
  ].filter(Boolean).join(' ').toLowerCase().includes(keyword);
}

function BulletList({ items, tone = 'normal' }: { items: string[]; tone?: 'normal' | 'good' | 'warn' }) {
  if (items.length === 0) return null;
  const marker = tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-primary';
  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-3 text-sm leading-7 text-textSub">
          <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${marker}`} />
          <Markdown text={item} className="cold-knowledge-markdown min-w-0 flex-1 break-words" />
        </div>
      ))}
    </div>
  );
}

function hasItems(items: string[]) {
  return items.length > 0;
}

export default function ColdKnowledge({ dataSources }: { dataSources: Record<string, { data?: unknown } | undefined> }) {
  const allArticles = useMemo(() => {
    const payload = dataSources.cold_knowledge as ColdKnowledgeResponse | undefined;
    return Array.isArray(payload?.data) ? payload.data : [];
  }, [dataSources]);
  const categories = useMemo(() => [ALL_CATEGORY, ...Array.from(new Set(allArticles.map((item) => item.category)))], [allArticles]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [activeId, setActiveId] = useState('');
  const articles = useMemo(() => allArticles.filter((article) => {
    if (category !== ALL_CATEGORY && article.category !== category) return false;
    return textMatches(article, query);
  }), [allArticles, category, query]);
  const activeArticle = articles.find((article) => article.id === activeId) || articles[0] || allArticles[0];
  const activeMechanismMarkdown = activeArticle?.mechanismMarkdown?.trim();
  useEffect(() => {
    if (allArticles.length > 0 && !allArticles.some((article) => article.id === activeId)) {
      setActiveId(allArticles[0]?.id ?? '');
    }
  }, [activeId, allArticles]);

  if (allArticles.length === 0) {
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
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
          <label className="text-sm text-textSub"><span className="mb-2 block font-medium">搜索</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="input w-full" placeholder="输入关键字进行搜索..." /></label>
          <label className="text-sm text-textSub"><span className="mb-2 block font-medium">分类</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="input w-full">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <div className="rounded-lg border border-border bg-surface px-3 py-3 text-sm text-textSub">已选 {articles.length} / {allArticles.length}</div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-8rem)] xl:overflow-auto">
          <h2 className="px-2 py-2 text-sm font-semibold text-textMain">文章列表</h2>
          <div className="mobile-scroll-container">
            <div className="mobile-scroll-list-xl custom-scrollbar">
              {articles.map((article) => {
                const selected = article.id === activeArticle?.id;
                return (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => setActiveId(article.id)}
                    className={`mobile-scroll-item-xl rounded-xl border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-surface/45 hover:border-primary/40 hover:bg-surface'
                    }`}
                  >
                    <div className="text-xs font-semibold text-textSub">{article.category}</div>
                    <div className="mt-1.5 text-sm font-semibold leading-6 text-textMain line-clamp-1 xl:line-clamp-none">{article.title}</div>
                    <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-textSub">{article.summary}</div>
                  </button>
                );
              })}
              {articles.length === 0 ? <div className="w-full rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-textSub">没有找到相关的文章</div> : null}
            </div>
            <div className="mobile-scroll-mask-xl" />
          </div>
        </aside>

        <article className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm lg:p-7">
          {!activeArticle ? (
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
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-textSub"><span className="rounded-lg border border-border bg-surface px-2.5 py-1">{activeArticle.category}</span><span className="rounded-lg border border-border bg-surface px-2.5 py-1">{activeArticle.readingMinutes} 分钟</span></div>
              <h2 className="mt-4 text-2xl font-bold leading-tight text-textMain lg:text-3xl">{activeArticle.title}</h2>
              <p className="mt-3 text-sm leading-7 text-textSub"><Markdown text={activeArticle.summary} inline /></p>
              {activeArticle.playerQuestion ? <div className="mt-6 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm leading-7 text-textMain"><span className="font-semibold text-primary">玩家提问：</span><Markdown text={activeArticle.playerQuestionMarkdown || activeArticle.playerQuestion} inline /></div> : null}
              <div className="mt-7 space-y-6">
                {activeMechanismMarkdown ? (
                  <section className="border-t border-border pt-5">
                    <h3 className="mb-4 font-semibold text-textMain">核心机制</h3>
                    <Markdown text={activeMechanismMarkdown} className="cold-knowledge-markdown text-sm" />
                  </section>
                ) : hasItems(activeArticle.mechanism) ? (
                  <section className="border-t border-border pt-5">
                    <h3 className="mb-4 font-semibold text-textMain">核心机制</h3>
                    <BulletList items={activeArticle.mechanism} />
                  </section>
                ) : null}
              </div>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
