const u = require('../lib/utils');

const WUKONG_ROLE_ID = 1;
const WUKONG_SKILL_GROUPS = [100115, 100116, 100117, 100118, 100119, 100225, 100226, 100227, 100228];
const CORE_VERIFICATION_SKILL_IDS = {
  lieyanshan: 1001150,
  shenglongzhan: 1001160,
  lieyanfengbao: 1001170,
  huomozhan: 1001180,
  huashenmoyuan: 1001190,
};
const EXPLICIT_BUFF_LINKS = {
  1001150: [{ type: 'group', id: 8000401, name: '烈焰闪闪避提升' }],
  1001153: [{ type: 'group', id: 8000401, name: '烈焰闪闪避提升' }],
  1001155: [{ type: 'group', id: 8000401, name: '烈焰闪闪避提升' }],
  1001171: [{ type: 'single', id: 1000701, name: '血燃灼烧' }],
  10201: [{ type: 'range', start: 1007201, end: 1007204, name: '救命毫毛' }],
  10202: [{ type: 'range', start: 1007201, end: 1007204, name: '救命毫毛' }],
  10601: [{ type: 'range', start: 14001701, end: 14001702, name: '燃血铁骨' }],
  10602: [{ type: 'range', start: 14001701, end: 14001702, name: '燃血铁骨' }],
  10901: [{ type: 'range', start: 136017501, end: 136017502, name: '辟魔玄阵' }],
  10902: [{ type: 'range', start: 136017501, end: 136017502, name: '辟魔玄阵' }],
};

