/**
 * 昆仑解析 — 守护昆仑塔防模式全量数据提取
 *
 * 数据链路:
 *   buildKunLunStage (15关) → stage(type=23) → buildProtectKunLunWave (波次强度/经济)
 *   buildProtectKunLun (59塔) ↔ monster(同id, atk/hp为系数) → skill/beskill/buff
 *   building (18行=18塔系解锁配置) → item(1025昆仑神石)
 *   真实塔属性 = buildAttribute[关卡lv] × monster系数
 *
 * 塔系机制深度解析来自 scripts/extract/overrides/kunlun_towers/<group>.json
 * (人工/agent 核对产物,含技能/命中buff/机制说明),缺失时仅输出表数据。
 */
const fs = require('fs');
const path = require('path');
const u = require('../lib/utils');

const OVERRIDE_DIR = path.join(__dirname, 'overrides', 'kunlun_towers');
const PVP_OVERRIDE_DIR = path.join(__dirname, 'overrides', 'kunlun_pvp');

// ─── 工具 ───────────────────────────────────────────

function resolveCoef(raw) {
  if (typeof raw === 'number') return [raw, 0];
  if (typeof raw === 'string' && raw !== '' && !Number.isNaN(Number(raw))) return [Number(raw), 0];
  if (Array.isArray(raw)) return [Number(raw[0]) || 0, Number(raw[1]) || 0];
  if (raw && typeof raw === 'object') {
    const v = Object.values(raw).map(x => Number(x) || 0);
    return [v[0] || 0, v[1] || 0];
  }
  return [0, 0];
}

function loadOverride(group) {
  const fp = path.join(OVERRIDE_DIR, `${group}.json`);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (e) {
    console.warn(`  ⚠️ override ${group}.json 解析失败: ${e.message}`);
    return null;
  }
}

// ─── 主提取 ─────────────────────────────────────────

