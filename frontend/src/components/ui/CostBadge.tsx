import { clsx } from 'clsx';

interface CostProps {
  itemId: number;
  count: number;
  name?: string;
  hideName?: boolean;
}

export default function CostBadge({ itemId, count, name, hideName = false }: CostProps) {
  const isSoul = itemId === 3;
  const isCoupon = itemId === 2;
  const isExp = itemId === 6 || itemId === 7;
  const fallbackName = isSoul ? '灵魂' : isCoupon ? '点券' : `Item_${itemId}`;

  return (
    <div className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-mono whitespace-nowrap transition-colors border',
      isSoul ? 'bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 border-indigo-500/15 dark:border-indigo-400/20' :
        isCoupon ? 'bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/15 dark:border-amber-400/20' :
          isExp ? 'bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/15 dark:border-emerald-400/20' :
            'bg-slate-500/5 text-slate-700 dark:text-slate-300 border-slate-500/12 dark:border-slate-400/15'
    )}>
      {!hideName ? <span>{name || fallbackName}</span> : null}
      <span className={clsx('opacity-90', hideName ? '' : 'pl-1.5 border-l border-slate-200 dark:border-white/10 ml-1.5')}>
        x{typeof count === 'number' ? count.toLocaleString() : (count || 0)}
      </span>
    </div>
  );
}
