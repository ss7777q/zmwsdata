/**
 * 角色技能 Wiki 通用查表引擎
 *
 * 实现 docs/角色wiki开发.md 的查表链路。铁律(文档第11节):
 *   - 缺数据写 warning,绝不 mock / 回填假值
 *   - bullet 必须按 bullet.id 查找,禁止用数组下标兜底
 *   - isNotDamage===1 的顶层 com 不计入伤害段数
 *   - 转职技能不强行绑定本体 cfgFile
 *
 * 战斗配置(bullets.json / entityCtg)优先读项目内本地缓存 file/battle-config/
 * (性质同 map-cache:在 .gitignore 内,不进 git);本地缺失再回退外部源
 * D:\zmws\GameAnalysis\data\file。WSL 访问不了 D 盘,须用 PowerShell+node 跑。
 */
const fs = require("fs");
const path = require("path");

// ─── 资源路径 ───────────────────────────────────────────
// 优先:项目内本地缓存(可随仓库部署到别的机器);回退:外部源(本机抓取处)
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const LOCAL_BATTLE_DIR = path.join(REPO_ROOT, "file", "battle-config");
const SOURCE_BATTLE_DIR = "D:/zmws/GameAnalysis/data/file";
// bullets.json 在哪个目录就用哪个;两边都没有时默认指向本地(报错信息更直观)
const BATTLE_DIR = fs.existsSync(path.join(LOCAL_BATTLE_DIR, "bullets.json"))
  ? LOCAL_BATTLE_DIR
  : (fs.existsSync(path.join(SOURCE_BATTLE_DIR, "bullets.json")) ? SOURCE_BATTLE_DIR : LOCAL_BATTLE_DIR);
const BULLETS_PATH = path.join(BATTLE_DIR, "bullets.json");
const ENTITY_DIR = path.join(BATTLE_DIR, "entityCtg");

// warning code(文档第11节)
const WARN = {
  MISSING_SKILL: "MISSING_SKILL",
  MISSING_SKILL_LEVEL: "MISSING_SKILL_LEVEL",
  MISSING_BULLET: "MISSING_BULLET",
  MISSING_BUFF: "MISSING_BUFF",
  MISSING_BESKILL: "MISSING_BESKILL",
  MISSING_ENTITY_CFG: "MISSING_ENTITY_CFG",
  MISSING_ACTION_CFG: "MISSING_ACTION_CFG",
  SOURCE_DEFAULT_30_FRAMES: "SOURCE_DEFAULT_30_FRAMES",
  GROWTH_BUFF_LEVEL_MISSING: "GROWTH_BUFF_LEVEL_MISSING",
};

// ─── 战斗配置加载 ───────────────────────────────────────
let _bulletsById = null;
function loadBullets() {
  if (_bulletsById) return _bulletsById;
  if (!fs.existsSync(BULLETS_PATH)) {
    throw new Error(`缺少关键资源 bullets.json: ${BULLETS_PATH}(文档第1.2节:缺资源直接报错)`);
  }
  const arr = JSON.parse(fs.readFileSync(BULLETS_PATH, "utf8"));
  _bulletsById = new Map();
  for (const b of arr) {
    if (b && b.id != null) _bulletsById.set(b.id, b); // 按 id 索引,禁止下标兜底(数组有 null 空洞且下标≠id)
  }
  return _bulletsById;
}

const _cfgCache = new Map();
function loadEntityCfg(cfgFile) {
  if (!cfgFile) return null;
  if (_cfgCache.has(cfgFile)) return _cfgCache.get(cfgFile);
  const fp = path.join(ENTITY_DIR, `${cfgFile}.json`);
  const cfg = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, "utf8")) : null;
  _cfgCache.set(cfgFile, cfg);
  return cfg;
}

function getBullet(id, warnings) {
  const b = loadBullets().get(id);
  if (!b && warnings) warnings.push({ code: WARN.MISSING_BULLET, detail: `bullet ${id} 不存在` });
  return b || null;
}

