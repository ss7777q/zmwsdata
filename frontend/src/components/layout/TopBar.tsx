import { Database, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { VisitorStatsResponse } from '../../lib/api';

interface Props {
  onMenuClick: () => void;
  currentLabel: string;
  showDataCount: boolean;
  showSearch?: boolean;
  searchValue: string;
  searchDisabled?: boolean;
  onSearchChange: (value: string) => void;
  visitorStats?: VisitorStatsResponse | null;
}

const THEME_STORAGE_KEY = 'theme';
type ThemeMode = 'dark' | 'light';

function readSavedTheme(): ThemeMode | null {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch {
    return null;
  }
}

function prefersDarkTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function getInitialDarkMode() {
  if (typeof window === 'undefined') return true;
  const saved = readSavedTheme();
  if (saved) return saved === 'dark';
  return document.documentElement.classList.contains('dark') || prefersDarkTheme();
}

export default function TopBar({
  onMenuClick,
  currentLabel,
  showDataCount,
  showSearch = true,
  searchValue,
  searchDisabled = false,
  onSearchChange,
  visitorStats,
}: Props) {
  const [isDarkMode, setIsDarkMode] = useState(getInitialDarkMode);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
    } catch {}
  }, [isDarkMode]);

  const searchPlaceholder = useMemo(() => {
    if (searchDisabled) {
      return '当前模块不支持搜索';
    }

    return `搜索 ${currentLabel} 数据...`;
  }, [currentLabel, searchDisabled]);

  return (
    <header className="bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 lg:px-8 lg:py-0 lg:h-16 z-30 transition-colors duration-300">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 lg:h-full lg:flex-nowrap">
        <div className="order-1 flex items-center gap-4 min-w-0 flex-1 lg:flex-none">
          <button
            className="icon-button p-2 -ml-2 rounded-lg text-textSub hover:bg-surface lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0 flex-1 sm:flex-none">
            <div className="text-xs sm:text-sm text-textSub">当前模块</div>
            <div className="text-base font-semibold text-textMain truncate">{currentLabel}</div>
          </div>
        </div>

        {showSearch ? (
          <div className="order-3 basis-full min-w-0 sm:basis-auto sm:flex-1 sm:max-w-[36rem] lg:order-2 lg:mx-6 lg:max-w-[32rem] xl:max-w-[40rem]">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-textSub absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                disabled={searchDisabled}
                placeholder={searchPlaceholder}
                className="input w-full pl-10 pr-10 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              />
              {searchValue ? (
                <button
                  onClick={() => onSearchChange('')}
                  className="icon-button absolute right-3 top-1/2 -translate-y-1/2 text-textSub hover:text-textMain"
                  title="清空搜索"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="order-2 flex items-center gap-4 sm:gap-6 shrink-0 ml-auto lg:order-3 lg:ml-0">
          {visitorStats ? (
            <div className="hidden xl:flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs text-textSub shadow-sm backdrop-blur-sm">
              <span>在线 {visitorStats.onlineVisitors}</span>
              <span className="text-border">/</span>
              <span>今日 {visitorStats.todayVisitors}</span>
              <span className="text-border">/</span>
              <span>总计 {visitorStats.totalVisitors}</span>
              <span className="text-border">/</span>
              <span>人次 {visitorStats.totalVisits}</span>
            </div>
          ) : null}

          {showDataCount ? (
            <div className="hidden md:flex items-center gap-2 text-sm">
              <Database className="w-4 h-4 text-cta" />
              <span className="text-textSub hidden lg:inline">已加载数据源</span>
            </div>
          ) : null}

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="icon-button p-2 rounded-full hover:bg-surface text-textSub hover:text-primary cursor-pointer"
            title="切换白天/夜间模式"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </header>
  );
}
