import type { GameDataFile } from '../hooks/useGameData';
import {
  collectBossGroups,
  flattenBossGroups,
  formatNumber,
  METRIC_LABELS,
} from './boss-stats';

export interface SearchMatch {
  /** 命中的字段路径或描述 */
  path: string;
  /** 匹配到的完整文本 */
  value: string;
}

export interface SearchResult {
  id: string;
  source: string;
  /** 实体分类名，例如 "时装续费", "时装宝珠" */
  category: string;
  /** 实体名称 */
  title: string;
  /** 实体的补充说明，如 "LV.50" 或 "共30级" */
  subtitle?: string;
  /** 无论是否命中该字段，都始终展示的核心业务属性(如：续费消耗、升级材料) */
  details: { label: string; value: string }[];
  matches: SearchMatch[];
  score: number;
}

const MAX_RESULTS = 60;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function extractBossResults(dataSources: Record<string, GameDataFile>, query: string): SearchResult[] {
  const groups = collectBossGroups(dataSources);
  if (groups.length === 0) {
    return [];
  }

  const bosses = flattenBossGroups(groups);
  const results: SearchResult[] = [];

  for (const boss of bosses) {
    let score = 0;
    const matches: SearchMatch[] = [];
    const details: { label: string; value: string }[] = [];

    const pushMatch = (path: string, value: string | undefined, exactScore: number, partialScore: number) => {
      const text = value?.trim();
      if (!text) {
        return;
      }
      const normalizedValue = normalize(text);
      if (!normalizedValue.includes(query)) {
        return;
      }
      score += normalizedValue === query ? exactScore : partialScore;
      matches.push({ path, value: text });
    };

    pushMatch('BOSS名称', boss.name, 220, 140);
    pushMatch('BOSS备注', boss.remark, 120, 80);
    pushMatch('关卡名称', boss.stageName, 140, 100);

    if (score <= 0) {
      continue;
    }

    const props = boss.calculatedProps || {};
    details.push({ label: '关卡', value: boss.stageName || '-' });
    details.push({ label: '等级', value: String(boss.level ?? boss.stageLv ?? '-') });
    if (boss.remark?.trim()) {
      details.push({ label: '备注', value: boss.remark.trim() });
    }

    (['hp', 'atk', 'def', 'healHp'] as const).forEach((key) => {
      const value = props[key];
      if (value == null) {
        return;
      }
      details.push({ label: METRIC_LABELS[key], value: formatNumber(value) });
    });

    results.push({
      id: `boss-${boss.stageId}-${boss.id}-${boss.displayPhase ?? 0}`,
      source: 'boss',
      category: boss.typeLabel || 'BOSS 属性',
      title: boss.displayPhaseName ? `${boss.name || '未知 BOSS'}（${boss.displayPhaseName}）` : (boss.name || '未知 BOSS'),
      subtitle: `${boss.stageName || '-'}${boss.level ?? boss.stageLv ? ` · Lv.${boss.level ?? boss.stageLv}` : ''}`,
      details,
      matches,
      score,
    });
  }

  return results;
}

