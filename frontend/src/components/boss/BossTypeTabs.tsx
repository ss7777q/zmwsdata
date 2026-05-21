import { clsx } from 'clsx';

type BossTypeTab = {
  key: string;
  label: string;
  description: string;
};

interface BossTypeTabsProps {
  tabs: BossTypeTab[];
  activeKey: string;
  onChange: (key: string) => void;
}

export default function BossTypeTabs({ tabs, activeKey, onChange }: BossTypeTabsProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-3">
      <div className="mb-3 text-sm font-medium text-textMain">关卡类型</div>
      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
        {tabs.map((tab) => {
          const active = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={clsx(
                'shrink-0 rounded-xl border px-4 py-2 text-left transition-all',
                active
                  ? 'border-primary bg-primary text-white shadow-md shadow-primary/20'
                  : 'border-border bg-background/60 text-textSub hover:border-primary/40 hover:text-textMain'
              )}
            >
              <div className="text-sm font-semibold">{tab.label}</div>
              <div className={clsx('mt-1 text-xs', active ? 'text-white/80' : 'text-textSub')}>
                {tab.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
