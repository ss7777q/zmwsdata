import { clsx } from 'clsx';
import { Package } from 'lucide-react';

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
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono whitespace-nowrap transition-colors',
      isSoul ? 'bg-primary/10 text-primary border border-primary/30' :
        isCoupon ? 'bg-cta/10 text-cta border border-cta/30' :
          isExp ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30' :
            'bg-surface text-textMain border border-border'
    )}>
      {isSoul || isCoupon || isExp ? null : <Package className="w-3 h-3" />}
      {!hideName ? <span>{name || fallbackName}</span> : null}
      <span className={clsx('opacity-60', hideName ? '' : 'pl-1 border-l border-current ml-1')}>
        ×{typeof count === 'number' ? count.toLocaleString() : (count || 0)}
      </span>
    </div>
  );
}