function extractFashionRenew(source: string, fileData: any, query: string): SearchResult[] {
  const results: SearchResult[] = [];
  if (!Array.isArray(fileData)) return results;

  for (const partGroup of fileData) {
    if (!Array.isArray(partGroup.groups)) continue;

    for (const group of partGroup.groups) {
      if (!Array.isArray(group.fashions)) continue;

      for (const fashionName of group.fashions) {
        const title = fashionName;
        let score = 0;
        const matches: SearchMatch[] = [];
        const details: { label: string; value: string }[] = [];

        details.push({ label: '时装名称', value: title });
        details.push({ label: '时装类别', value: group.category || '未分类' });

        // 1. 匹配时装名称
        if (normalize(title).includes(query)) {
          score += title === query ? 200 : 120;
        }

        // 2. 提取消耗 (组级)
        if (group.renew) {
          const renewStrs = Object.entries(group.renew).map(([days, costObj]: [string, any]) => {
            return costObj && costObj.name ? `${days}: ${costObj.name} ×${costObj.count}` : '';
          }).filter(Boolean);

          if (renewStrs.length > 0) {
            const renewValue = renewStrs.join(' | ');
            details.push({ label: '续费消耗', value: renewValue });
            if (normalize(renewValue).includes(query)) score += 60;
          }
        }

        // 传承消耗
        if (group.hasTransCost && Array.isArray(group.transCost) && group.transCost.length > 0) {
          const transStrs = group.transCost.map((costObj: any) => {
            return costObj && costObj.name ? `${costObj.name} ×${costObj.count}` : '';
          }).filter(Boolean);

          if (transStrs.length > 0) {
            const transValue = transStrs.join('，');
            details.push({ label: '传承消耗', value: transValue });
            if (normalize(transValue).includes(query)) score += 60;
          }
        }

        if (score > 0) {
          results.push({
            id: `${source}-${partGroup.part}-${title}`,
            source,
            category: '时装',
            title,
            subtitle: `部位: ${partGroup.partName || partGroup.part}`,
            details,
            matches,
            score
          });
        }
      }
    }
  }

  return results;
}

/**
 * 针对 role_fashion_ball.json 的提取
 * 结构：[{ rank: 0, levels: [{ level, upResources: {name, count} }] }, ...]
 */
function extractFashionBall(source: string, fileData: any[], query: string): SearchResult[] {
  const results: SearchResult[] = [];
  if (!Array.isArray(fileData)) return results;

  for (const rankGroup of fileData) {
    const rank = rankGroup.rank;
    const title = `${rank}阶 时装宝珠`;
    let score = 0;
    const matches: SearchMatch[] = [];
    const details: { label: string; value: string }[] = [];

    details.push({ label: '宝珠等级', value: title });

    // 1. 匹配名称
    if (normalize(title).includes(query)) {
      score += 120;
    }

    // 2. 提取消耗 (遍历所有等级，去重合并或者直接列出代表性消耗)
    const costSet = new Set<string>();
    if (Array.isArray(rankGroup.levels)) {
      for (const lv of rankGroup.levels) {
        if (lv.upResources?.name) {
          costSet.add(`${lv.upResources.name} ×${lv.upResources.count}`);
        }
      }
    }

    if (costSet.size > 0) {
      const costValue = Array.from(costSet).join('，');
      details.push({ label: '升级所需材料', value: costValue });
      if (normalize(costValue).includes(query)) score += 60;
    }

    if (score > 0) {
      results.push({
        id: `${source}-rank${rank}`,
        source,
        category: '时装宝珠',
        title,
        subtitle: `共 ${rankGroup.levels?.length || 0} 级`,
        details,
        matches,
        score
      });
    }
  }

  return results;
}

/**
 * 针对 role_equip_make.json 提取 (装备打造、重铸)
 */
function extractRoleEquipMake(source: string, fileData: any[], query: string): SearchResult[] {
  const results: SearchResult[] = [];
  if (!Array.isArray(fileData)) return results;

  for (const item of fileData) {
    const title = item.name || `未知装备(${item.id})`;
    let score = 0;
    const matches: SearchMatch[] = [];
    const details: { label: string; value: string }[] = [];

    // 从装备名的前两字推断套装真实名称（如"宣花戒指" → "宣花套装"），fallback到groupName
    const suitDisplayName = item.name ? `${String(item.name).slice(0, 2)}套装` : item.groupName;
    details.push({ label: '装备名称', value: title });
    if (item.groupName) {
      details.push({ label: '所属套装', value: `${suitDisplayName} Lv.${item.group}` });
    }

    // 1. 匹配名称 / 组名
    if (normalize(title).includes(query)) score += title === query ? 200 : 120;
    if (item.groupName && normalize(item.groupName).includes(query)) score += 80;

    // 2. 匹配和提取消耗
    const baseCostStrs = Array.isArray(item.cost) ? item.cost.map((c: any) => `${c.name} ×${c.count}`) : [];
    if (baseCostStrs.length > 0) {
      const cv = baseCostStrs.join(' + ');
      details.push({ label: '打造/重铸消耗', value: cv });
      if (normalize(cv).includes(query)) score += 60;
    }

    if (Array.isArray(item.recastUpgrade) && item.recastUpgrade.length > 0) {
      // 分阶段展示消耗，而不是全部合并在一起
      item.recastUpgrade.forEach((st: any, idx: number) => {
        if (Array.isArray(st.cost) && st.cost.length > 0) {
          const cv = st.cost.map((c: any) => `${c.name} ×${c.count}`).join('，');
          const stageLabel = `阶数提升(${idx + 1}重)`;
          details.push({ label: stageLabel, value: cv });
          if (normalize(cv).includes(query)) score += 60;
        }
      });
    }

    if (score > 0) {
      results.push({
        id: `${source}-${item.id}`,
        source,
        category: '角色装备 · 打造/重铸/升重',
        title,
        subtitle: item.groupName ? `套装: ${item.groupName}` : undefined,
        details,
        matches,
        score
      });
    }
  }
  return results;
}

