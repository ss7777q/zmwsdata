import { Box, CircleHelp, ChevronLeft, ChevronRight, Dog, Flame, Search, ServerCog, Shield, Skull, Star, Trophy, User, Zap } from 'lucide-react';
import { clsx } from 'clsx';

interface SideNavProps {
  currentSystem: string;
  onSelectSystem: (system: string) => void;
  showOps: boolean;
  compactHeader?: boolean;
  isSidebarCollapsed: boolean;
  onToggleCollapse: () => void;
}

const menuItems = [
  { id: 'role_wiki', label: '角色技能', icon: Flame },
  { id: 'role_equip', label: '角色装备', icon: User },
  { id: 'role_spiritual', label: '灵宝系统', icon: Zap },
  { id: 'role_fashion', label: '角色时装', icon: Star },
  { id: 'role_wing', label: '翅膀系统', icon: Box },
  { id: 'role_cultivate', label: '修炼系统', icon: User },
  { id: 'pet', label: '宠物系统', icon: Dog },
  { id: 'beast_stats', label: '万兽统计', icon: Trophy },
  { id: 'ride', label: '坐骑系统', icon: Box },
  { id: 'call_god', label: '神魔相关', icon: Flame },
  { id: 'boss', label: 'BOSS 属性', icon: Skull },
  { id: 'resist', label: '抗值标准', icon: Shield },
  { id: 'player_lookup', label: '玩家改名记录', icon: Search },
  { id: 'help', label: '帮助与反馈', icon: CircleHelp },
  { id: 'ops', label: '资源运维', icon: ServerCog },
];

export default function SideNav({
  currentSystem,
  onSelectSystem,
  showOps,
  compactHeader = false,
  isSidebarCollapsed,
  onToggleCollapse,
}: SideNavProps) {
  const visibleItems = showOps ? menuItems : menuItems.filter((item) => item.id !== 'ops');

  return (
    <aside className={clsx('bg-surface border-r border-border flex flex-col transition-all duration-300', compactHeader ? 'h-[calc(100vh-4rem)] w-full' : (isSidebarCollapsed ? 'h-screen w-64 lg:w-20' : 'h-screen w-64 lg:w-64'))}>
      {!compactHeader ? (
        <div className={clsx("h-16 flex items-center border-b border-border transition-all duration-300 justify-between px-6 lg:px-6", isSidebarCollapsed && "lg:justify-center lg:px-2")}>
          <span className={clsx("text-xl font-bold font-mono text-primary flex items-center truncate", isSidebarCollapsed && "lg:hidden")}>
            <span className="truncate">造梦无双资源消耗</span>
          </span>
          <button
            onClick={onToggleCollapse}
            className="hidden lg:block p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-textSub hover:text-textMain cursor-pointer transition-colors shrink-0"
            title={isSidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
      ) : null}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = currentSystem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSystem(item.id)}
              className={clsx(
                'w-full flex items-center rounded-lg text-sm font-medium transition-all duration-200 text-left cursor-pointer',
                isSidebarCollapsed ? 'px-4 py-3 gap-3 lg:p-3 lg:justify-center lg:gap-0' : 'px-4 py-3 gap-3',
                active
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'text-textSub hover:text-textMain hover:bg-black/5 dark:hover:bg-white/5'
              )}
              title={isSidebarCollapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className={clsx("truncate", isSidebarCollapsed && "lg:hidden")}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
