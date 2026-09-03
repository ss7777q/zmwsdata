import {
  Copy,
  CornerDownRight,
  History,
  LoaderCircle,
  MessageCircleQuestion,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { askQuestion, type QaCitation, type QaHistoryMessage } from '../lib/api';
import Markdown from '../components/ui/Markdown';

export interface QaTurn {
  role: 'user' | 'assistant';
  content: string;
  citations?: QaCitation[];
  model?: string;
  fallback?: boolean;
  timestamp: number;
}

export interface QaSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: QaTurn[];
}

const STORAGE_KEY_SESSIONS = 'zmws_qa_sessions_v1';
const STORAGE_KEY_ACTIVE_ID = 'zmws_qa_active_session_id_v1';

const SUGGESTIONS = [
  '悟空烈焰闪满级有多少段？',
  '宠物技能升级到满级需要多少宠技要诀？',
  '仙织革开启背包格子的消耗规则是什么？',
  '主线 BOSS 的保护分机制是怎么计算的？',
  '235级52000命中打琉璃宫玥伶会出闪避吗？',
  '增免伤修正叠加法与强攻抗性是怎么算的？',
];

const FOLLOW_UP_TEMPLATES = [
  '那满级后的属性与伤害倍率是多少？',
  '升级或者打造需要消耗什么材料？',
  '这个技能有霸体、控制或者抓取效果吗？',
  '在实战副本里具体该怎么操作与搭配？',
];

function formatRelativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  const date = new Date(timestamp);
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${m}月${d}日 ${h}:${min}`;
}

function createNewSession(initialTitle = '新提问'): QaSession {
  const now = Date.now();
  return {
    id: `session_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: initialTitle,
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