/**
 * 针对 role_equip_upgrade.json 提取 (强化)
 */
function extractRoleEquipUpgrade(source: string, fileData: any[], query: string): SearchResult[] {
  const results: SearchResult[] = [];
  if (!Array.isArray(fileData)) return results;

  for (const stage of fileData) {
    const title = `强化段位 ${stage.levelStart}-${stage.levelEnd}级`;
    let score = 0;
    const matches: SearchMatch[] = [];
    const details: { label: string; value: string }[] = [];

    details.push({ label: '强化等级段', value: `${stage.levelStart} 级至 ${stage.levelEnd} 级` });
    details.push({ label: '单级基础经验', value: String(stage.exp) });

    if (normalize(title).includes(query)) score += 120;

    if (Array.isArray(stage.cost) && stage.cost.length > 0) {
      const cv = stage.cost.map((c: any) => `${c.name} ×${c.count}`).join(' + ');
      details.push({ label: '消耗产出道具', value: cv });
      if (normalize(cv).includes(query)) score += 60;
    }

    if (String(stage.exp) === query) score += 30; // 命中特指的经验值

    if (score > 0) {
      results.push({
        id: `${source}-${stage.levelStart}`,
        source,
        category: '角色装备 · 强化',
        title,
        subtitle: `每次强化基础经验: ${stage.exp}`,
        details,
        matches,
        score
      });
    }
  }
  return results;
}

/**
 * 针对 role_equip_smelt.json 提取 (熔炼)
 */