function extractKunlun() {
  const towers = u.loadTable('buildProtectKunLun');
  const kunlunStages = u.loadTable('buildKunLunStage');
  const waves = u.loadTable('buildProtectKunLunWave');
  const buildAttrs = u.loadTable('buildAttribute');
  const buildings = u.loadTable('building');
  const stageTable = u.loadTable('stage');
  const stringTexts = u.loadTable('StringText');

  const monsters = u.loadTable('monster');
  const monsterById = new Map(monsters.map(m => [m.id, m]));
  const skills = u.loadTable('skill');
  const skillById = new Map(skills.map(s => [s.id, s]));
  const buffs = u.loadTable('buff');
  const buffById = new Map(buffs.map(b => [b.id, b]));
  const stringTextById = new Map(stringTexts.map(t => [t.id, t]));
  const stageById = new Map(stageTable.map(s => [s.id, s]));
  const attrByLv = new Map(buildAttrs.map(a => [a.lv, a]));
  const buildingById = new Map(buildings.map(b => [b.id, b]));

  const stageLevels = kunlunStages.map(s => s.level);

  // ── 塔系分组 ──
  const groups = new Map();
  for (const t of towers) {
    if (!groups.has(t.group)) groups.set(t.group, []);
    groups.get(t.group).push(t);
  }

  const skillBrief = (id, slot) => {
    const s = skillById.get(id);
    if (!s) return { id, slot, name: null };
    return {
      id, slot,
      name: s.desName || s.Name || null,
      cd: s.cd ?? null,
      lockRange: s.lockRange ?? null,
      maxRadius: s.maxRadius ?? null,
      beSkill: Array.isArray(s.beSkill) && s.beSkill.length ? s.beSkill : null,
    };
  };

  const towerGroups = [];
  for (const [groupId, members] of groups) {
    members.sort((a, b) => a.level - b.level || a.id - b.id);
    const override = loadOverride(groupId);
    const building = buildingById.get(groupId);

    const levels = members.map(t => {
      const mon = monsterById.get(t.id) || {};
      const [atkMulti, atkAdd] = resolveCoef(mon.atk);
      const [hpMulti, hpAdd] = resolveCoef(mon.hp);

      const skillRefs = [];
      for (const id of mon.atkIds || []) skillRefs.push(skillBrief(id, 'atkIds'));
      for (const id of mon.skillIds || []) skillRefs.push(skillBrief(id, 'skillIds'));
      for (const id of mon.vSkill || []) skillRefs.push(skillBrief(id, 'vSkill'));
      for (const id of mon.initVskill || []) skillRefs.push(skillBrief(id, 'initVskill'));

      const initBuffs = (mon.initBuff || []).map(id => {
        const b = buffById.get(id);
        return { id, name: b?.name || null, text: b?.text || null, value: b?.value ?? null };
      });

      // 每个关卡等级下的真实属性
      const statsByStageLevel = stageLevels.map(lv => {
        const base = attrByLv.get(lv);
        if (!base) return { lv, atk: null, hp: null };
        return {
          lv,
          atk: Math.ceil(base.atk * atkMulti + atkAdd),
          hp: Math.ceil(base.hp * hpMulti + hpAdd),
        };
      });

      // dstageDesc 可能是内联文本;otherData.dstageDesc 为数字时引用 StringText
      let desc = t.dstageDesc ?? null;
      const od = t.otherData || {};
      if (typeof od.dstageDesc === 'number') {
        desc = stringTextById.get(od.dstageDesc)?.text ?? desc;
      }

      return {
        id: t.id,
        name: od.name || t.name,
        level: t.level,
        desc,
        icon: od.icon || t.icon,
        upgradeId: t.upgradeId ?? null,
        buildCost: t.buildCost ?? null,
        upgradeCost: t.upgradeCost ?? null,
        dismantleReturn: t.dismantleReturn ?? null,
        atkCoef: atkAdd ? [atkMulti, atkAdd] : atkMulti,
        hpCoef: hpAdd ? [hpMulti, hpAdd] : hpMulti,
        atkCd: mon.atkCd ?? null,
        skills: skillRefs,
        initBuffs,
        statsByStageLevel,
        stageLimitCount: t.stageLimitCount ?? null,
        noShowUpgrade: t.noShowUpgrade ?? null,
        otherData: t.otherData ?? null,
      };
    });

    const displayName = override?.groupName
      || (members[0].otherData?.name)
      || members[0].name;

    towerGroups.push({
      group: groupId,
      groupName: displayName,
      levelChain: levels.map(l => l.name),
      category: override?.category ?? null,
      role: override?.role ?? null,
      overview: override?.overview ?? null,
      targeting: override?.targeting ?? null,
      counters: override?.counters ?? null,
      weaknesses: override?.weaknesses ?? null,
      synergy: override?.synergy ?? null,
      analysisLevels: override?.levels ?? null,
      special: override?.special ?? null,
      uncertainties: override?.uncertainties ?? null,
      hasAnalysis: Boolean(override),
      unlock: building ? {
        buildingType: building.buildingType ?? null,
        unlockType: building.unlockType ?? null,
        unlockCost: u.parseCost(building.unlockValue),
        limitType: building.limitType ?? null,
        canTry: building.try === 3,
      } : null,
      levels,
    });
  }
  towerGroups.sort((a, b) => a.group - b.group);

  // ── 关卡 ──
  const wavesByStage = new Map();
  for (const w of waves) {
    if (!wavesByStage.has(w.stageId)) wavesByStage.set(w.stageId, []);
    wavesByStage.get(w.stageId).push(w);
  }
  const stageWaves = (stageId) => (wavesByStage.get(stageId) || [])
    .sort((a, b) => a.waveId - b.waveId)
    .map(w => ({
      waveId: w.waveId,
      hp: w.hp,
      hpDouble: w.hpDouble,
      atk: w.atk,
      moneyMonster: w.moneyMonster ?? null,
      moneyWave: w.moneyWave ?? null,
    }));

  const stages = kunlunStages
    .sort((a, b) => a.id - b.id)
    .map(s => {
      const normal = stageById.get(s.stageId);
      const speed = stageById.get(s.stageSpeedId);
      return {
        id: s.id,
        group: s.group,
        groupName: s.groupName,
        name: s.name,
        level: s.level,
        normal: {
          stageId: s.stageId,
          map: normal?.map ?? null,
          desc: normal?.dstageDesc ?? null,
          initMoney: s.initMoney,
          waves: stageWaves(s.stageId),
        },
        speed: {
          stageId: s.stageSpeedId,
          map: speed?.map ?? null,
          initMoney: s.initMoneySpeed,
          waves: stageWaves(s.stageSpeedId),
        },
      };
    });

  // ── 基准属性成长曲线(只保留关卡用到的等级) ──
  const attributeCurve = stageLevels.map(lv => {
    const a = attrByLv.get(lv);
    return a ? { lv, atk: a.atk, hp: a.hp } : { lv, atk: null, hp: null };
  });

  const analysisCount = towerGroups.filter(g => g.hasAnalysis).length;
  console.log(`  📊 塔系 ${towerGroups.length} 组(${analysisCount} 组含机制解析) / 关卡 ${stages.length}`);

  u.saveOutput('kunlun_analysis', {
    towerGroups,
    stages,
    attributeCurve,
    stageLevels,
    notes: {
      statFormula: '塔真实属性 = buildAttribute[关卡等级].atk|hp × monster系数(atkCoef/hpCoef);levels[].statsByStageLevel 已按 15 个关卡等级预算好',
      waveFormula: '波次怪物/BOSS 属性 = 基准属性 × wave.hp(血量)、× wave.atk(攻击);hpDouble 为双人难度血量系数',
      bossData: '各关 BOSS 属性详见 BOSS 属性模块的"昆仑副本"分类(boss_type_0023_kunlun)',
      unlockItem: '昆仑神石(1025):部分塔系解锁道具,元宝商店获取',
    },
  }, {
    system: '昆仑解析',
    source: 'buildProtectKunLun.*.json + buildKunLunStage.*.json + buildProtectKunLunWave.*.json + buildAttribute.*.json + building.*.json + monster.*.json + skill.*.json + buff.*.json + StringText.*.json + stage.*.json',
    note: '守护昆仑塔防:防御塔机制/属性系数/建造经济 + 关卡波次 + 塔系深度解析(overrides/kunlun_towers)',
  });
}

