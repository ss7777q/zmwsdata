import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SideNav from './components/layout/SideNav';
import TopBar from './components/layout/TopBar';
import SearchResults from './components/ui/SearchResults';
import { useGameData } from './hooks/useGameData';
import { useVisitorStats } from './hooks/useVisitorStats';
import { searchDataSources } from './lib/search';
import { apiUrl } from './lib/api';

const RoleEquip = lazy(() => import('./pages/RoleEquip'));
const RoleSpiritual = lazy(() => import('./pages/RoleSpiritual'));
const RoleWing = lazy(() => import('./pages/RoleWing'));
const RoleCultivate = lazy(() => import('./pages/RoleCultivate'));
const RolePet = lazy(() => import('./pages/RolePet'));
const RoleRide = lazy(() => import('./pages/RoleRide'));
const RoleFashion = lazy(() => import('./pages/RoleFashion'));
const BossStats = lazy(() => import('./pages/BossStats'));
const CallGodStats = lazy(() => import('./pages/CallGodStats'));
const ResistStats = lazy(() => import('./pages/ResistStats'));
const PlayerLookup = lazy(() => import('./pages/PlayerLookup'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const OpsDashboard = lazy(() => import('./pages/OpsDashboard'));
const BeastStats = lazy(() => import('./pages/BeastStats'));
const RoleWiki = lazy(() => import('./pages/RoleWiki'));

const SYSTEM_META: Record<string, { title: string; description: string }> = {
  role_wiki: { title: '角色技能', description: '查看角色各技能的伤害、段数、释放时间与等级成长。' },
  role_equip: { title: '角色装备', description: '查看装备打造、升级、熔炼等展示数据。' },
  role_spiritual: { title: '灵宝系统', description: '聚合法宝、神器与阵法等产出数据。' },
  role_fashion: { title: '角色时装', description: '展示时装与时装球养成配置。' },
  role_wing: { title: '翅膀系统', description: '查看翅膀培养与羽毛相关配置。' },
  role_cultivate: { title: '修炼系统', description: '聚合经脉、修心、丹气、丹元与仙魄配置。' },
  pet: { title: '宠物系统', description: '查看宠物技能、装备与升星数据。' },
  beast_stats: { title: '万兽统计', description: '查看赛季冠军详情、阵容趋势与兽王玩家统计。' },
  ride: { title: '坐骑系统', description: '查看坐骑技能、装备与升星数据。' },
  call_god: { title: '神魔属性/神石获取', description: '查看神魔模板属性、倍率规则与最终属性预览。' },
  boss: { title: 'BOSS 属性', description: '按关卡 Type 分类展示各关卡 Boss 的属性数据。' },
  resist: { title: '抗值标准', description: '查看 exp.json 中的防御抗值和通用抗值标准值。' },
  player_lookup: { title: '玩家改名记录', description: '按 UID 查看历史名字记录。' },
  help: { title: '帮助与反馈', description: '了解网站用途、模块说明和使用方式，也可以直接提交建议反馈。' },
  ops: { title: '资源运维', description: '仅在使用专用启动命令后开放，用于手动同步资源、更新数据与查看日志。' },
};

const DEFAULT_SYSTEM = 'role_equip';
const SYSTEM_PATHS: Record<string, string> = {
  role_wiki: '/role_wiki',
  role_equip: '/user_equip',
  role_spiritual: '/user_spiritual',
  role_fashion: '/user_fashion',
  role_wing: '/user_wing',
  role_cultivate: '/user_cultivate',
  pet: '/pet',
  beast_stats: '/pet_champion',
  ride: '/ride',
  call_god: '/call_god',
  boss: '/boss',
  resist: '/resist',
  player_lookup: '/player_lookup',
  help: '/help',
};
const OPS_ROUTE_PATH = '/ops';
const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  '/beast_stats': '/pet_champion',
};
const PATH_TO_SYSTEM = Object.fromEntries(Object.entries(SYSTEM_PATHS).map(([system, routePath]) => [routePath, system]));
const OPS_SYSTEM = 'ops';
const PLAYER_LOOKUP_SYSTEM = 'player_lookup';
const HELP_SYSTEM = 'help';
const NO_DATA_SYSTEMS = [OPS_SYSTEM, PLAYER_LOOKUP_SYSTEM, HELP_SYSTEM] as const;
const KNOWN_SYSTEMS = ['role_wiki', 'role_equip', 'role_spiritual', 'role_wing', 'role_cultivate', 'pet', 'beast_stats', 'ride', 'role_fashion', 'call_god', 'boss', 'resist', 'player_lookup', 'help', 'ops'] as const;

function resolveSystemFromPath(pathname: string) {
  if (pathname === OPS_ROUTE_PATH) return OPS_SYSTEM;
  const redirectTarget = LEGACY_ROUTE_REDIRECTS[pathname];
  return PATH_TO_SYSTEM[redirectTarget || pathname] || DEFAULT_SYSTEM;
}

function PageFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-cta rounded-full animate-spin"></div>
      <div className="mt-4 text-textSub font-mono animate-pulse">Loading System View...</div>
    </div>
  );
}

