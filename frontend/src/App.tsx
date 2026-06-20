import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SideNav from './components/layout/SideNav';
import TopBar from './components/layout/TopBar';
import SearchResults from './components/ui/SearchResults';
import LoadingSpinner from './components/ui/LoadingSpinner';
import { useGameData } from './hooks/useGameData';
import { useVisitorStats } from './hooks/useVisitorStats';
import { searchDataSources } from './lib/search';
import { apiUrl } from './lib/api';

const RoleWiki = lazy(() => import('./pages/RoleWiki'));
const RoleEquip = lazy(() => import('./pages/RoleEquip'));
const RoleSpiritual = lazy(() => import('./pages/RoleSpiritual'));
const RoleStarStone = lazy(() => import('./pages/RoleStarStone'));
const RoleWing = lazy(() => import('./pages/RoleWing'));
const RoleCultivate = lazy(() => import('./pages/RoleCultivate'));
const RolePet = lazy(() => import('./pages/RolePet'));
const RoleRide = lazy(() => import('./pages/RoleRide'));
const RoleFashion = lazy(() => import('./pages/RoleFashion'));
const RoleHonor = lazy(() => import('./pages/RoleHonor'));
const RoleExtremeStats = lazy(() => import('./pages/RoleExtremeStats'));
const BossStats = lazy(() => import('./pages/BossStats'));
const CallGodStats = lazy(() => import('./pages/CallGodStats'));
const RogueItems = lazy(() => import('./pages/RogueItems'));
const ResistStats = lazy(() => import('./pages/ResistStats'));
const PlayerLookup = lazy(() => import('./pages/PlayerLookup'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const OpsDashboard = lazy(() => import('./pages/OpsDashboard'));
const BeastStats = lazy(() => import('./pages/BeastStats'));
const ColdKnowledge = lazy(() => import('./pages/ColdKnowledge'));

const SYSTEM_META: Record<string, { title: string; description: string }> = {
  role_wiki: { title: '角色技能', description: '查看角色各技能的伤害、段数、释放时间与等级成长。' },
  role_equip: { title: '角色装备', description: '查看装备打造、升级、熔炼等展示数据。' },
  role_spiritual: { title: '灵宝系统', description: '聚合法宝、神器与阵法等产出数据。' },
  role_starstone: { title: '星石系统', description: '查看星石词条属性、极效解锁等级与等级模拟。' },
  role_fashion: { title: '角色时装', description: '展示时装与时装球养成配置。' },
  role_honor: { title: '称号系统', description: '查看称号升级需求与称号附带属性。' },
  role_extreme_stats: { title: '极限属性', description: '按模块拆分各阶段满配属性、最高战力点与未完成链路。' },
  role_wing: { title: '翅膀系统', description: '查看翅膀培养与羽毛相关配置。' },
  role_cultivate: { title: '修炼系统', description: '聚合经脉、修心、丹气、丹元与仙魄配置。' },
  pet: { title: '宠物系统', description: '查看宠物技能、装备与升星数据。' },
  beast_stats: { title: '万兽统计', description: '查看赛季冠军详情、阵容趋势与兽王玩家统计。' },
  ride: { title: '坐骑系统', description: '查看坐骑技能、装备与升星数据。' },
  call_god: { title: '神魔属性/神石获取', description: '查看神魔模板属性、倍率规则与最终属性预览。' },
  rogue_item: { title: '局内道具', description: '聚合局内道具阶段配置与已验证的人话机制说明。' },
  boss: { title: 'BOSS 属性', description: '按关卡 Type 分类展示各关卡 Boss 的属性数据。' },
  resist: { title: '抗值标准', description: '查看 exp.json 中的防御抗值和通用抗值标准值。' },
  player_lookup: { title: '玩家改名记录', description: '按 UID 查看历史名字记录。' },
  cold_knowledge: { title: '冷知识', description: '把底层机制报告整理成玩家能直接理解的机制文章。' },
  help: { title: '帮助与反馈', description: '了解网站用途、模块说明和使用方式，也可以直接提交建议反馈。' },
  ops: { title: '资源运维', description: '仅在使用专用启动命令后开放，用于手动同步资源、更新数据与查看日志。' },
};

function NoticeBanner() {
  return (
    <div className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm leading-relaxed text-amber-900 lg:px-8 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">数值效果为测试性功能，甚至可能存在错误</span>
        <span className="text-amber-700/70 dark:text-amber-200/60">|</span>
        <span>当前仍有大量未完成调整内容，仅供参考。如遇问题或有任何建言，欢迎加入交流反馈QQ群：681321644。</span>
      </div>
    </div>
  );
}

const DEFAULT_SYSTEM = 'role_wiki';
const SYSTEM_PATHS: Record<string, string> = {
  role_wiki: '/role_wiki',
  role_equip: '/user_equip',
  role_spiritual: '/user_spiritual',
  role_starstone: '/user_starstone',
  role_fashion: '/user_fashion',
  role_honor: '/title',
  role_extreme_stats: '/extreme_stats',
  role_wing: '/user_wing',
  role_cultivate: '/user_cultivate',
  pet: '/pet',
  beast_stats: '/pet_champion',
  ride: '/ride',
  call_god: '/call_god',
  rogue_item: '/rogue_item',
  boss: '/boss',
  resist: '/resist',
  player_lookup: '/player_lookup',
  cold_knowledge: '/cold_knowledge',
  help: '/help',
};
const OPS_ROUTE_PATH = '/ops';
const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  '/beast_stats': '/pet_champion',
};
const PATH_TO_SYSTEM = Object.fromEntries(Object.entries(SYSTEM_PATHS).map(([system, routePath]) => [routePath, system]));
const OPS_SYSTEM = 'ops';
const EXTREME_STATS_SYSTEM = 'role_extreme_stats';
const PLAYER_LOOKUP_SYSTEM = 'player_lookup';
const HELP_SYSTEM = 'help';
const COLD_KNOWLEDGE_SYSTEM = 'cold_knowledge';
const NO_DATA_SYSTEMS = [OPS_SYSTEM, PLAYER_LOOKUP_SYSTEM, HELP_SYSTEM, COLD_KNOWLEDGE_SYSTEM] as const;
const KNOWN_SYSTEMS = ['role_wiki', 'role_equip', 'role_spiritual', 'role_starstone', 'role_wing', 'role_cultivate', 'pet', 'beast_stats', 'ride', 'role_fashion', 'role_honor', 'role_extreme_stats', 'call_god', 'rogue_item', 'boss', 'resist', 'player_lookup', 'cold_knowledge', 'help', 'ops'] as const;

function PageFallback() {
  return <LoadingSpinner message="正在载入系统视图..." />;
}

const WATERMARK_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' opacity='0.1' viewBox='0 0 400 300'%3E%3Ctext x='50%25' y='50%25' transform='rotate(-30 200 150)' font-family='system-ui, sans-serif' font-size='24' font-weight='bold' fill='%23888888' text-anchor='middle' dominant-baseline='middle'%3Edata.zmwsrank.top%3C/text%3E%3C/svg%3E`;

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentSystem, setCurrentSystem] = useState(DEFAULT_SYSTEM);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showOps, setShowOps] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 200 && val <= 480) {
          return val;
        }
      }
    } catch {}
    return 256;
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    let currentWidth = startWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      currentWidth = Math.max(200, Math.min(480, startWidth + deltaX));
      setSidebarWidth(currentWidth);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      try {
        localStorage.setItem('sidebar_width', String(currentWidth));
      } catch {}
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };
  const activeSystem = !showOps && currentSystem === OPS_SYSTEM ? DEFAULT_SYSTEM : currentSystem;
  const shouldLoadGameData = !NO_DATA_SYSTEMS.includes(activeSystem as typeof NO_DATA_SYSTEMS[number]);
  const shouldLoadBulkGameData = shouldLoadGameData && activeSystem !== 'role_wiki';
  const supportsGlobalSearch = ['role_equip', 'role_fashion', 'boss'].includes(activeSystem);
  const shouldShowSearchBar = shouldLoadGameData && supportsGlobalSearch;
  const { dataSources, loading } = useGameData(activeSystem, shouldLoadBulkGameData);
  const visitorStats = useVisitorStats();
  const isBossSystem = activeSystem === 'boss';
  const isSearching = shouldLoadGameData && searchQuery.trim().length > 0 && !isBossSystem;

  useEffect(() => {
    if (location.pathname === OPS_ROUTE_PATH) {
      navigate(SYSTEM_PATHS[DEFAULT_SYSTEM], { replace: true });
      return;
    }

    const legacyRedirectTarget = LEGACY_ROUTE_REDIRECTS[location.pathname];
    if (legacyRedirectTarget) {
      navigate(legacyRedirectTarget, { replace: true });
      return;
    }

    const isExtremeStatsPath = location.pathname === SYSTEM_PATHS[EXTREME_STATS_SYSTEM]
      || location.pathname.startsWith(`${SYSTEM_PATHS[EXTREME_STATS_SYSTEM]}/`);
    const matchedSystem = isExtremeStatsPath ? EXTREME_STATS_SYSTEM : PATH_TO_SYSTEM[location.pathname];
    if (matchedSystem && matchedSystem !== currentSystem) {
      setCurrentSystem(matchedSystem);
      return;
    }
    if (!matchedSystem && location.pathname !== '/' && location.pathname !== '') {
      navigate(SYSTEM_PATHS[DEFAULT_SYSTEM], { replace: true });
      return;
    }
    if ((location.pathname === '/' || location.pathname === '') && currentSystem !== DEFAULT_SYSTEM) {
      setCurrentSystem(DEFAULT_SYSTEM);
    }
  }, [currentSystem, location.pathname, navigate]);

  useEffect(() => {
    let disposed = false;

    async function loadHealth() {
      try {
        const response = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Health request failed: ${response.status}`);
        }
        const health = await response.json() as { opsEnabled?: boolean };
        if (disposed) return;
        const enabled = Boolean(health.opsEnabled);
        setShowOps(enabled);
        if (!enabled) {
          setCurrentSystem((previous) => (previous === OPS_SYSTEM ? DEFAULT_SYSTEM : previous));
          if (location.pathname === OPS_ROUTE_PATH) {
            navigate(SYSTEM_PATHS[DEFAULT_SYSTEM], { replace: true });
          }
        }
      } catch {
        if (disposed) return;
        setShowOps(false);
        setCurrentSystem((previous) => (previous === OPS_SYSTEM ? DEFAULT_SYSTEM : previous));
        if (location.pathname === OPS_ROUTE_PATH) {
          navigate(SYSTEM_PATHS[DEFAULT_SYSTEM], { replace: true });
        }
      }
    }

    void loadHealth();
    return () => {
      disposed = true;
    };
  }, [location.pathname, navigate]);

  const currentMeta = useMemo(() => SYSTEM_META[activeSystem] || SYSTEM_META[DEFAULT_SYSTEM], [activeSystem]);
  const searchResults = useMemo(() => searchDataSources(dataSources, searchQuery), [dataSources, searchQuery]);

  const knownSystems: string[] = showOps ? [...KNOWN_SYSTEMS] : KNOWN_SYSTEMS.filter((item) => item !== OPS_SYSTEM);

  useEffect(() => {
    if (activeSystem === OPS_SYSTEM) {
      return;
    }

    const expectedPath = SYSTEM_PATHS[activeSystem] || SYSTEM_PATHS[DEFAULT_SYSTEM];
    const isExpectedNestedPath = activeSystem === EXTREME_STATS_SYSTEM
      && location.pathname.startsWith(`${SYSTEM_PATHS[EXTREME_STATS_SYSTEM]}/`);
    if (location.pathname === '/' || location.pathname === '') {
      navigate(expectedPath, { replace: true });
      return;
    }
    if (!isExpectedNestedPath && location.pathname !== expectedPath && PATH_TO_SYSTEM[location.pathname] == null) {
      navigate(expectedPath, { replace: true });
    }
  }, [activeSystem, location.pathname, navigate]);

  return (
    <div className={`min-h-screen bg-background flex ${isDragging ? 'no-transition' : ''}`}>
      {/* 全局范围静默水印 */}
      <div
        className="fixed inset-0 pointer-events-none z-[9999]"
        style={{ backgroundImage: `url("${WATERMARK_SVG}")`, backgroundRepeat: 'repeat' }}
      />

      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <div
        className={`fixed lg:sticky top-0 h-screen z-50 transform transition-transform duration-300 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} shrink-0 w-64 ${isSidebarCollapsed ? 'lg:w-20 sidebar-collapsed' : 'lg:w-64'} sidebar-resizable`}
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <SideNav
          currentSystem={activeSystem}
          showOps={showOps}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          onSelectSystem={(system) => {
            if (system === OPS_SYSTEM && !showOps) {
              return;
            }
            setCurrentSystem(system);
            setSearchQuery('');
            setIsMobileOpen(false);
            if (system !== OPS_SYSTEM) {
              navigate(SYSTEM_PATHS[system] || SYSTEM_PATHS[DEFAULT_SYSTEM]);
            }
          }}
        />

        {/* 拖拽调整宽度手柄 */}
        {!isSidebarCollapsed && (
          <div
            onPointerDown={handlePointerDown}
            className={`hidden lg:block absolute top-0 -right-1 w-2 h-full cursor-col-resize select-none z-50 transition-colors duration-200 ${
              isDragging
                ? 'bg-primary shadow-[0_0_8px_rgba(99,102,241,0.5)]'
                : 'hover:bg-primary/30'
            }`}
            title="拖动调整侧边栏宽度"
          />
        )}
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <TopBar
          onMenuClick={() => setIsMobileOpen(true)}
          currentLabel={currentMeta.title}
          showDataCount={shouldLoadGameData}
          showSearch={shouldShowSearchBar}
          searchValue={searchQuery}
          searchDisabled={!supportsGlobalSearch}
          onSearchChange={setSearchQuery}
          visitorStats={visitorStats}
        />

        <div className="hidden lg:block">
          <NoticeBanner />
        </div>

        <main className="flex-1 overflow-x-hidden p-4 lg:p-8 relative scroll-smooth min-h-0">
          <div className="block lg:hidden mb-4 -mx-4 -mt-4">
            <NoticeBanner />
          </div>

          <div className="max-w-[1600px] mx-auto pb-12">
            {activeSystem !== 'beast_stats' ? (
              <div key={`${activeSystem}-heading`} className="module-heading mb-6 flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold font-sans text-textMain">{currentMeta.title}</h1>
                </div>
              </div>
            ) : null}

            <section key={`${activeSystem}-${isSearching ? 'search' : 'view'}`} className="module-view">
              {loading && shouldLoadBulkGameData && activeSystem !== 'call_god' ? (
                <LoadingSpinner message="正在载入游戏配置文件..." />
              ) : isSearching ? (
                <SearchResults
                  currentLabel={currentMeta.title}
                  query={searchQuery.trim()}
                  results={searchResults}
                />
              ) : (
                <>
                  <Suspense fallback={<PageFallback />}>
                    {activeSystem === 'role_wiki' && <RoleWiki />}
                    {activeSystem === 'role_equip' && <RoleEquip dataSources={dataSources} />}
                    {activeSystem === 'role_spiritual' && <RoleSpiritual dataSources={dataSources} />}
                    {activeSystem === 'role_starstone' && <RoleStarStone />}
                    {activeSystem === 'role_wing' && <RoleWing dataSources={dataSources} />}
                    {activeSystem === 'role_cultivate' && <RoleCultivate dataSources={dataSources} loading={loading} />}
                    {activeSystem === 'pet' && <RolePet dataSources={dataSources} />}
                    {activeSystem === 'beast_stats' && <BeastStats detailSource={dataSources.beast_detail?.data as any} lineupSource={dataSources.beast_lineup_analysis?.data as any} playerSource={dataSources.beast_player_analysis?.data as any} loading={loading} />}
                    {activeSystem === 'ride' && <RoleRide dataSources={dataSources} />}
                    {activeSystem === 'role_fashion' && <RoleFashion dataSources={dataSources} />}
                    {activeSystem === 'role_honor' && <RoleHonor dataSources={dataSources} />}
                    {activeSystem === EXTREME_STATS_SYSTEM && <RoleExtremeStats dataSources={dataSources} />}
                    {activeSystem === 'call_god' && <CallGodStats dataSources={dataSources} />}
                    {activeSystem === 'rogue_item' && <RogueItems dataSources={dataSources} />}
                    {activeSystem === 'boss' && <BossStats dataSources={dataSources} searchQuery={searchQuery} />}
                    {activeSystem === 'resist' && <ResistStats dataSources={dataSources} />}
                    {activeSystem === PLAYER_LOOKUP_SYSTEM && <PlayerLookup />}
                    {activeSystem === COLD_KNOWLEDGE_SYSTEM && <ColdKnowledge />}
                    {activeSystem === HELP_SYSTEM && <HelpCenter />}
                    {activeSystem === OPS_SYSTEM && <OpsDashboard />}
                  </Suspense>

                  {!knownSystems.includes(activeSystem) && (
                    <div className="card text-center py-20 border border-dashed border-border bg-transparent">
                      <h3 className="text-xl text-textSub font-medium">该模块前端视图组件研发中...</h3>
                      <p className="text-textSub mt-2">可在左侧切回已完成模块查看实际效果。</p>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