// ─── 具体技能展开(文档第3节)─────────────────────────────
function resolveConcreteSkills(displaySkillId, skillById, warnings) {
  const result = [];
  const seen = new Set();
  const queue = [displaySkillId];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const s = skillById.get(id);
    if (!s) {
      warnings.push({ code: WARN.MISSING_SKILL, detail: `skill ${id} 不在 skill 表` });
      continue;
    }
    result.push(id);
    for (const next of [].concat(s.otherSkill || [], s.connectSkill || [])) {
      if (typeof next === "number" && !seen.has(next)) queue.push(next);
    }
  }
  return result;
}

// ─── skillLevel 查表(文档第4节)──────────────────────────
function skillLevelRowId(skill, level) {
  if (skill.skillLevelId) return skill.skillLevelId + level - 1;
  return skill.id * 1000 + level;
}
function baseSkillLevelId(skill) {
  if (skill.skillLevelId) return skill.skillLevelId;
  return skill.id * 1000 + 1;
}

/** 探测某具体技能的连续等级数(文档4.2,不写死) */
function detectMaxLevel(skill, skillLevelById) {
  let lv = 0;
  while (lv < 100) {
    const rowId = skillLevelRowId(skill, lv + 1);
    if (!skillLevelById.has(rowId)) break;
    lv += 1;
  }
  return lv;
}

function querySkillLevel(skill, level, skillLevelById, warnings) {
  const rowId = skillLevelRowId(skill, level);
  const row = skillLevelById.get(rowId);
  if (!row) {
    warnings.push({ code: WARN.MISSING_SKILL_LEVEL, detail: `skill ${skill.id} lv${level} rowId=${rowId} 缺失` });
    return null;
  }
  return row;
}

// ─── cfgFile 解析(文档第5节)─────────────────────────────
/**
 * @param slot 槽位名(skill1.. trick transSkill1..)
 * @returns {cfgFileResolved, cfgResolveSource, cfgMonsterId, cfgMonsterName, hasActionCfg}
 */
function resolveCfgFile(skill, slot, roleId, monsterById, warnings) {
  const isTrans = /^transSkill/.test(slot || "");
  const action = skill.entityAction;
  const tryCfg = (cfgFile) => {
    if (!cfgFile) return null;
    const cfg = loadEntityCfg(cfgFile);
    if (cfg && action && cfg[action]) return cfg;
    return null;
  };

  // 反查包含该 skill.id 的 monster
  const ownerMonsters = [];
  for (const m of monsterById.values()) {
    const all = [].concat(m.skillIds || [], m.skyskillIds || [], m.vSkill || [], m.atkIds || [], m.skyAtkIds || []);
    if (all.includes(skill.id)) ownerMonsters.push(m);
  }
  const selfMonster = monsterById.get(roleId);

  let order = [];
  if (isTrans) {
    order = [...ownerMonsters, selfMonster];
  } else {
    order = [selfMonster, ...ownerMonsters];
  }

  for (const m of order) {
    if (!m) continue;
    const cfg = tryCfg(m.cfgFile);
    if (cfg) {
      return {
        cfgFileResolved: m.cfgFile,
        cfgResolveSource: m === selfMonster ? "self" : "ownerMonster",
        cfgMonsterId: m.id,
        cfgMonsterName: m.name,
        hasActionCfg: true,
        actionCfg: cfg[action],
        entityCfg: cfg,
      };
    }
  }

  // 没找到有 action 的 cfg
  const fallback = selfMonster?.cfgFile || ownerMonsters[0]?.cfgFile || null;
  if (!fallback || !loadEntityCfg(fallback)) {
    warnings.push({ code: WARN.MISSING_ENTITY_CFG, detail: `skill ${skill.id} slot=${slot} 找不到 entityCtg` });
  } else if (action) {
    warnings.push({ code: WARN.MISSING_ACTION_CFG, detail: `skill ${skill.id} action=${action} 在 cfg ${fallback} 中不存在` });
  }
  return {
    cfgFileResolved: fallback,
    cfgResolveSource: "fallback",
    cfgMonsterId: selfMonster?.id ?? null,
    cfgMonsterName: selfMonster?.name ?? null,
    hasActionCfg: false,
    actionCfg: null,
    entityCfg: fallback ? loadEntityCfg(fallback) : null,
  };
}