const WATERMARK_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' opacity='0.1' viewBox='0 0 400 300'%3E%3Ctext x='50%25' y='50%25' transform='rotate(-30 200 150)' font-family='system-ui, sans-serif' font-size='24' font-weight='bold' fill='%23888888' text-anchor='middle' dominant-baseline='middle'%3Edata.zmwsrank.top%3C/text%3E%3C/svg%3E`;

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentSystem, setCurrentSystem] = useState(() => resolveSystemFromPath(location.pathname));
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showOps, setShowOps] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const activeSystem = !showOps && currentSystem === OPS_SYSTEM ? DEFAULT_SYSTEM : currentSystem;
  const shouldLoadGameData = !NO_DATA_SYSTEMS.includes(activeSystem as typeof NO_DATA_SYSTEMS[number]);
  const supportsGlobalSearch = ['role_equip', 'role_fashion', 'boss'].includes(activeSystem);
  const shouldShowSearchBar = shouldLoadGameData && supportsGlobalSearch;
  const { dataSources, loading } = useGameData(activeSystem, shouldLoadGameData);
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

    const matchedSystem = PATH_TO_SYSTEM[location.pathname];
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
    if (location.pathname === '/' || location.pathname === '') {
      navigate(expectedPath, { replace: true });
      return;
    }
    if (location.pathname !== expectedPath && PATH_TO_SYSTEM[location.pathname] == null) {
      navigate(expectedPath, { replace: true });
    }
  }, [activeSystem, location.pathname, navigate]);

  return (
    <div className="min-h-screen bg-background flex">
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

      <div className={`fixed lg:sticky top-0 h-screen z-50 transform transition-transform duration-300 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} shrink-0 w-64`}>
        <SideNav
          currentSystem={activeSystem}
          showOps={showOps}
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

        <div className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm leading-relaxed text-amber-900 lg:px-8 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">技能数值为测试性功能</span>
            <span className="text-amber-700/70 dark:text-amber-200/60">|</span>
            <span>当前仍有大量未调整内容，仅供临时核对。网站建议/反馈QQ群：681321644。</span>
          </div>
        </div>

        <main className="flex-1 overflow-x-hidden p-4 lg:p-8 relative scroll-smooth min-h-0">
          <div className="max-w-[1600px] mx-auto pb-12">
            {activeSystem !== 'beast_stats' ? (
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold font-sans text-textMain">{currentMeta.title}</h1>
                </div>
              </div>
            ) : null}

            {loading && shouldLoadGameData && activeSystem !== 'call_god' ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-primary/20 border-t-cta rounded-full animate-spin"></div>
                <div className="mt-4 text-textSub font-mono animate-pulse">Loading Game JSON Data...</div>
              </div>
            ) : isSearching ? (
              <SearchResults
                currentLabel={currentMeta.title}
                query={searchQuery.trim()}
                results={searchResults}
              />
            ) : (
              <>
                <Suspense fallback={<PageFallback />}>
                  {activeSystem === 'role_wiki' && <RoleWiki dataSources={dataSources} />}
                  {activeSystem === 'role_equip' && <RoleEquip dataSources={dataSources} />}
                  {activeSystem === 'role_spiritual' && <RoleSpiritual dataSources={dataSources} />}
                  {activeSystem === 'role_wing' && <RoleWing dataSources={dataSources} />}
                  {activeSystem === 'role_cultivate' && <RoleCultivate dataSources={dataSources} loading={loading} />}
                  {activeSystem === 'pet' && <RolePet dataSources={dataSources} />}
                  {activeSystem === 'beast_stats' && <BeastStats detailSource={dataSources.beast_detail?.data as any} lineupSource={dataSources.beast_lineup_analysis?.data as any} playerSource={dataSources.beast_player_analysis?.data as any} loading={loading} />}
                  {activeSystem === 'ride' && <RoleRide dataSources={dataSources} />}
                  {activeSystem === 'role_fashion' && <RoleFashion dataSources={dataSources} />}
                  {activeSystem === 'call_god' && <CallGodStats dataSources={dataSources} />}
                  {activeSystem === 'boss' && <BossStats dataSources={dataSources} searchQuery={searchQuery} />}
                  {activeSystem === 'resist' && <ResistStats dataSources={dataSources} />}
                  {activeSystem === PLAYER_LOOKUP_SYSTEM && <PlayerLookup />}
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
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
