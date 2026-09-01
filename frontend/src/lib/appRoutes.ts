export const DEFAULT_SYSTEM = 'role_wiki';
export const OPS_SYSTEM = 'ops';
export const EXTREME_STATS_SYSTEM = 'role_extreme_stats';
export const PLAYER_LOOKUP_SYSTEM = 'player_lookup';
export const HELP_SYSTEM = 'help';
export const COLD_KNOWLEDGE_SYSTEM = 'cold_knowledge';
export const QA_SYSTEM = 'qa';
export const STAGE_REWARDS_SYSTEM = 'stage_rewards';
export const RESOURCE_ACQUISITION_SYSTEM = 'resource_acquisition';

export const SYSTEM_PATHS: Record<string, string> = {
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
  stage_rewards: '/stage_rewards',
  resource_acquisition: '/resource_acquisition',
  power_requirements: '/power_requirements',
  kunlun: '/kunlun',
  boss: '/boss',
  resist: '/resist',
  player_lookup: '/player_lookup',
  cold_knowledge: '/cold_knowledge',
  qa: '/qa',
  help: '/help',
  ops: '/ops',
};

export const DEFAULT_SYSTEM_PATHS: Record<string, string> = {
  role_wiki: '/role_wiki/wukong',
  role_equip: '/user_equip/make',
  role_spiritual: '/user_spiritual/magic/cost',
  role_starstone: '/user_starstone/effects',
  role_fashion: '/user_fashion/ball',
  role_honor: '/title/list',
  role_extreme_stats: '/extreme_stats',
  role_wing: '/user_wing/upgrade',
  role_cultivate: '/user_cultivate/heart',
  pet: '/pet/skill',
  beast_stats: '/pet_champion/stages',
  ride: '/ride/star',
  call_god: '/call_god/stats',
  rogue_item: '/rogue_item/list',
  stage_rewards: '/stage_rewards/list',
  resource_acquisition: '/resource_acquisition/boxes',
  power_requirements: '/power_requirements/list',
  kunlun: '/kunlun/towers',
  boss: '/boss/mainline',
  resist: '/resist/standard',
  player_lookup: '/player_lookup/search',
  cold_knowledge: '/cold_knowledge/list',
  qa: '/qa',
  help: '/help/index',
  ops: '/ops/dashboard',
};

export const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  '/beast_stats': DEFAULT_SYSTEM_PATHS.beast_stats,
};

const VALID_PATHS: Record<string, string[]> = {
  role_wiki: [
    '/role_wiki/wukong',
    '/role_wiki/tangseng',
    '/role_wiki/shaseng',
    '/role_wiki/bajie',
    '/role_wiki/aoxue',
    '/role_wiki/aolie',
    '/role_wiki/xiaoyan',
    '/role_wiki/xuannv',
    '/role_wiki/yangjian',
    '/role_wiki/skill_extra',
  ],
  role_equip: ['/user_equip/make', '/user_equip/upgrade', '/user_equip/smelt', '/user_equip/stone'],
  role_spiritual: [
    '/user_spiritual/magic/cost',
    '/user_spiritual/magic/effect',
    '/user_spiritual/godweapon/cost',
    '/user_spiritual/godweapon/effect',
    '/user_spiritual/matrix/cost',
    '/user_spiritual/matrix/effect',
  ],
  role_starstone: ['/user_starstone/effects'],
  role_fashion: ['/user_fashion/ball', '/user_fashion/renew'],
  role_honor: ['/title/list'],
  role_wing: ['/user_wing/upgrade', '/user_wing/feather', '/user_wing/skill'],
  role_cultivate: [
    '/user_cultivate/heart',
    '/user_cultivate/inner/danqi',
    '/user_cultivate/inner/danyuan',
    '/user_cultivate/inner/danyuan_effect',
    '/user_cultivate/body',
  ],
  pet: ['/pet/skill', '/pet/wiki', '/pet/star', '/pet/equip', '/pet/godweapon'],
  beast_stats: ['/pet_champion/stages', '/pet_champion/detail', '/pet_champion/lineup', '/pet_champion/players'],
  ride: ['/ride/star', '/ride/skill', '/ride/wiki', '/ride/make', '/ride/upgrade'],
  call_god: ['/call_god/stats', '/call_god/limits', '/call_god/stones', '/call_god/boss', '/call_god/common_skills', '/call_god/talents'],
  rogue_item: ['/rogue_item/list'],
  stage_rewards: ['/stage_rewards/list'],
  resource_acquisition: ['/resource_acquisition/boxes', '/resource_acquisition/secret_shop', '/resource_acquisition/black_market'],
  power_requirements: ['/power_requirements/list'],
  kunlun: ['/kunlun/towers', '/kunlun/stages', '/kunlun/pvp'],
  resist: ['/resist/standard'],
  player_lookup: ['/player_lookup/search'],
  cold_knowledge: ['/cold_knowledge/list'],
  qa: ['/qa'],
  help: ['/help/index'],
  ops: ['/ops/dashboard'],
};