// ─── 释放时间(文档第6节)─────────────────────────────────
function resolveReleaseTime(entityCfg, action, hasActionCfg, warnings) {
  if (!hasActionCfg || !entityCfg) {
    return { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "actionCfgMissing" };
  }
  const t = entityCfg.time ? entityCfg.time[action] : undefined;
  if (t != null) {
    return { releaseFrames: t, releaseSeconds: t / 30, releaseTimeSource: "entityCtg.time" };
  }
  // 有 action 但 time 缺失 → 源码默认 30
  warnings.push({ code: WARN.SOURCE_DEFAULT_30_FRAMES, detail: `action=${action} 无 time,按源码默认 30 帧` });
  return { releaseFrames: 30, releaseSeconds: 1, releaseTimeSource: "sourceDefault30" };
}

// ─── 伤害段数(文档第7节)─────────────────────────────────
/** 取顶层有效伤害 com(过滤 isNotDamage===1) */
function damageComs(bullet) {
  if (!bullet || !Array.isArray(bullet.com)) return [];
  return bullet.com.filter((c) => c.isNotDamage !== 1);
}
/** 数组取值:第 N 个有效 com 用数组第 N 项,越界取最后一项;非数组直接返回 */
function pickArr(v, n) {
  if (Array.isArray(v)) return v.length ? v[Math.min(n, v.length - 1)] : null;
  return v;
}

/**
 * 计算某具体技能某一级的伤害段。
 * @returns {kind, segments:[{per,val,maxHit,from}], totalPer, totalVal}
 */
function computeDamageSegments(skill, levelRow, actionCfg, warnings) {
  const segments = [];

  // 7.1 子弹分支
  if (levelRow && Array.isArray(levelRow.bullet) && levelRow.bullet.length) {
    levelRow.bullet.forEach((bId, bi) => {
      const bullet = getBullet(bId, warnings);
      const coms = damageComs(bullet);
      const perArr = levelRow.bulletDamageAddPer ? levelRow.bulletDamageAddPer[bi] : null;
      const valArr = levelRow.bulletDamageAddVal ? levelRow.bulletDamageAddVal[bi] : null;
      coms.forEach((com, ci) => {
        segments.push({
          per: pickArr(perArr, ci) ?? 0,
          val: pickArr(valArr, ci) ?? 0,
          maxHit: com.maxHit || 1,
          from: `bullet:${bId}#${ci}`,
        });
      });
    });
    return finalize("bullet", segments);
  }

  // 7.2 普通字段 + 动作 bullet
  if (actionCfg && Array.isArray(actionCfg.com)) {
    const actionBulletIds = actionCfg.com.filter((c) => c.type === 2 && c.bId != null).map((c) => c.bId);
    let hit = 0;
    for (const bId of actionBulletIds) {
      const bullet = getBullet(bId, warnings);
      for (const com of damageComs(bullet)) {
        hit += com.maxHit || 1;
        segments.push({
          per: levelRow?.damageAddPer ?? 0,
          val: levelRow?.damageAddVal ?? 0,
          maxHit: com.maxHit || 1,
          from: `actionBullet:${bId}`,
        });
      }
    }
    if (segments.length) return finalize("normalActionBullet", segments);
  }

  // 7.3 普通 1 段
  if (levelRow) {
    segments.push({ per: levelRow.damageAddPer ?? 0, val: levelRow.damageAddVal ?? 0, maxHit: 1, from: "normal" });
  }
  return finalize("normal", segments);
}

function finalize(kind, segments) {
  let totalPer = 0, totalVal = 0;
  for (const s of segments) {
    totalPer += (s.per || 0) * (s.maxHit || 1);
    totalVal += (s.val || 0) * (s.maxHit || 1);
  }
  return { kind, segments, totalPer: round(totalPer), totalVal: round(totalVal) };
}
function round(n) { return Math.round(n * 1000) / 1000; }

// ─── buff 扫描(文档第8节 5 类来源)──────────────────────
// 动作 com / bullet hitBuff 上可能出现的 buff 字段名
const ACTION_BUFF_FIELDS = ["buff", "buffId", "buffIds", "mainBuffIds", "initBuffs", "dieBuffs", "lineBuffs", "offBuffs"];
const HIT_BUFF_FIELDS = ["hitBuff", "hitBuffFlyMonster", "hitBuffNoFlyMonster", "hitBuffPet", "hitBuffRide"];
const BULLET_BUFF_FIELDS = ["firstHitAddBuffs"];