function extractRoleEquipSmelt(source: string, fileData: any[], query: string): SearchResult[] {
  const results: SearchResult[] = [];
  if (!Array.isArray(fileData)) return results;

  // 聚合同品质同熔炼等级的所有部位为一个实体？（当前 JSON 中不同部消耗位完全一样）
  // 按照 quality 和 smeltLv 分组
  const groupMap = new Map<string, any>();
  for (const item of fileData) {
    const key = `q${item.quality}-lv${item.smeltLv}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        quality: item.quality,
        smeltLv: item.smeltLv,
        unlockLv: item.unlockLv,
        parts: new Set([item.part]),
        cost: item.cost
      });
    } else {
      groupMap.get(key).parts.add(item.part);
    }
  }

  for (const [key, group] of groupMap.entries()) {
    const title = `品质 ${group.quality} 装备 - 熔炼段位 ${group.smeltLv}`;
    let score = 0;
    const matches: SearchMatch[] = [];
    const details: { label: string; value: string }[] = [];

    details.push({ label: '目标装备品质', value: String(group.quality) });
    details.push({ label: '熔炼段位', value: String(group.smeltLv) });
    details.push({ label: '解锁角色等级', value: String(group.unlockLv) });

    if (normalize(title).includes(query)) score += 120;
    if (String(group.unlockLv) === query) score += 30;

    if (Array.isArray(group.cost) && group.cost.length > 0) {
      const cv = group.cost.map((c: any) => `${c.name} ×${c.count}`).join(' + ');
      details.push({ label: '单次熔炼消耗', value: cv });
      if (normalize(cv).includes(query)) score += 60;
    }

    if (score > 0) {
      results.push({
        id: `${source}-${key}`,
        source,
        category: '角色装备 · 熔炼',
        title,
        subtitle: `全套部位适用 | ${group.unlockLv} 级解锁`,
        details,
        matches,
        score
      });
    }
  }
  return results;
}


/**
 * 针对 role_equip_stone.json 提取 (宝石)
 */
function extractRoleEquipStone(source: string, fileData: any[], query: string): SearchResult[] {
  const results: SearchResult[] = [];
  if (!Array.isArray(fileData)) return results;

  for (const group of fileData) {
    if (!Array.isArray(group.levels)) continue;

    for (const gem of group.levels) {
      const title = gem.name || `未知宝石(${gem.id})`;
      let score = 0;
      const matches: SearchMatch[] = [];
      const details: { label: string; value: string }[] = [];

      details.push({ label: '宝石名称', value: title });
      if (group.groupName) {
        details.push({ label: '宝石类型', value: group.groupName });
      }

      if (normalize(title).includes(query)) score += title === query ? 200 : 120;
      if (group.groupName && normalize(group.groupName).includes(query)) score += 80;

      // 解析属性 (这里简单拿第一个作为代表展示)
      if (Array.isArray(gem.attribute) && Array.isArray(gem.attributeValue)) {
        details.push({
          label: '核心属性加成',
          value: `${gem.attribute[0] || '未知'}: +${gem.attributeValue[0] || 0}`
        });
      }

      // 提取消耗 cost
      if (Array.isArray(gem.sellCost) && gem.sellCost.length > 0) {
        const costStrs = gem.sellCost.map((c: any) => {
          if (c.count && c.count.min !== undefined && c.count.max !== undefined) {
            return `${c.name} ×${c.count.min === c.count.max ? c.count.min : `${c.count.min}~${c.count.max}`}`;
          }
          return `${c.name} ×${c.count}`;
        });

        const cv = costStrs.join(' + ');
        details.push({ label: '合成消耗', value: cv });
        if (normalize(cv).includes(query)) score += 60;
      }

      if (score > 0) {
        results.push({
          id: `${source}-${gem.id}`,
          source,
          category: '角色装备 · 宝石',
          title,
          subtitle: `等级: ${gem.level}`,
          details,
          matches,
          score
        });
      }
    }
  }
  return results;
}

export function searchDataSources(dataSources: Record<string, GameDataFile>, rawQuery: string) {
  const query = normalize(rawQuery);
  if (!query) {
    return [] as SearchResult[];
  }

  const results: SearchResult[] = [];
  const hasBossSources = Object.keys(dataSources).some((source) => source.startsWith('boss_type_') || source === 'boss_stage_stats');

  Object.entries(dataSources).forEach(([source, file]) => {
    if (!file || !file.data) return;

    if (source === 'role_fashion_renew') {
      results.push(...extractFashionRenew(source, file.data, query));
    } else if (source === 'role_fashion_ball') {
      results.push(...extractFashionBall(source, file.data as any[], query));
    } else if (source === 'role_equip_make') {
      results.push(...extractRoleEquipMake(source, file.data as any[], query));
    } else if (source === 'role_equip_upgrade') {
      results.push(...extractRoleEquipUpgrade(source, file.data as any[], query));
    } else if (source === 'role_equip_smelt') {
      results.push(...extractRoleEquipSmelt(source, file.data as any[], query));
    } else if (source === 'role_equip_stone') {
      results.push(...extractRoleEquipStone(source, file.data as any[], query));
    } else {
      // TODO: Other sources will be implemented later
      // Fallback temporarily skips them, since we are doing module by module
    }
  });

  if (hasBossSources) {
    results.push(...extractBossResults(dataSources, query));
  }

  return results
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, 'zh-Hans-CN'))
    .slice(0, MAX_RESULTS);
}