export const ROLE_WIKI_FILE_BY_ROUTE: Record<string, string> = {
  wukong: 'role_wiki_wukong',
  tangseng: 'role_wiki_tangseng',
  shaseng: 'role_wiki_shaseng',
  bajie: 'role_wiki_bajie',
  aoxue: 'role_wiki_aoxue',
  aolie: 'role_wiki_aolie',
  xiaoyan: 'role_wiki_xiaoyan',
  xuannv: 'role_wiki_xuannv',
  yangjian: 'role_wiki_yangjian',
  skill_extra: 'role_wiki_skill_extra',
};

export const BOSS_FILE_BY_ROUTE: Record<string, string> = {
  mainline: 'boss_type_0001_mainline',
  illusion: 'boss_type_0002_illusion',
  arhat_hall: 'boss_type_0004_arhat_hall',
  divine_beast_forest: 'boss_type_0005_divine_beast_forest',
  nightmare: 'boss_type_0006_nightmare',
  pet_ladder: 'boss_type_0008_pet_ladder',
  hidden_cave: 'boss_type_0009_hidden_cave',
  qixi_event: 'boss_type_0018_qixi_event',
  kunlun: 'boss_type_0023_kunlun',
  chaos_gate: 'boss_type_0032_chaos_gate',
  guild_boss: 'boss_type_0033_guild_boss',
  elite_stage: 'boss_type_0037_elite_stage',
  benefit_realm: 'boss_type_0040_benefit_realm',
  zhaoyao_mountain: 'boss_type_0043_zhaoyao_mountain',
  secret_sea_ruins: 'boss_type_0044_secret_sea_ruins',
  seven_star_battlefield: 'boss_type_0045_seven_star_battlefield',
  juezhen_peace: 'boss_type_0101_juezhen_peace',
  juezhen_free: 'boss_type_0102_juezhen_free',
  juezhen_faction: 'boss_type_0103_juezhen_faction',
  juezhen_nightmare: 'boss_type_0104_juezhen_nightmare',
  linglong_tower: 'boss_type_0201_linglong_tower',
  doushuai_palace: 'boss_type_1002_doushuai_palace',
  mobs: 'boss_type_9999_mobs',
};

export const BOSS_ROUTE_BY_FILE = Object.fromEntries(Object.entries(BOSS_FILE_BY_ROUTE).map(([route, file]) => [file, route]));
export const ALL_BOSS_FILES = Object.values(BOSS_FILE_BY_ROUTE);
export const BOSS_INDEX_FILE = 'boss_index';

export function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

