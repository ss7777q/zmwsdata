import { clsx } from 'clsx';
import type { BossTypeGroup } from '../../lib/boss-stats';

interface BossStatsToolbarProps {
  activeGroup: BossTypeGroup | null;
  levelOverrideMode: 'input' | 'preset';
  supportsLevelOverride: boolean;
  showNotePanel: boolean;
  showToolbarPanel: boolean;
  levelInput: string;
  onLevelInputChange: (value: string) => void;
  presetLevel: number | null;
  onPresetLevelChange: (value: number) => void;
  overrideLevel: number | null;
  levelInputError: string;
}

export default function BossStatsToolbar({
  activeGroup,
  levelOverrideMode,
  supportsLevelOverride,
  showNotePanel,
  showToolbarPanel,
  levelInput,
  onLevelInputChange,
  presetLevel,
  onPresetLevelChange,
  overrideLevel,
  levelInputError,
}: BossStatsToolbarProps) {
  if (!showToolbarPanel) {
    return null;
  }

  const isLeagueBoss = Number(activeGroup?.type) === 33;

  return (
    <div className={clsx(
      'grid gap-4 rounded-2xl border border-border bg-surface/60 p-4',
      showNotePanel ? 'xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]' : 'lg:grid-cols-1'
    )}>
      <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-textMain">
              {levelOverrideMode === 'preset' ? '固定等级档位' : '指定等级重算'}
            </div>
            <div className="mt-1 text-xs leading-5 text-textSub">
              {levelOverrideMode === 'preset'
                ? '当前模块只支持固定等级档位，切换后会统一按该档位展示属性。'
                : isLeagueBoss
                  ? '默认按当前版本满级展示，输入世界等级后仅重算噩梦与挑战属性。'
                  : '默认按解锁等级展示,输入后会按输入等级统一重算属性。'}
            </div>
          </div>
          {supportsLevelOverride && levelOverrideMode === 'preset' ? (
            <div className="flex flex-wrap gap-2">
              {(activeGroup?.levelOptions || []).map((level) => {
                const active = presetLevel === level;
                return (
                  <button
                    key={level}
                    onClick={() => onPresetLevelChange(level)}
                    className={clsx(
                      'rounded-lg border px-3 py-2 text-sm transition-colors',
                      active
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-background/60 text-textMain hover:border-primary/40'
                    )}
                  >
                    {level} 级
                  </button>
                );
              })}
            </div>
          ) : supportsLevelOverride ? (
            <input
              type="number"
              min={activeGroup?.levelRange?.min}
              max={activeGroup?.levelRange?.max}
              step={1}
              value={levelInput}
              onChange={(event) => onLevelInputChange(event.target.value)}
              placeholder={activeGroup?.levelRange?.min != null && activeGroup?.levelRange?.max != null
                ? `支持 ${activeGroup.levelRange.min}-${activeGroup.levelRange.max} 级`
                : '输入等级'}
              className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-textMain outline-none transition focus:border-primary/50"
            />
          ) : (
            <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-textSub">
              当前模块没有等级切换配置。
            </div>
          )}
          <div className="text-xs leading-5 text-textSub">
            {levelOverrideMode === 'preset'
              ? (overrideLevel != null ? `当前按 ${overrideLevel} 级档位展示` : '请选择固定等级档位')
              : (levelInputError || (overrideLevel != null
                ? (levelInput.trim()
                  ? (isLeagueBoss
                    ? `噩梦与挑战当前按 ${overrideLevel} 级重算`
                    : `当前按 ${overrideLevel} 级统一重算`)
                  : `当前默认按 ${overrideLevel} 级展示`)
                : '留空时使用默认等级'))}
          </div>
      </div>

      {showNotePanel ? (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-textMain">说明</div>
            <div className="mt-1 text-xs leading-5 text-textSub">
              说明内容来自当前模块配置。
            </div>
          </div>
          <div className="min-h-[140px] whitespace-pre-wrap rounded-xl border border-border bg-background/60 px-3 py-3 text-sm leading-6 text-textMain">
            {activeGroup?.noteText?.trim() || '暂未配置说明文案。'}
          </div>
        </div>
      ) : null}
    </div>
  );
}
