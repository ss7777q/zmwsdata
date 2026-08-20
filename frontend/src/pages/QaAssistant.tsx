import { Copy, LoaderCircle, MessageCircleQuestion, RotateCcw, Send, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { askQuestion, type QaCitation, type QaHistoryMessage } from '../lib/api';
import Markdown from '../components/ui/Markdown';

type Turn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; citations: QaCitation[]; model: string; fallback: boolean };

const SUGGESTIONS = [
  '悟空烈焰闪满级有多少段？',
  '宠物技能升级到满级需要多少宠技要诀？',
  '仙织革开启背包格子的消耗规则是什么？',
  '主线 BOSS 的保护分机制是怎么计算的？',
];

function AnswerText({ content }: { content: string }) {
  return <Markdown text={content} className="cold-knowledge-markdown min-w-0 break-words text-sm leading-7" />;
}

function CitationList({ citations }: { citations: QaCitation[] }) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-textSub">资料引用</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {citations.map((citation) => (
          <div key={`${citation.index}-${citation.source}`} className="min-w-0 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs">
            <div className="truncate font-semibold text-textMain">[{citation.index}] {citation.title}</div>
            <div className="mt-1 truncate font-mono text-[11px] text-textSub">{citation.source}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QaAssistant() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedTurn, setCopiedTurn] = useState<number | null>(null);

  const history = useMemo<QaHistoryMessage[]>(() => turns.map((turn) => ({
    role: turn.role,
    content: turn.content,
  })), [turns]);

  async function submitQuestion(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError('');
    try {
      const response = await askQuestion(trimmed, history);
      setTurns((current) => [
        ...current,
        { role: 'user', content: trimmed },
        {
          role: 'assistant',
          content: response.answer,
          citations: response.citations,
          model: response.model,
          fallback: response.attempts.length > 0,
        },
      ]);
      setQuestion('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '问答请求失败，请稍后再试。');
    } finally {
      setLoading(false);
    }
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submitQuestion();
    }
  }

  async function copyAnswer(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedTurn(index);
      window.setTimeout(() => setCopiedTurn((current) => current === index ? null : current), 1400);
    } catch {
      setError('复制失败，请手动选择答案文本。');
    }
  }

  function clearConversation() {
    setTurns([]);
    setQuestion('');
    setError('');
  }

  return (
    <div className="space-y-6 pb-16">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageCircleQuestion className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold leading-tight text-textMain">问答助手</h1>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">资料增强</span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-textSub">优先从本站技能、养成、关卡和机制资料中检索，再交给模型整理答案。资料不足时会明确标注。</p>
            </div>
          </div>
          {turns.length > 0 ? (
            <button type="button" onClick={clearConversation} className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm">
              <RotateCcw className="h-4 w-4" />
              清空对话
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuestion(suggestion)}
              className="rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-left text-xs leading-5 text-textSub transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-textMain"
            >
              <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-cta" />
              {suggestion}
            </button>
          ))}
        </div>

        <form onSubmit={submitQuestion} className="mt-5">
          <label htmlFor="qa-question" className="mb-2 block text-sm font-medium text-textMain">输入问题</label>
          <textarea
            id="qa-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleQuestionKeyDown}
            rows={4}
            maxLength={1000}
            disabled={loading}
            placeholder="例如：悟空烈焰闪满级有多少段？"
            className="input min-h-32 w-full resize-y leading-7 disabled:cursor-wait disabled:opacity-60"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-textSub">{question.length}/1000 · Ctrl/⌘ + Enter 提交</span>
            <button type="submit" disabled={loading || !question.trim()} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? '检索与回答中' : '提交问题'}
            </button>
          </div>
        </form>

        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm leading-6 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100">
            {error}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        {turns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-16 text-center shadow-sm">
            <MessageCircleQuestion className="mx-auto h-10 w-10 text-textSub" />
            <h2 className="mt-4 text-lg font-semibold text-textMain">还没有提问</h2>
            <p className="mt-2 text-sm leading-6 text-textSub">从上面的示例开始，或直接输入你想确认的游戏数据。</p>
          </div>
        ) : (
          turns.map((turn, index) => (
            <article key={`${turn.role}-${index}`} className={turn.role === 'user' ? 'ml-auto max-w-3xl rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4 shadow-sm' : 'rounded-2xl border border-border bg-card px-5 py-5 shadow-sm lg:px-7'}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-textSub">{turn.role === 'user' ? '你的问题' : '资料回答'}</div>
                {turn.role === 'assistant' ? (
                  <button type="button" onClick={() => void copyAnswer(turn.content, index)} className="icon-button inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-textSub hover:bg-surface hover:text-textMain" title="复制答案">
                    <Copy className="h-3.5 w-3.5" />
                    {copiedTurn === index ? '已复制' : '复制'}
                  </button>
                ) : null}
              </div>
              <AnswerText content={turn.content} />
              {turn.role === 'assistant' ? (
                <>
                  <CitationList citations={turn.citations} />
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-textSub">
                    <span className="rounded-md border border-border bg-surface px-2 py-1">模型：{turn.model}</span>
                    {turn.fallback ? <span className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">已自动切换备用模型</span> : null}
                  </div>
                </>
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