export function resolveSystemFromPath(pathname: string) {
  const normalized = normalizePathname(pathname);
  if (normalized === '/') return DEFAULT_SYSTEM;
  const matched = Object.entries(SYSTEM_PATHS)
    .sort(([, left], [, right]) => right.length - left.length)
    .find(([, basePath]) => normalized === basePath || normalized.startsWith(`${basePath}/`));
  return matched?.[0] ?? null;
}

export function normalizeRoutePath(pathname: string, showOps: boolean) {
  const normalized = normalizePathname(pathname);
  if (normalized === '/') return DEFAULT_SYSTEM_PATHS[DEFAULT_SYSTEM];
  const legacy = LEGACY_ROUTE_REDIRECTS[normalized];
  if (legacy) return legacy;

  const system = resolveSystemFromPath(normalized);
  if (!system) return DEFAULT_SYSTEM_PATHS[DEFAULT_SYSTEM];
  if (system === OPS_SYSTEM && !showOps) return DEFAULT_SYSTEM_PATHS[DEFAULT_SYSTEM];

  const basePath = SYSTEM_PATHS[system];
  if (normalized === basePath) return DEFAULT_SYSTEM_PATHS[system];
  if (system === EXTREME_STATS_SYSTEM) return normalized;
  if (system === 'boss') {
    const routeKey = normalized.slice('/boss/'.length);
    if (routeKey === 'all' || routeKey === 'search' || BOSS_FILE_BY_ROUTE[routeKey]) return normalized;
    return DEFAULT_SYSTEM_PATHS.boss;
  }

  const validPaths = VALID_PATHS[system] ?? [];
  return validPaths.includes(normalized) ? normalized : DEFAULT_SYSTEM_PATHS[system];
}

export function isNoDataSystem(system: string) {
  return [OPS_SYSTEM, PLAYER_LOOKUP_SYSTEM, HELP_SYSTEM, QA_SYSTEM].includes(system);
}

export function supportsGlobalSearch(system: string) {
  return ['role_equip', 'role_fashion', 'boss'].includes(system);
}