function pushBuffIds(target, value) {
  if (value == null) return;
  if (Array.isArray(value)) value.forEach((v) => pushBuffIds(target, v));
  else if (typeof value === "number" && value > 1000) target.push(value);
}

/**
 * 扫描一个具体技能绑定的所有 buff 基础 id,按来源归类。
 * 返回 [{baseBuffId, bindSource, targetKind}],已按 baseBuffId 去重。
 * 不猜测(不扫"所有大整数"),只读文档第 8 节明确的字段。
 */
function scanBuffs(skill, actionCfg, beskillById, warnings) {
  const found = [];
  const seen = new Set();
  const add = (id, bindSource, targetKind = "buff") => {
    if (id == null || seen.has(id)) return;
    seen.add(id);
    found.push({ baseBuffId: id, bindSource, targetKind });
  };

  // 8.1 skill.beSkill / beSkill2 -> beskill.attribute.addBuffs
  for (const field of ["beSkill", "beSkill2"]) {
    const ids = [];
    pushBuffIds(ids, skill[field]);
    for (const beId of ids) {
      const be = beskillById.get(beId);
      if (!be) {
        warnings.push({ code: WARN.MISSING_BESKILL, detail: `beskill ${beId} 缺失` });
        continue;
      }
      const addBuffs = [];
      pushBuffIds(addBuffs, be.attribute?.addBuffs);
      for (const bId of addBuffs) add(bId, field, "buff");
    }
  }

  // 8.2 entityAction.com 直接 buff 字段
  if (actionCfg && Array.isArray(actionCfg.com)) {
    for (const com of actionCfg.com) {
      for (const field of ACTION_BUFF_FIELDS) {
        const ids = [];
        pushBuffIds(ids, com[field]);
        for (const bId of ids) add(bId, "entityActionComBuff", "buff");
      }
      // 8.3 bullet hitBuff
      if (com.type === 2 && com.bId != null) {
        const bullet = getBullet(com.bId, warnings);
        if (bullet) {
          for (const field of BULLET_BUFF_FIELDS) {
            const ids = [];
            pushBuffIds(ids, bullet[field]);
            for (const bId of ids) add(bId, "bulletFirstHitBuff", "buff");
          }
        }
        if (bullet && Array.isArray(bullet.com)) {
          for (const bc of bullet.com) {
            for (const field of HIT_BUFF_FIELDS) {
              const ids = [];
              pushBuffIds(ids, bc[field]);
              for (const bId of ids) add(bId, "bulletHitBuff", "buff");
            }
            for (const cc of bc.com || []) {
              for (const field of HIT_BUFF_FIELDS) {
                const ids = [];
                pushBuffIds(ids, cc[field]);
                for (const bId of ids) add(bId, "bulletHitBuff", "buff");
              }
            }
          }
        }
      }
    }
  }

  return found;
}

// ─── buff 成长(文档第9节)────────────────────────────────
function resolveBuffGrowth(baseBuffId, level, buffById, warnings) {
  const hasNext = buffById.has(baseBuffId + 1);
  if (!hasNext) {
    const buff = buffById.get(baseBuffId);
    if (!buff) warnings.push({ code: WARN.MISSING_BUFF, detail: `buff ${baseBuffId} 缺失` });
    return { levelMode: "fixed", effectiveBuffId: baseBuffId, buff: buff || null };
  }
  const effId = baseBuffId + level - 1;
  const buff = buffById.get(effId);
  if (!buff) {
    warnings.push({ code: WARN.GROWTH_BUFF_LEVEL_MISSING, detail: `growth buff ${effId} 缺失,回退 ${baseBuffId}` });
    return { levelMode: "fallback", effectiveBuffId: baseBuffId, buff: buffById.get(baseBuffId) || null };
  }
  return { levelMode: "growth", effectiveBuffId: effId, buff };
}

module.exports = {
  WARN,
  loadBullets, loadEntityCfg, getBullet,
  resolveConcreteSkills,
  skillLevelRowId, baseSkillLevelId, detectMaxLevel, querySkillLevel,
  resolveCfgFile, resolveReleaseTime,
  computeDamageSegments, damageComs, pickArr,
  scanBuffs, resolveBuffGrowth,
};
