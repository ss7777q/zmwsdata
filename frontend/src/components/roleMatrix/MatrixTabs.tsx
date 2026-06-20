import { clsx } from 'clsx';

export function MatrixTabs({ activeTab, onChange }: { activeTab: 'cost' | 'effect'; onChange: (tab: 'cost' | 'effect') => void }) {
  return (
      <div className="flex bg-slate-200/40 dark:bg-black/20 p-1 rounded-xl border border-slate-300/60 dark:border-border/60 w-max mb-6 gap-1 shadow-sm backdrop-blur-sm">
          <button
              onClick={() => onChange('cost')}
              className={clsx(
                  "px-6 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                  activeTab === 'cost'
                      ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                      : "text-slate-500 dark:text-textSub hover:text-slate-800 dark:hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
              )}
          >
              升级消耗
          </button>
          <button
              onClick={() => onChange('effect')}
              className={clsx(
                  "px-6 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer border active:scale-95",
                  activeTab === 'effect'
                      ? "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300/50 dark:border-purple-500/30 shadow-[0_2px_10px_rgba(168,85,247,0.08)]"
                      : "text-slate-500 dark:text-textSub hover:text-slate-800 dark:hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5 border-transparent"
              )}
          >
              阵法效果
          </button>
      </div>
  );
}