export function getRequiredDataFiles(system: string, pathname: string, rawSearchQuery: string) {
  const normalized = normalizePathname(pathname);
  const hasSearch = rawSearchQuery.trim().length > 0;

  if (system === 'role_equip' && hasSearch) return ['role_equip_make', 'role_equip_upgrade', 'role_equip_smelt', 'role_equip_stone'];
  if (system === 'role_fashion' && hasSearch) return ['role_fashion_ball', 'role_fashion_renew'];
  if (system === 'boss' && hasSearch) return [BOSS_INDEX_FILE, ...ALL_BOSS_FILES];

  if (system === 'role_wiki') {
    const routeKey = normalized.slice('/role_wiki/'.length);
    return [ROLE_WIKI_FILE_BY_ROUTE[routeKey] || ROLE_WIKI_FILE_BY_ROUTE.wukong].filter(Boolean);
  }

  if (system === 'role_equip') {
    if (normalized.endsWith('/upgrade')) return ['role_equip_upgrade'];
    if (normalized.endsWith('/smelt')) return ['role_equip_smelt'];
    if (normalized.endsWith('/stone')) return ['role_equip_stone'];
    return ['role_equip_make', 'role_equip_upgrade'];
  }
  if (system === 'role_spiritual') {
    if (normalized === '/user_spiritual/magic/effect') return ['role_magic_luck', 'role_magic_effect'];
    if (normalized === '/user_spiritual/godweapon/cost') return ['role_godweapon_unlock', 'role_godweapon_lev'];
    if (normalized === '/user_spiritual/godweapon/effect') return ['role_godweapon_unlock', 'role_godweapon_effect'];
    if (normalized === '/user_spiritual/matrix/cost') return ['role_matrix_skill', 'role_matrix_fq', 'role_matrix_zh'];
    if (normalized === '/user_spiritual/matrix/effect') return ['role_matrix_skill'];
    return ['role_magic_luck', 'role_magic_lev', 'role_magic_soul'];
  }
  if (system === 'role_starstone') return ['role/starstone/index'];
  if (system === 'role_fashion') return normalized.endsWith('/renew') ? ['role_fashion_renew'] : ['role_fashion_ball'];
  if (system === 'role_honor') return ['role_honor'];
  if (system === 'role_extreme_stats') return ['role_extreme_stats_stage_curves'];
  if (system === 'role_wing') {
    if (normalized.endsWith('/feather')) return ['role_feather_advance', 'role_feather_baptize', 'role_feather_luck'];
    if (normalized.endsWith('/skill')) return ['role_wing_upgrade', 'role_wing_skill'];
    return ['role_wing_upgrade'];
  }
  if (system === 'role_cultivate') {
    if (normalized.endsWith('/inner/danqi')) return ['role_danqi'];
    if (normalized.endsWith('/inner/danyuan')) return ['role_danyuan'];
    if (normalized.endsWith('/inner/danyuan_effect')) return ['role_danyuan_effect_index'];
    if (normalized.endsWith('/body')) return ['role_xianpo'];
    return ['role_heart'];
  }
  if (system === 'pet') {
    if (normalized.endsWith('/godweapon')) return ['pet_god_weapon'];
    if (normalized.endsWith('/wiki')) return ['pet/wiki/index'];
    if (normalized.endsWith('/star')) return ['pet_star', 'pet_mating'];
    if (normalized.endsWith('/equip')) return ['pet_equip_make', 'pet_equip_upgrade'];
    return ['pet_skill', 'pet_potential'];
  }
  if (system === 'beast_stats') {
    if (normalized.endsWith('/lineup')) return ['beast_lineup_analysis'];
    if (normalized.endsWith('/players')) return ['beast_detail', 'beast_player_analysis'];
    return ['beast_detail'];
  }
  if (system === 'ride') {
    if (normalized.endsWith('/skill')) return ['ride_skill'];
    if (normalized.endsWith('/wiki')) return ['ride/wiki/index'];
    if (normalized.endsWith('/make')) return ['ride_equip_make', 'ride_equip_recast'];
    if (normalized.endsWith('/upgrade')) return ['ride_equip_upgrade'];
    return ['ride_star'];
  }
  if (system === 'call_god') {
    if (normalized.endsWith('/limits')) return ['call_god_stage_limits'];
    if (normalized.endsWith('/stones')) return ['call_god_stone_rewards'];
    if (normalized.endsWith('/boss')) return ['call_god_boss_analysis'];
    if (normalized.endsWith('/common_skills')) return ['call_god_boss_common_skills'];
    if (normalized.endsWith('/talents')) return ['call_god_boss_talents'];
    return [];
  }
  if (system === 'rogue_item') return ['rogue-item/index'];
  if (system === 'kunlun') {
    if (normalized.endsWith('/pvp')) return ['kunlun_pvp_analysis'];
    return ['kunlun_analysis'];
  }
  if (system === STAGE_REWARDS_SYSTEM) return ['stage_reward_exp_soul'];
  if (system === RESOURCE_ACQUISITION_SYSTEM) {
    if (normalized.endsWith('/black_market')) return ['resource/acquisition/black-market/index'];
    if (normalized.endsWith('/secret_shop')) return ['resource/acquisition/secret-shop'];
    return ['resource/acquisition/boxes'];
  }
  if (system === 'power_requirements') return ['power_requirements'];
  if (system === 'boss') {
    if (normalized.endsWith('/all') || normalized.endsWith('/search')) return [BOSS_INDEX_FILE, ...ALL_BOSS_FILES];
    const routeKey = normalized.slice('/boss/'.length);
    return [BOSS_INDEX_FILE, BOSS_FILE_BY_ROUTE[routeKey]].filter(Boolean);
  }
  if (system === 'resist') return ['exp'];
  if (system === 'cold_knowledge') return ['cold_knowledge'];
  return [];
}