function loadStoredSessions(): QaSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (s) => s && typeof s.id === 'string' && Array.isArray(s.turns)
      );
    }
  } catch {
    // Ignore invalid json
  }
  return [];
}

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
  const [sessions, setSessions] = useState<QaSession[]>(() => {
    const stored = loadStoredSessions();
    if (stored.length > 0) return stored;
    return [createNewSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const savedId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    const stored = loadStoredSessions();
    if (savedId && stored.some((s) => s.id === savedId)) return savedId;
    return stored[0]?.id ?? '';
  });

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedTurn, setCopiedTurn] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch {
      // Storage full or quota exceeded
    }
  }, [sessions]);

  // Sync activeSessionId to localStorage
  useEffect(() => {
    if (activeSessionId) {
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeSessionId);
      } catch {
        // Ignore
      }
    }
  }, [activeSessionId]);

  // Ensure an active session always exists
  const currentSession = useMemo(() => {
    const found = sessions.find((s) => s.id === activeSessionId);
    return found ?? sessions[0] ?? null;
  }, [sessions, activeSessionId]);

  // If activeSessionId doesn't match any session, fix it
  useEffect(() => {
    if (sessions.length > 0 && !sessions.some((s) => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const turns = currentSession?.turns ?? [];

  const history = useMemo<QaHistoryMessage[]>(() => {
    return turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));
  }, [turns]);

  function handleCreateNewSession() {
    const newSession = createNewSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setQuestion('');
    setError('');
    setShowHistory(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleSelectSession(id: string) {
    setActiveSessionId(id);
    setError('');
    setShowHistory(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleDeleteSession(id: string, event: MouseEvent) {
    event.stopPropagation();
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fresh = createNewSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  }

  function handleClearAllSessions() {
    if (!window.confirm('确定要清空全部历史提问记录吗？此操作无法撤销。')) return;
    const fresh = createNewSession();
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    setQuestion('');
    setError('');
    setShowHistory(false);
  }

  function handleClearCurrentSession() {
    if (!currentSession) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSession.id ? { ...s, turns: [], title: '新提问', updatedAt: Date.now() } : s
      )
    );
    setQuestion('');
    setError('');
  }

  async function submitQuestion(event?: FormEvent, directQuestion?: string) {
    event?.preventDefault();
    const targetQuestion = (directQuestion ?? question).trim();
    if (!targetQuestion || loading || !currentSession) return;

    setLoading(true);
    setError('');
    const now = Date.now();

    const userTurn: QaTurn = {
      role: 'user',
      content: targetQuestion,
      timestamp: now,
    };

    // If it's the first question, update the session title
    const nextTitle = currentSession.turns.length === 0
      ? targetQuestion.slice(0, 28)
      : currentSession.title;

    try {
      const response = await askQuestion(targetQuestion, history);
      const assistantTurn: QaTurn = {
        role: 'assistant',
        content: response.answer,
        citations: response.citations,
        model: response.model,
        fallback: response.attempts.length > 0,
        timestamp: Date.now(),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSession.id
            ? {
                ...s,
                title: nextTitle,
                updatedAt: Date.now(),
                turns: [...s.turns, userTurn, assistantTurn],
              }
            : s
        )
      );
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
      window.setTimeout(() => setCopiedTurn((current) => (current === index ? null : current)), 1400);
    } catch {
      setError('复制失败，请手动选择答案文本。');
    }
  }

  function triggerFollowUpFocus(prefix?: string) {
    if (prefix) {
      setQuestion((prev) => (prev ? `${prev} ${prefix}` : prefix));
    }
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Filter sessions for the history drawer
  const filteredSessions = useMemo(() => {
    const valid = sessions.filter((s) => s.turns.length > 0);
    if (!historySearch.trim()) return valid;
    const kw = historySearch.trim().toLowerCase();
    return valid.filter(
      (s) =>
        s.title.toLowerCase().includes(kw) ||
        s.turns.some((t) => t.content.toLowerCase().includes(kw))
    );
  }, [sessions, historySearch]);

  const historyCount = sessions.filter((s) => s.turns.length > 0).length;
  const isFollowUpMode = turns.length > 0;

  return (
    <div className="space-y-6 pb-16">
      {/* 顶部主卡片 */}
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
                {isFollowUpMode ? (
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    追问进行中（第 {Math.floor(turns.length / 2) + 1} 轮）
                  </span>
                ) : null}
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-textSub">
                优先从本站技能、养成、抗值标准与战斗机制底表中检索并代入公式计算。支持连续上下文追问，所有提问记录自动缓存在本地。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCreateNewSession}
              className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm"
              title="开启全新提问"
            >
              <Plus className="h-4 w-4" />
              新建提问
            </button>

            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="btn-secondary relative inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm"
              title="查看历史提问记录"
            >
              <History className="h-4 w-4" />
              历史提问
              {historyCount > 0 ? (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  {historyCount}
                </span>
              ) : null}
            </button>

            {turns.length > 0 ? (
              <button
                type="button"
                onClick={handleClearCurrentSession}
                className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs text-textSub hover:text-textMain sm:text-sm"
                title="清空当前会话"
              >
                <RotateCcw className="h-4 w-4" />
                清空本轮
              </button>
            ) : null}
          </div>
        </div>

        {/* 初始推荐问题（仅在新提问时展示） */}
        {turns.length === 0 ? (
          <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setQuestion(suggestion);
                  textareaRef.current?.focus();
                }}
                className="rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-left text-xs leading-5 text-textSub transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-textMain"
              >
                <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-cta" />
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {/* 提问输入表单 */}
        <form onSubmit={submitQuestion} className="mt-5">
          {isFollowUpMode ? (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-primary">
                <CornerDownRight className="h-4 w-4 shrink-0" />
                <span>追问模式已启用：模型将继承本会话前 {Math.floor(turns.length / 2)} 轮上下文继续作答</span>
              </div>
              <button
                type="button"
                onClick={handleCreateNewSession}
                className="text-[11px] text-textSub underline transition-colors hover:text-textMain"
              >
                换个话题（新建提问）
              </button>
            </div>
          ) : (
            <label htmlFor="qa-question" className="mb-2 block text-sm font-medium text-textMain">
              输入问题
            </label>
          )}

          <textarea
            ref={textareaRef}
            id="qa-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleQuestionKeyDown}
            rows={isFollowUpMode ? 3 : 4}
            maxLength={1000}
            disabled={loading}
            placeholder={
              isFollowUpMode
                ? '继续追问此话题...（例如：“那满级后伤害倍率是多少？”、“升级需要消耗什么材料？”）'
                : '例如：235级52000命中打琉璃宫玥伶会出闪避吗？或者悟空烈焰闪满级有多少段？'
            }
            className="input min-h-24 w-full resize-y leading-7 disabled:cursor-wait disabled:opacity-60 sm:min-h-28"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-textSub">
              {question.length}/1000 · Ctrl/⌘ + Enter 快速发送
            </span>
            <div className="flex items-center gap-2">
              {isFollowUpMode ? (
                <button
                  type="button"
                  onClick={handleCreateNewSession}
                  className="btn-secondary px-3 py-2 text-xs"
                >
                  新话题
                </button>
              ) : null}
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : isFollowUpMode ? (
                  <CornerDownRight className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {loading ? '检索与回答中...' : isFollowUpMode ? '发送追问' : '提交问题'}
              </button>
            </div>
          </div>
        </form>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm leading-6 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100"
          >
            {error}
          </div>
        ) : null}
      </section>

      {/* 对话消息流展示区 */}
      <section className="space-y-4">
        {turns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-16 text-center shadow-sm">
            <MessageCircleQuestion className="mx-auto h-10 w-10 text-textSub" />
            <h2 className="mt-4 text-lg font-semibold text-textMain">还没有提问</h2>
            <p className="mt-2 text-sm leading-6 text-textSub">
              从上方的推荐问题开始，或直接输入你想确认的游戏机制、Boss属性与技能数据。
            </p>
          </div>
        ) : (
          turns.map((turn, index) => {
            const isUser = turn.role === 'user';
            const isLatestAssistant = !isUser && index === turns.length - 1;

            return (
              <article
                key={`${turn.role}-${index}-${turn.timestamp}`}
                className={
                  isUser
                    ? 'ml-auto max-w-3xl rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4 shadow-sm'
                    : 'rounded-2xl border border-border bg-card px-5 py-5 shadow-sm lg:px-7'
                }
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-textSub">
                      {isUser ? '你的提问' : '资料回答'}
                    </span>
                    <span className="text-[11px] text-textSub/70">
                      {formatRelativeTime(turn.timestamp)}
                    </span>
                  </div>

                  {!isUser ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => triggerFollowUpFocus()}
                        className="icon-button inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-primary/10"
                        title="针对此回答进行追问"
                      >
                        <CornerDownRight className="h-3.5 w-3.5" />
                        继续追问
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyAnswer(turn.content, index)}
                        className="icon-button inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-textSub hover:bg-surface hover:text-textMain"
                        title="复制答案"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedTurn === index ? '已复制' : '复制'}
                      </button>
                    </div>
                  ) : null}
                </div>

                <AnswerText content={turn.content} />

                {!isUser ? (
                  <>
                    <CitationList citations={turn.citations ?? []} />
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-textSub">
                      <div className="flex flex-wrap items-center gap-2">
                        {turn.model ? (
                          <span className="rounded-md border border-border bg-surface px-2 py-1">
                            模型：{turn.model}
                          </span>
                        ) : null}
                        {turn.fallback ? (
                          <span className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                            已自动切换备用渠道
                          </span>
                        ) : null}
                      </div>

                      {/* 追问提示 */}
                      <span className="text-textSub/70">可在下方输入框直接输入内容进行追问</span>
                    </div>

                    {/* 最新回答底部的智能快捷追问气泡 */}
                    {isLatestAssistant && !loading ? (
                      <div className="mt-4 border-t border-dashed border-border/80 pt-3">
                        <div className="mb-2 text-[11px] font-medium text-textSub">
                          <Sparkles className="mr-1 inline h-3 w-3 text-cta" />
                          快捷追问建议：
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {FOLLOW_UP_TEMPLATES.map((tmpl) => (
                            <button
                              key={tmpl}
                              type="button"
                              onClick={() => {
                                setQuestion(tmpl);
                                textareaRef.current?.focus();
                              }}
                              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-textSub transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-textMain"
                            >
                              {tmpl}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      {/* 历史提问记录侧边抽屉面板 */}
      {showHistory ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity">
          <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-card p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-textMain">我的提问历史</h2>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {historyCount} 条
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="icon-button rounded-lg p-1.5 text-textSub hover:bg-surface hover:text-textMain"
                title="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 搜索历史记录 */}
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-textSub" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="搜索历史提问与回答..."
                className="input h-9 w-full pl-9 pr-8 text-xs"
              />
              {historySearch ? (
                <button
                  type="button"
                  onClick={() => setHistorySearch('')}
                  className="absolute right-2.5 top-2.5 text-textSub hover:text-textMain"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {/* 会话列表 */}
            <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredSessions.length === 0 ? (
                <div className="py-12 text-center text-sm text-textSub">
                  {historySearch ? '没有找到相关的提问记录' : '暂无历史提问记录，所有提问会自动保存'}
                </div>
              ) : (
                filteredSessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const firstTurn = session.turns[0];
                  const firstAnswer = session.turns.find((t) => t.role === 'assistant');
                  const turnsCount = Math.floor(session.turns.length / 2);

                  return (
                    <div
                      key={session.id}
                      onClick={() => handleSelectSession(session.id)}
                      className={`group relative cursor-pointer rounded-xl border p-3 text-left transition-all ${
                        isActive
                          ? 'border-primary/50 bg-primary/5 shadow-xs'
                          : 'border-border bg-surface/50 hover:border-border/80 hover:bg-surface'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-xs font-semibold text-textMain">
                          {session.title || firstTurn?.content || '无标题提问'}
                        </h3>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="shrink-0 p-1 text-textSub opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                          title="删除此条记录"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {firstAnswer ? (
                        <p className="mt-1 line-clamp-1 text-[11px] text-textSub">
                          {firstAnswer.content.replace(/[#*`$\n]/g, ' ').trim()}
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex items-center justify-between text-[10px] text-textSub">
                        <span>{formatRelativeTime(session.updatedAt)}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-surface px-1.5 py-0.5 font-medium">
                            {turnsCount > 1 ? `${turnsCount} 轮追问` : '单轮问答'}
                          </span>
                          {isActive ? (
                            <span className="font-semibold text-primary">当前会话</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 抽屉底部按钮 */}
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <button
                type="button"
                onClick={handleClearAllSessions}
                disabled={historyCount === 0}
                className="inline-flex items-center gap-1 text-xs text-textSub transition-colors hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空全部记录
              </button>

              <button
                type="button"
                onClick={handleCreateNewSession}
                className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                新建提问
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