function indexBy(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function cloneSimple(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function simplifySkill(skill) {
  return {
    id: skill.id,
    name: skill.desName || skill.Name || `技能 ${skill.id}`,
    displayName: skill.Name || null,
    groupId: skill.groupId,
    skillLevelId: skill.skillLevelId,
    attribute: skill.attribute,
    skillTag: skill.skillTag,
    entityAction: skill.entityAction,
    damageAddPer: skill.damageAddPer,
    damageAddVal: skill.damageAddVal,
    cd: skill.cd,
    pvpcd: skill.pvpcd,
    energy: skill.energy,
    energyPvp: skill.energyPvp,
    addDefendVal: skill.addDefendVal,
    skillFps: skill.skillFps,
    beSkill: cloneSimple(skill.beSkill),
    beSkill2: cloneSimple(skill.beSkill2),
    custom: skill.custom,
    desIntro: skill.desIntro || null,
  };
}

function simplifySkillLevel(record, baseSkillLevelId) {
  return {
    id: record.id,
    index: record.id - baseSkillLevelId + 1,
    roleLevel: record.roleLevel ?? null,
    consumeMp: record.consumeMp ?? null,
    soulCost: cloneSimple(record.soulCost),
    bullet: cloneSimple(record.bullet),
    bulletDamageAddPer: cloneSimple(record.bulletDamageAddPer),
    bulletDamageAddVal: cloneSimple(record.bulletDamageAddVal),
    damageAddPer: record.damageAddPer ?? null,
    damageAddVal: record.damageAddVal ?? null,
    TriggerFactor: record.TriggerFactor ?? null,
    breakAddPer: record.breakAddPer ?? null,
    addDefendVal: record.addDefendVal ?? null,
    custom: record.custom ?? null,
  };
}

function simplifyBeskill(record) {
  if (!record) return null;
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    label: record.label,
    scope: cloneSimple(record.scope),
    scopeParam: cloneSimple(record.scopeParam),
    attribute: cloneSimple(record.attribute),
    rate: record.rate,
    cd: record.cd,
    initCd: record.initCd,
    otherData: cloneSimple(record.otherData),
    text: record.text,
    desc: record.desc,
    custom: record.custom,
    initEffect: cloneSimple(record.initEffect),
    effect: cloneSimple(record.effect),
  };
}

function simplifyBuff(record) {
  if (!record) return null;
  return {
    id: record.id,
    group: record.group,
    name: record.name,
    text: record.text,
    attribute: cloneSimple(record.attribute),
    type: record.type,
    time: record.time,
    value: cloneSimple(record.value),
    interval: record.interval,
    maxPiles: record.maxPiles,
    benefit: record.benefit,
    debuff: record.debuff,
    attachBuff: cloneSimple(record.attachBuff),
    endBuff: cloneSimple(record.endBuff),
    custom: record.custom,
  };
}

function collectReferencedBuffs(refs, buffById, buffByGroup, seenKeys) {
  const results = [];
  for (const ref of refs || []) {
    if (ref.type === 'single') {
      const buff = buffById.get(ref.id);
      if (!buff) continue;
      const key = `single:${buff.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      results.push({
        source: ref.name,
        linkType: 'single',
        buffId: buff.id,
        record: simplifyBuff(buff),
      });
      continue;
    }

    if (ref.type === 'group') {
      const rows = (buffByGroup.get(ref.id) || []).map(simplifyBuff);
      const key = `group:${ref.id}`;
      if (seenKeys.has(key) || rows.length === 0) continue;
      seenKeys.add(key);
      results.push({
        source: ref.name,
        linkType: 'group',
        group: ref.id,
        levels: rows,
      });
      continue;
    }

    if (ref.type === 'range') {
      const rows = [];
      for (let id = ref.start; id <= ref.end; id += 1) {
        const buff = buffById.get(id);
        if (buff) rows.push(simplifyBuff(buff));
      }
      const key = `range:${ref.start}-${ref.end}`;
      if (seenKeys.has(key) || rows.length === 0) continue;
      seenKeys.add(key);
      results.push({
        source: ref.name,
        linkType: 'range',
        start: ref.start,
        end: ref.end,
        levels: rows,
      });
    }
  }
  return results;
}

function extractPossibleBuffRefs(sourceId, sourceRecord, buffById, buffByGroup) {
  const refs = [];
  const candidates = [];

  const pushCandidate = (value, name) => {
    if (Array.isArray(value)) {
      value.forEach((item) => pushCandidate(item, name));
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach((item) => pushCandidate(item, name));
      return;
    }
    if (typeof value === 'number' && Number.isInteger(value) && value > 1000000) {
      candidates.push({ id: value, name });
    }
  };

  if (sourceRecord) {
    pushCandidate(sourceRecord.attribute, `attribute:${sourceId}`);
    pushCandidate(sourceRecord.otherData, `otherData:${sourceId}`);
    pushCandidate(sourceRecord.initEffect, `initEffect:${sourceId}`);
    pushCandidate(sourceRecord.effect, `effect:${sourceId}`);
  }

  for (const candidate of candidates) {
    if (buffById.has(candidate.id)) {
      refs.push({ type: 'single', id: candidate.id, name: candidate.name });
    } else if (buffByGroup.has(candidate.id)) {
      refs.push({ type: 'group', id: candidate.id, name: candidate.name });
    }
  }

  return refs;
}

function buildSkillPayloadFactory({ beskillById, buffById, buffByGroup, awakenBySkillId, skillLevelByPrefix }) {
  return function buildSkillPayload(skill) {
    const prefix = Math.floor(skill.skillLevelId / 1000);
    const levelRows = (skillLevelByPrefix.get(prefix) || [])
      .filter((row) => Math.floor(row.id / 1000) === prefix)
      .sort((left, right) => left.id - right.id)
      .map((row) => simplifySkillLevel(row, skill.skillLevelId));

    const beskillIds = [...new Set([...(skill.beSkill || []), ...(skill.beSkill2 || [])])]
      .filter((id) => typeof id === 'number');
    const beskillEntries = beskillIds
      .map((id) => simplifyBeskill(beskillById.get(id)))
      .filter(Boolean);

    const buffRefs = [
      ...(EXPLICIT_BUFF_LINKS[skill.id] || []),
      ...extractPossibleBuffRefs(skill.id, skill, buffById, buffByGroup),
      ...beskillIds.flatMap((id) => extractPossibleBuffRefs(id, beskillById.get(id), buffById, buffByGroup)),
    ];
    const buffEntries = collectReferencedBuffs(buffRefs, buffById, buffByGroup, new Set())
      .map((entry) => ({
        ...entry,
        group: entry.group ?? entry.record?.group ?? null,
      }));

    const awakenInfo = (awakenBySkillId.get(skill.id) || []).map((row) => ({
      id: row.id,
      skillGroup: row.skillGroup,
      skillId: row.skillId,
      cost: cloneSimple(row.cost),
      itemCost: cloneSimple(row.itemCost),
      text: row.text,
      desc: row.desc,
    }));

    return {
      id: skill.id,
      groupId: skill.groupId,
      name: skill.desName || skill.Name || `技能 ${skill.id}`,
      layerA: simplifySkill(skill),
      layerB: {
        baseSkillLevelId: skill.skillLevelId,
        levels: levelRows,
      },
      layerC: {
        beskills: beskillEntries,
        buffs: buffEntries,
      },
      awakenInfo,
    };
  };
}

function buildVerificationCases(payload) {
  const skillsById = indexBy(payload.skills.flatMap((group) => [group.baseSkill, ...group.awakenings]), 'id');
  const expByLevel = indexBy(payload.expStandards.byLevel, 'level');

  const lieyanshan = skillsById.get(CORE_VERIFICATION_SKILL_IDS.lieyanshan);
  const shenglongzhan = skillsById.get(CORE_VERIFICATION_SKILL_IDS.shenglongzhan);
  const lieyanfengbao = skillsById.get(CORE_VERIFICATION_SKILL_IDS.lieyanfengbao);
  const huomozhan = skillsById.get(CORE_VERIFICATION_SKILL_IDS.huomozhan);
  const huashenmoyuan = skillsById.get(CORE_VERIFICATION_SKILL_IDS.huashenmoyuan);

  const getLevel = (skill, index) => skill?.layerB?.levels?.find((row) => row.index === index) || null;
  const getBuffValue = (skill, group, index) => {
    const link = skill?.layerC?.buffs?.find((entry) => entry.group === group || entry.record?.group === group);
    if (!link) return null;
    const levelRow = link.levels?.find((row) => row.id === group + index - 1) || link.record;
    return Array.isArray(levelRow?.value) ? levelRow.value[1] ?? null : null;
  };

  const buildDamageSummary = (skill, index) => {
    const level = getLevel(skill, index);
    if (!level) return null;
    return {
      index,
      roleLevel: level.roleLevel,
      consumeMp: level.consumeMp,
      damageAddPer: level.damageAddPer,
      damageAddVal: level.damageAddVal,
      bulletDamageAddPer: level.bulletDamageAddPer,
      bulletDamageAddVal: level.bulletDamageAddVal,
      addDefendVal: level.addDefendVal,
    };
  };

  return {
    lieyanshan: {
      skillId: lieyanshan?.id ?? null,
      layerA: lieyanshan?.layerA ? {
        skillDamageAddPer: lieyanshan.layerA.damageAddPer,
        levelDamageAddPer: getLevel(lieyanshan, 1)?.damageAddPer ?? null,
        skillFps: lieyanshan.layerA.skillFps,
        cd: lieyanshan.layerA.cd,
        energy: lieyanshan.layerA.energy,
      } : null,
      layerB: lieyanshan ? {
        level1: buildDamageSummary(lieyanshan, 1),
        level10: buildDamageSummary(lieyanshan, 10),
        level20: buildDamageSummary(lieyanshan, 20),
      } : null,
      layerC: lieyanshan ? {
        dodgeBuffGroup: 8000401,
        level1: getBuffValue(lieyanshan, 8000401, 1),
        level10: getBuffValue(lieyanshan, 8000401, 10),
        level20: getBuffValue(lieyanshan, 8000401, 20),
        level1CommonStandard: expByLevel.get(1)?.standards?.commonStandard ?? null,
        level20CommonStandard: expByLevel.get(20)?.standards?.commonStandard ?? null,
      } : null,
    },
    shenglongzhan: {
      skillId: shenglongzhan?.id ?? null,
      layerA: shenglongzhan?.layerA ? {
        skillDamageAddPer: shenglongzhan.layerA.damageAddPer,
        levelDamageAddPer: getLevel(shenglongzhan, 1)?.damageAddPer ?? null,
      } : null,
      layerB: shenglongzhan ? {
        level1: buildDamageSummary(shenglongzhan, 1),
        level20: buildDamageSummary(shenglongzhan, 20),
      } : null,
      bloodAwaken: skillsById.get(1001161)?.layerC?.beskills?.find((entry) => entry.id === 6000201) || null,
    },
    lieyanfengbao: {
      skillId: lieyanfengbao?.id ?? null,
      layerA: lieyanfengbao?.layerA ? {
        skillDamageAddPer: lieyanfengbao.layerA.damageAddPer,
        levelDamageAddPer: getLevel(lieyanfengbao, 1)?.damageAddPer ?? null,
      } : null,
      layerB: lieyanfengbao ? {
        level1: buildDamageSummary(lieyanfengbao, 1),
      } : null,
      bloodBurnAwaken: skillsById.get(1001171)?.layerC?.beskills?.find((entry) => entry.id === 6000301) || null,
      burnBuff: skillsById.get(1001171)?.layerC?.buffs?.find((entry) => entry.record?.id === 1000701) || null,
    },
    huomozhan: {
      skillId: huomozhan?.id ?? null,
      layerA: huomozhan?.layerA ? {
        skillDamageAddPer: huomozhan.layerA.damageAddPer,
        level1BulletDamageAddPer: getLevel(huomozhan, 1)?.bulletDamageAddPer ?? null,
      } : null,
      layerB: huomozhan ? {
        level1: buildDamageSummary(huomozhan, 1),
      } : null,
      bloodExplosion: [6000401, 6000402].map((id) => skillsById.get(1001181)?.layerC?.beskills?.find((entry) => entry.id === id) || null),
      phantomDestroyLevel1: buildDamageSummary(skillsById.get(1001182), 1),
    },
    huashenmoyuan: {
      skillId: huashenmoyuan?.id ?? null,
      layerA: huashenmoyuan?.layerA ? {
        skillDamageAddPer: huashenmoyuan.layerA.damageAddPer,
        skillTag: huashenmoyuan.layerA.skillTag,
      } : null,
      layerB: huashenmoyuan ? {
        level1: buildDamageSummary(huashenmoyuan, 1),
      } : null,
      berserk: buildDamageSummary(skillsById.get(1001192), 1),
      bloodthirst: buildDamageSummary(skillsById.get(1001193), 1),
    },
  };
}

function extract() {
  console.log('\n🐵 角色 → 悟空数值');

  const roles = u.loadTable('role');
  const expAttributes = u.loadTable('expAttribute');
  const expRows = u.loadTable('exp');
  const skillRows = u.loadTable('skill');
  const skillLevelRows = u.loadTable('skillLevel');
  const buffRows = u.loadTable('buff');
  const beskillRows = u.loadTable('beskill');
  const passiveRows = u.loadTable('passiveSkill');
  const skillAwakenRows = u.loadTable('skillAwaken');

  const role = roles.find((entry) => entry.id === WUKONG_ROLE_ID);
  if (!role) {
    throw new Error('未找到悟空角色定义(id=1)');
  }

  const expByLevel = indexBy(expRows, 'level');
  const expStandards = expAttributes
    .filter((row) => Number.isFinite(Number(row.level)))
    .map((row) => {
      const standards = expByLevel.get(row.level);
      return {
        level: Number(row.level),
        base: {
          atk: Number(row.atk || 0),
          hp: Number(row.hp || 0),
          def: Number(row.def || 0),
          mp: Number(row.mp || 0),
          healHp: Number(row.healHp || 0),
          healMp: Number(row.healMp || 0),
          hitVal: Number(row.hitVal || 0),
          dodge: Number(row.dodge || 0),
          crit: Number(row.crit || 0),
          tenacity: Number(row.tenacity || 0),
          lucky: Number(row.lucky || 0),
          guardian: Number(row.guardian || 0),
          break: Number(row.break || 0),
          protect: Number(row.protect || 0),
        },
        standards: {
          exp: Number(standards?.exp || 0),
          phyDefStandard: Number(standards?.phyDefStandard || 0),
          commonStandard: Number(standards?.hitStandard || 0),
          dodgeStandard: Number(standards?.dodgeStandard || standards?.hitStandard || 0),
          criticalStandard: Number(standards?.criticalStandard || standards?.hitStandard || 0),
          toughnessStandard: Number(standards?.toughnessStandard || standards?.hitStandard || 0),
          luckyStandard: Number(standards?.luckyStandard || standards?.hitStandard || 0),
          guardianStandard: Number(standards?.guardianStandard || standards?.hitStandard || 0),
        },
      };
    })
    .sort((a, b) => a.level - b.level);

  const allWukongSkills = skillRows
    .filter((skill) => WUKONG_SKILL_GROUPS.includes(skill.groupId))
    .sort((left, right) => left.groupId - right.groupId || left.id - right.id);

  const skillLevelByPrefix = groupBy(skillLevelRows, (row) => Math.floor(row.id / 1000));
  const beskillById = indexBy(beskillRows, 'id');
  const buffById = indexBy(buffRows, 'id');
  const buffByGroup = groupBy(buffRows, (row) => row.group);
  const awakenBySkillId = groupBy(skillAwakenRows, (row) => row.skillId);
  const wukongPassives = passiveRows.filter((row) => row.roleType === WUKONG_ROLE_ID);
  const buildSkillPayload = buildSkillPayloadFactory({
    beskillById,
    buffById,
    buffByGroup,
    awakenBySkillId,
    skillLevelByPrefix,
  });

  const skillGroups = [...groupBy(allWukongSkills, (row) => row.groupId).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([groupId, groupSkills]) => {
      const sorted = [...groupSkills].sort((left, right) => left.id - right.id);
      const baseSkill = sorted[0];
      const awakenings = sorted.slice(1);
      return {
        groupId,
        name: baseSkill.desName || baseSkill.Name || `技能组 ${groupId}`,
        baseSkill: buildSkillPayload(baseSkill),
        awakenings: awakenings.map(buildSkillPayload),
      };
    });

  const passiveSkills = [...groupBy(wukongPassives, (row) => row.group).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([group, rows]) => ({
      group,
      name: rows[0].passiveName.replace(/2$/, ''),
      label: rows[0].label,
      levels: rows
        .sort((left, right) => left.level - right.level)
        .map((row) => {
          const beskillIds = row.beskillId || [];
          const makeUpIds = row.makeUpBeskillId
            ? Object.values(row.makeUpBeskillId).flat().filter((id) => typeof id === 'number')
            : [];
          const explicit = EXPLICIT_BUFF_LINKS[row.id] || [];
          const derived = [
            ...beskillIds.flatMap((id) => extractPossibleBuffRefs(id, beskillById.get(id), buffById, buffByGroup)),
            ...makeUpIds.flatMap((id) => extractPossibleBuffRefs(id, beskillById.get(id), buffById, buffByGroup)),
          ];
          return {
            id: row.id,
            level: row.level,
            roleLevel: row.roleLevel,
            passiveName: row.passiveName,
            text: row.text,
            unlockType: row.unlockType,
            number: cloneSimple(row.number),
            rankCost: cloneSimple(row.rankCost),
            beskillIds: cloneSimple(row.beskillId),
            makeUpBeskillId: cloneSimple(row.makeUpBeskillId),
            stageTypeNo: cloneSimple(row.stageTypeNo),
            beskills: beskillIds.map((id) => simplifyBeskill(beskillById.get(id))).filter(Boolean),
            makeUpBeskills: makeUpIds.map((id) => simplifyBeskill(beskillById.get(id))).filter(Boolean),
            buffs: collectReferencedBuffs([...explicit, ...derived], buffById, buffByGroup, new Set()),
          };
        }),
    }));

  const payload = {
    role: {
      id: role.id,
      name: role.name,
      makeupMonsterId: role.makeupMonsterId,
      baseMultipliers: {
        atk: role.atk,
        def: role.def,
        hp: role.hp,
        healHp: role.healHp,
        mp: role.mp,
        healMp: role.healMp,
        hitVal: role.hitVal,
        dodge: role.dodge,
        crit: role.crit,
        tenacity: role.tenacity,
        lucky: role.lucky,
        guardian: role.guardian,
        break: role.break,
        protect: role.protect,
      },
      resistances: {
        lightResist: role.lightResist,
        darkResist: role.darkResist,
        waterResist: role.waterResist,
        fireResist: role.fireResist,
        woodResist: role.woodResist,
        soilResist: role.soilResist,
        windResist: role.windResist,
        rayResist: role.rayResist,
      },
      text: role.text,
    },
    expStandards: {
      byLevel: expStandards,
    },
    skills: skillGroups,
    passiveSkills,
  };

  payload.verificationCases = buildVerificationCases(payload);

  u.saveOutput('role_wukong', payload, {
    system: '角色 → 悟空数值',
    sourceFiles: [
      'role.*.json',
      'expAttribute.*.json',
      'exp.*.json',
      'skill.*.json',
      'skillLevel.*.json',
      'buff.*.json',
      'beskill.*.json',
      'passiveSkill.*.json',
      'skillAwaken.*.json',
    ],
    note: '悟空三层数值导出，面向技能/被动数值核对。',
  });
}

if (require.main === module) extract();
module.exports = extract;