function extract() {
  console.log('\n🏔️ 昆仑解析');
  extractKunlun();
  extractKunlunPvp();
}

/**
 * 瑶台争锋(昆仑PVP)— 单位系解析聚合
 * 单位机制来自 overrides/kunlun_pvp/*.json(agent 深挖产物);
 * 全局规则(经济/胜负/属性模型)来自 scratch/kunlun_pvp/discovery.json 的固化摘录。
 */
function extractKunlunPvp() {
  if (!fs.existsSync(PVP_OVERRIDE_DIR)) {
    console.log('  ⏭️ 瑶台争锋:overrides/kunlun_pvp 不存在,跳过');
    return;
  }
  const files = fs.readdirSync(PVP_OVERRIDE_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('  ⏭️ 瑶台争锋:无解析文件,跳过');
    return;
  }

  const KIND_ORDER = ['攻方兵营', '守方防御塔', '召唤塔', '英雄防御塔', '特殊'];
  const series = [];
  for (const f of files) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(PVP_OVERRIDE_DIR, f), 'utf-8'));
      // 部分文件的 featureText 是 {id: 文案} 映射,统一拍平成字符串
      if (s.featureText && typeof s.featureText === 'object') {
        s.featureText = Object.values(s.featureText).filter(v => typeof v === 'string').join('\n\n');
      }
      series.push(s);
    } catch (e) {
      console.warn(`  ⚠️ kunlun_pvp/${f} 解析失败: ${e.message}`);
    }
  }
  series.sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    return (a.key || '').localeCompare(b.key || '');
  });

  // 波次(瑶台争锋 stageId 999143101)
  const waves = u.loadTable('buildProtectKunLunWave')
    .filter(w => w.stageId === 999143101)
    .sort((a, b) => a.waveId - b.waveId)
    .map(w => ({ waveId: w.waveId, hp: w.hp, atk: w.atk, moneyMonster: w.moneyMonster ?? null, moneyWave: w.moneyWave ?? null }));

  const rules = {
    mode: '瑶台争锋(昆仑PVP):攻守双方对战的塔防模式。攻方建兵营出兵推进,守方建塔防守;双方各有一座三一神坛(主水晶)。',
    victory: '击毁对方三一神坛立即获胜;第7波结束且双方小兵清空后,比较双方神坛剩余血量百分比,高者获胜,相同则平局。',
    waveDurations: '7波时长依次为 30/60/60/60/60/90/90 秒。',
    buildPoints: '建筑点:开局 20 点,己方每产出 1 个小兵 +1 点;高级单位需要达到对应累计建筑点才能解锁(只作门槛,不消耗)。',
    money: '金币:攻方开局 1200、守方 900,双方每秒 +20;守方每波结束获得波次奖励、击杀小兵掉落金币;建造与升级消耗金币,拆除返还部分。',
    revive: '玩家阵亡后化为角色灵魂(幽灵形态),10 秒后原地复活。',
    element: '单位带元素属性与抗性:抗性为正的元素受到该系伤害减少约20%,为负则增加约20%。',
    globalDamp: '全场存在统一减伤,实际伤害数字远低于面板换算值(约为15%)。',
  };

  console.log(`  📊 瑶台争锋 单位系 ${series.length} 组 / 波次 ${waves.length}`);

  u.saveOutput('kunlun_pvp_analysis', { series, waves, rules }, {
    system: '昆仑解析',
    source: 'monster.*.json + skill.*.json + buff.*.json + battle-config + 客户端内嵌 kunlunPvpBuild 表(index.js)',
    note: '瑶台争锋(昆仑PVP):攻方兵营/守方塔/召唤塔/英雄塔/神坛机制解析(overrides/kunlun_pvp)',
  });
}

if (require.main === module) extract();
module.exports = extract;
