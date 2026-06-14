/**
 * 角色 → 阵法系统
 * 提取叶子: 法器(升级/洗练/合成), 镇魂(升级/洗练/合成), 技能升级
 */
const u = require('../lib/utils');

const FRAME_RATE = 30;
const MATRIX_EFFECT_BUILDERS = {
  10001: buildTianjueEffect,
  10002: buildDilieEffect,
  10003: buildFenghouEffect,
  10004: buildHanbingEffect,
  10005: buildJinguangEffect,
  10006: buildHuaxueEffect,
  10007: buildLieyanEffect,
  10008: buildLuohunEffect,
  10009: buildHongshuiEffect,
  10010: buildHongshaEffect
};

function indexById(rows) {
  return new Map(rows.map(row => [row.id, row]));
}

function createEffectContext() {
  return {
    beskillById: indexById(u.loadTable('beskill')),
    skillById: indexById(u.loadTable('skill')),
    skillLevelRows: u.loadTable('skillLevel'),
    buffById: indexById(u.loadTable('buff'))
  };
}

function secondsFromFrames(frames) {
  if (typeof frames !== 'number') return null;
  return frames / FRAME_RATE;
}

function formatSeconds(seconds) {
  if (seconds == null) return '';
  return Number.isInteger(seconds) ? `${seconds} 秒` : `${Number(seconds.toFixed(2))} 秒`;
}

function formatFramesAsSeconds(frames) {
  return formatSeconds(secondsFromFrames(frames));
}

function formatPercent(value) {
  const percent = value * 100;
  return `${Number(percent.toFixed(2))}%`;
}

function getFirstBeSkill(group, context) {
  const firstBeSkillId = group.levels?.[0]?.beSkill?.[0];
  const row = context.beskillById.get(firstBeSkillId);
  if (!row) throw new Error(`阵法 ${group.matrixSkill} 缺少 beSkill ${firstBeSkillId}`);
  return row;
}

function getSkillLevelRows(context, skillIdPrefix) {
  const prefix = String(skillIdPrefix);
  const rows = context.skillLevelRows
    .filter(row => String(row.id).startsWith(prefix))
    .sort((a, b) => a.id - b.id);
  if (!rows.length) throw new Error(`缺少阵法技能等级数据: ${skillIdPrefix}`);
  return rows;
}

function getBuffGroupRows(context, groupId) {
  const rows = Array.from(context.buffById.values())
    .filter(row => row.group === groupId)
    .sort((a, b) => a.id - b.id);
  if (!rows.length) throw new Error(`缺少 Buff 组数据: ${groupId}`);
  return rows;
}

function getBuffLevelRows(context, firstBuffId, count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const id = firstBuffId + i;
    const row = context.buffById.get(id);
    if (!row) throw new Error(`缺少 Buff 等级数据: ${id}`);
    rows.push(row);
  }
  return rows;
}

function requireNumber(value, label) {
  if (typeof value !== 'number') throw new Error(`${label} 缺少数值`);
  return value;
}

function requirePathNumber(row, path, label) {
  let value = row;
  for (const key of path) value = value?.[key];
  return requireNumber(value, label);
}

function buildLevelTable(context, { title, skillIdPrefix, columns, values }) {
  return {
    title,
    columns,
    emptyText: '',
    rows: getSkillLevelRows(context, skillIdPrefix).map((row, index) => ({
      level: index + 1,
      values: values(row)
    }))
  };
}

function buildFixedTable({ title, columns, rows }) {
  return {
    title,
    columns,
    emptyText: '',
    rows
  };
}

function buildMatrixEffect(group, context) {
  const builder = MATRIX_EFFECT_BUILDERS[group.matrixSkill];
  return builder ? builder(group, context) : null;
}

function buildTianjueEffect(group, context) {
  const trigger = getFirstBeSkill(group, context);
  const chanceBeskill = context.beskillById.get(7006703);
  const paralysisBuff = context.buffById.get(chanceBeskill?.attribute?.buff?.[0]);
  if (!chanceBeskill || !paralysisBuff) throw new Error('天绝阵缺少麻木效果配置');

  return {
    name: '天绝阵',
    summary: `每 ${formatFramesAsSeconds(trigger.cd)} 自动落雷，攻击周围最多 6 个敌人，并有概率让敌人进入麻木状态。`,
    tags: ['范围落雷', '麻木控制', '自动触发'],
    cooldown: {
      display: `间隔 ${formatFramesAsSeconds(trigger.cd)}`
    },
    sections: [
      {
        title: '触发与目标',
        paragraphs: [
          `天绝阵每 ${formatFramesAsSeconds(trigger.cd)} 自动触发一次，对自身周围大范围内最多 6 个敌人落雷。`,
          `落雷命中后有 ${formatPercent(chanceBeskill.rate)} 概率附加麻木；麻木持续 ${formatFramesAsSeconds(paralysisBuff.time)}，期间每 ${formatFramesAsSeconds(paralysisBuff.interval)} 造成一次短暂僵直。`
        ]
      },
      {
        title: '升级变化',
        paragraphs: [
          '升级提升落雷伤害值；伤害系数固定为 200%，麻木概率、持续时间和触发间隔不随等级变化。'
        ]
      }
    ],
    growthTables: [
      buildLevelTable(context, {
        title: '天绝阵等级成长属性表',
        skillIdPrefix: 217010103,
        columns: ['落雷伤害值', '伤害系数'],
        values: row => [String(row.damageAddVal), formatPercent(row.TriggerFactor)]
      })
    ]
  };
}

function buildDilieEffect(group, context) {
  const trigger = getFirstBeSkill(group, context);
  const burnBuff = context.buffById.get(1012701);
  if (!burnBuff) throw new Error('地烈阵缺少史诗灼烧配置');

  return {
    name: '地烈阵',
    summary: `每 ${formatFramesAsSeconds(trigger.cd)} 在周围随机 3 名敌人脚下喷出地烈火，命中后附加持续灼烧。`,
    tags: ['随机目标', '地火喷发', '灼烧'],
    cooldown: {
      display: `间隔 ${formatFramesAsSeconds(trigger.cd)}`
    },
    sections: [
      {
        title: '触发与目标',
        paragraphs: [
          `地烈阵每 ${formatFramesAsSeconds(trigger.cd)} 自动触发一次，在自身周围随机 3 名敌人脚下喷出地烈火。`,
          `地烈火命中后附加灼烧；史诗品质下，灼烧持续 ${formatFramesAsSeconds(burnBuff.time)}，每 ${formatFramesAsSeconds(burnBuff.interval)} 结算一次。`
        ]
      },
      {
        title: '升级变化',
        paragraphs: [
          '升级提升地烈火伤害值；伤害系数固定为 300%，触发间隔、目标数和灼烧持续时间不随等级变化。'
        ]
      }
    ],
    growthTables: [
      buildLevelTable(context, {
        title: '地烈阵等级成长属性表',
        skillIdPrefix: 217020107,
        columns: ['地烈火伤害值', '伤害系数'],
        values: row => [String(row.damageAddVal), formatPercent(row.TriggerFactor)]
      })
    ]
  };
}

function buildFenghouEffect(group, context) {
  const trigger = getFirstBeSkill(group, context);
  const skillRows = getSkillLevelRows(context, 217030103);
  const armorBreakBuffs = getBuffLevelRows(context, 6002901, skillRows.length);
  if (skillRows.length !== armorBreakBuffs.length) {
    throw new Error(`风吼阵技能等级数量(${skillRows.length})与破甲 Buff 数量(${armorBreakBuffs.length})不一致`);
  }
  const armorBreakBuff = armorBreakBuffs[0];
  const armorBreakValue = buff => {
    return Math.abs(requirePathNumber(buff, ['value', 1], `风吼阵破甲 Buff ${buff.id}`));
  };

  return {
    name: '风吼阵',
    summary: `每 ${formatFramesAsSeconds(trigger.cd)} 召唤 8 道风刃追击周围敌人，命中后降低敌人防御。`,
    tags: ['追踪风刃', '破甲', '自动触发'],
    cooldown: {
      display: `间隔 ${formatFramesAsSeconds(trigger.cd)}`
    },
    sections: [
      {
        title: '触发与目标',
        paragraphs: [
          `风吼阵每 ${formatFramesAsSeconds(trigger.cd)} 自动触发一次，召唤 8 道风刃追击周围敌人。`,
          `风刃命中后附加破甲；史诗品质下，破甲持续 ${formatFramesAsSeconds(armorBreakBuff.time)}，防御降低数值随技能等级提升。`
        ]
      },
      {
        title: '升级变化',
        paragraphs: [
          '升级同时提升风刃伤害值和破甲降低防御值；伤害系数固定为 80%，风刃数量、破甲持续时间和触发间隔不随等级变化。'
        ]
      }
    ],
    growthTables: [
      {
        title: '风吼阵等级成长属性表',
        columns: ['风刃伤害值', '伤害系数', '防御降低'],
        emptyText: '',
        rows: skillRows.map((row, index) => ({
          level: index + 1,
          values: [
            String(row.damageAddVal),
            formatPercent(row.TriggerFactor),
            String(armorBreakValue(armorBreakBuffs[index]))
          ]
        }))
      }
    ]
  };
}

function buildHanbingEffect(group, context) {
  const trigger = getFirstBeSkill(group, context);
  const slowBuff = context.buffById.get(4032301);
  if (!slowBuff) throw new Error('寒冰阵缺少史诗减速配置');
  const slowPercent = formatPercent(Math.abs(requirePathNumber(slowBuff, ['value', 0], '寒冰阵减速 Buff')));

  return {
    name: '寒冰阵',
    summary: `每 ${formatFramesAsSeconds(trigger.cd)} 在自身周围生成冰环，对范围内敌人造成持续伤害并降低移动能力。`,
    tags: ['冰环', '持续伤害', '减速'],
    cooldown: {
      display: `间隔 ${formatFramesAsSeconds(trigger.cd)}`
    },
    sections: [
      {
        title: '触发与范围',
        paragraphs: [
          `寒冰阵每 ${formatFramesAsSeconds(trigger.cd)} 自动触发一次，在自身周围生成冰环。`,
          '技能说明写明冰环持续 5 秒，每秒对冰环内敌人造成伤害，并降低移动速度和跳跃力。'
        ]
      },
      {
        title: '减速与升级',
        paragraphs: [
          `冰环内会持续刷新减速效果；史诗品质下，移速降低 ${slowPercent}。`,
          '升级提升冰环伤害值；伤害系数固定为 120%，触发间隔和移速降低比例不随等级变化。'
        ]
      }
    ],
    growthTables: [
      buildLevelTable(context, {
        title: '寒冰阵等级成长属性表',
        skillIdPrefix: 217040103,
        columns: ['冰环伤害值', '伤害系数'],
        values: row => [String(row.damageAddVal), formatPercent(row.TriggerFactor)]
      })
    ],
    warnings: [
      '寒冰阵说明包含跳跃力下降，但当前只能确认移速降低的可量化数值；跳跃力下降未填入具体百分比。'
    ]
  };
}

function buildJinguangEffect(group, context) {
  const trigger = getFirstBeSkill(group, context);

  return {
    name: '金光阵',
    summary: `每 ${formatFramesAsSeconds(trigger.cd)} 从自身发射光束，光束会在敌人之间弹射 8 次。`,
    tags: ['弹射光束', '多目标', '自动触发'],
    cooldown: {
      display: `间隔 ${formatFramesAsSeconds(trigger.cd)}`
    },
    sections: [
      {
        title: '触发与目标',
        paragraphs: [
          `金光阵每 ${formatFramesAsSeconds(trigger.cd)} 自动触发一次，从自身发射一道光束。`,
          '光束会在敌人堆之间弹射 8 次，适合敌人聚集时打多目标伤害。'
        ]
      },
      {
        title: '升级变化',
        paragraphs: [
          '升级提升光束伤害值；伤害系数固定为 75%，弹射次数和触发间隔不随等级变化。'
        ]
      }
    ],
    growthTables: [
      buildLevelTable(context, {
        title: '金光阵等级成长属性表',
        skillIdPrefix: 217050104,
        columns: ['光束伤害值', '伤害系数'],
        values: row => [String(row.damageAddVal), formatPercent(row.TriggerFactor)]
      })
    ]
  };
}

function buildHuaxueEffect(group, context) {
  const trigger = getFirstBeSkill(group, context);
  const skillRows = getSkillLevelRows(context, 217060104);
  const bleedBuffs = getBuffLevelRows(context, 1036001, skillRows.length);
  const bleedBuff = bleedBuffs[0];
  const bleedDamage = buff => Math.abs(requirePathNumber(buff, ['value', 0, 1], `化血阵流血 Buff ${buff.id}`));

  return {
    name: '化血阵',
    summary: `每 ${formatFramesAsSeconds(trigger.cd)} 释放 5 个黑砂环绕自身，触碰敌人后叠加持续流血。`,
    tags: ['环绕黑砂', '流血', '可叠加'],
    cooldown: {
      display: `间隔 ${formatFramesAsSeconds(trigger.cd)}`
    },
    sections: [
      {
        title: '触发与黑砂',
        paragraphs: [
          `化血阵每 ${formatFramesAsSeconds(trigger.cd)} 自动触发一次，释放 5 个黑砂旋转环绕自己。`,
          '黑砂触碰周围敌人后附加黑砂化血；黑砂本体最长存在 10 秒，也会在达到命中次数上限后消失。'
        ]
      },
      {
        title: '流血与升级',
        paragraphs: [
          `黑砂化血持续 ${formatFramesAsSeconds(bleedBuff.time)}，每 ${formatFramesAsSeconds(bleedBuff.interval)} 结算一次，每层流血伤害随技能等级提升，最多叠加 ${bleedBuff.maxPiles} 层。`,
          '升级提升每层流血伤害；黑砂命中伤害系数固定为 9%，固定伤害值为 1。'
        ]
      }
    ],
    growthTables: [
      {
        title: '化血阵等级成长属性表',
        columns: ['黑砂命中伤害值', '命中伤害系数', '每层流血伤害'],
        emptyText: '',
        rows: skillRows.map((row, index) => ({
          level: index + 1,
          values: [
            String(row.damageAddVal),
            formatPercent(row.TriggerFactor),
            String(bleedDamage(bleedBuffs[index]))
          ]
        }))
      },
      buildFixedTable({
        title: '化血阵固定效果参数',
        columns: ['黑砂数量', '黑砂最长存在', '流血持续', '流血间隔', '最大层数'],
        rows: [
          {
            label: '固定值',
            values: ['5', '10秒', formatFramesAsSeconds(bleedBuff.time), formatFramesAsSeconds(bleedBuff.interval), String(bleedBuff.maxPiles)]
          }
        ]
      })
    ],
    warnings: [
      '化血阵技能简介写有 32 秒间隔，但阵法触发冷却为 30 秒；页面按实际触发冷却显示。'
    ]
  };
}

function buildLieyanEffect(group, context) {
  const trigger = getFirstBeSkill(group, context);
  const skillRows = getSkillLevelRows(context, 217070104);
  const burnBuffs = getBuffLevelRows(context, 1042801, skillRows.length);
  const burnBuff = burnBuffs[0];
  const burnDamage = buff => Math.abs(requirePathNumber(buff, ['value', 0, 1], `烈焰阵灼烧 Buff ${buff.id}`));

  return {
    name: '烈焰阵',
    summary: `自身附近有敌人时，每 ${formatFramesAsSeconds(trigger.cd)} 对周围随机目标落下火石并附加持续灼烧。`,
    tags: ['范围检测', '火石砸击', '灼烧'],
    cooldown: {
      display: `间隔 ${formatFramesAsSeconds(trigger.cd)}`
    },
    sections: [
      {
        title: '触发与目标',
        paragraphs: [
          `烈焰阵会检测自身附近宽约 ${trigger.attribute.width}、高约 ${trigger.attribute.height} 的区域；区域内有敌人时才进入释放流程。`,
          `触发后每 ${formatFramesAsSeconds(trigger.cd)} 对周围随机 5 名目标落下火石，落地后继续产生二段火焰冲击。`
        ]
      },
      {
        title: '灼烧与升级',
        paragraphs: [
          `传说品质下，命中后附加 ${formatFramesAsSeconds(burnBuff.time)} 灼烧，每 ${formatFramesAsSeconds(burnBuff.interval)} 结算一次，灼烧每秒伤害随技能等级提升。`,
          '升级同时提升火石砸击伤害值和灼烧每秒伤害；伤害系数固定为 40.9%，检测范围、目标数和灼烧持续时间不随等级变化。'
        ]
      }
    ],
    growthTables: [
      {
        title: '烈焰阵等级成长属性表',
        columns: ['火石伤害值', '伤害系数', '每秒灼烧伤害'],
        emptyText: '',
        rows: skillRows.map((row, index) => ({
          level: index + 1,
          values: [
            String(row.damageAddVal),
            formatPercent(row.TriggerFactor),
            String(burnDamage(burnBuffs[index]))
          ]
        }))
      }
    ],
    warnings: [
      '烈焰阵技能简介提到治疗反噬，但当前能确认的命中效果是灼烧；未填治疗反噬数值。'
    ]
  };
}

function buildLuohunEffect(group, context) {
  const trigger = getFirstBeSkill(group, context);
  const silenceBuff = context.buffById.get(20005401);
  const skillRows = getSkillLevelRows(context, 217080103);
  const weakBuffs = getBuffLevelRows(context, 5010101, skillRows.length);
  if (!silenceBuff) throw new Error('落魂阵缺少沉默配置');
  const weakValue = buff => Math.abs(requirePathNumber(buff, ['value', 1], `落魂阵虚弱 Buff ${buff.id}`));

  return {
    name: '落魂阵',
    summary: `受击和受控会累计落魂充能，充满后震开周围敌人，并锁定敌人施加虚弱与沉默。`,
    tags: ['受击充能', '震开', '虚弱沉默'],
    cooldown: {
      display: `恢复 ${formatFramesAsSeconds(trigger.chargedCd)}`
    },
    sections: [
      {
        title: '充能与触发',
        paragraphs: [
          `落魂阵需要先累计到 ${trigger.attribute.maxVal} 点充能；受击来源不同，计入值不同：玩家 ${trigger.attribute.modifyVal[0]}、首领 ${trigger.attribute.modifyVal[1]}、怪物 ${trigger.attribute.modifyVal[2]}、宝藏首领 ${trigger.attribute.modifyVal[3]}。`,
          `处于受控状态时，${formatFramesAsSeconds(trigger.attribute.inCtrlMaxFrame)} 内最多额外计入 ${trigger.attribute.inCtrlMaxVal} 点。技能最多保留 ${trigger.chargedNumber} 次触发机会，触发机会每 ${formatFramesAsSeconds(trigger.chargedCd)} 恢复 1 次。`
        ]
      },
      {
        title: '释放效果',
        paragraphs: [
          '充能满后会震开周围敌人，并在范围内锁定最多 6 名敌人施加虚弱。技能说明写明虚弱持续 10 秒。',
          `传说品质下还能确认沉默效果，沉默持续 ${formatFramesAsSeconds(silenceBuff.time)}；虚弱效果会降低敌人造成的伤害，降低值随技能等级提升。`
        ]
      }
    ],
    growthTables: [
      {
        title: '落魂阵等级成长属性表',
        columns: ['虚弱降低伤害'],
        emptyText: '',
        rows: skillRows.map((row, index) => ({
          level: index + 1,
          values: [String(weakValue(weakBuffs[index]))]
        }))
      },
      buildFixedTable({
        title: '落魂阵固定充能参数',
        columns: ['充能上限', '玩家计入', '首领计入', '怪物计入', '宝藏首领计入', '受控计入上限', '触发机会恢复'],
        rows: [
          {
            label: '固定值',
            values: [
              String(trigger.attribute.maxVal),
              String(trigger.attribute.modifyVal[0]),
              String(trigger.attribute.modifyVal[1]),
              String(trigger.attribute.modifyVal[2]),
              String(trigger.attribute.modifyVal[3]),
              `${trigger.attribute.inCtrlMaxVal}/${formatFramesAsSeconds(trigger.attribute.inCtrlMaxFrame)}`,
              formatFramesAsSeconds(trigger.chargedCd)
            ]
          }
        ]
      })
    ]
  };
}

function buildHongshuiEffect(group, context) {
  const rows = group.levels.map(level => context.beskillById.get(level.beSkill?.[0]));
  if (rows.some(row => !row)) throw new Error('红水阵缺少血球等级配置');
  const first = rows[0];
  const firstRegenBuff = context.buffById.get(first.attribute.doValBuffs[1]);
  const buffDuration = firstRegenBuff?.time;
  if (!firstRegenBuff) throw new Error('红水阵缺少回血属性 Buff 配置');

  return {
    name: '红水阵',
    summary: '生成跟随自身的充能血球，在自身低血量或达到已损失生命阈值时破裂释放，提供瞬间治疗与持续 30 秒的回血属性提升。',
    tags: ['防御回复', '伤害吸收', '血球充能'],
    cooldown: {
      display: `重置 ${formatFramesAsSeconds(first.attribute.cd)} / 恢复 ${formatFramesAsSeconds(first.chargedCd)}`
    },
    sections: [
      {
        title: '血球与充能',
        paragraphs: [
          `红水阵会在角色身边生成一颗跟随自身的血球。血球会吸收范围内单位受到的伤害来充能：玩家单位掉血按 ${formatPercent(first.attribute.selfRate)} 计入，非玩家单位掉血按 ${formatPercent(first.attribute.otherRate)} 计入；PVP 场景配置为 ${first.attribute.pvpRate} 倍计入。吸收范围为自身附近矩形区域，约为左右各 ${Math.abs(first.attribute.range[0])}、下方 ${Math.abs(first.attribute.range[1])}、上方 ${first.attribute.range[3] - Math.abs(first.attribute.range[1])}。`
        ]
      },
      {
        title: '释放与冷却',
        paragraphs: [
          `血球充满后不会立刻释放。只有当自己血量较低时才会破裂回血：自身血量低于 ${formatPercent(first.attribute.minPerDoVal)}，或已损失生命达到当前等级的触发缺血阈值时，血球会破裂，立即恢复生命，并获得持续 ${formatFramesAsSeconds(buffDuration)}的回血属性提升。`,
          `血球破裂后会在 ${formatFramesAsSeconds(first.attribute.cd)}后重新生成；技能最多保留 ${first.chargedNumber} 次触发机会，触发机会每 ${formatFramesAsSeconds(first.chargedCd)}恢复 1 次。升级主要提升触发缺血阈值、每秒吸收上限、瞬间治疗量和回血属性加成。`
        ]
      }
    ],
    growthTables: [
      {
        title: '红水阵等级成长属性表',
        columns: ['触发缺血阈值', '每秒吸收上限', '瞬间治疗', '回血属性提升'],
        emptyText: '',
        rows: rows.map((row, index) => {
          const healBuff = context.buffById.get(row.attribute.doValBuffs[0]);
          const regenBuff = context.buffById.get(row.attribute.doValBuffs[1]);
          if (!healBuff || !regenBuff) throw new Error(`红水阵等级 ${index + 1} 缺少治疗或回血属性 Buff`);
          return {
            level: index + 1,
            values: [
              String(row.attribute.maxVal),
              String(row.attribute.suckValInFrameMax[1]),
              String(healBuff.value?.[0]?.[1]),
              String(regenBuff.value?.[1])
            ]
          };
        })
      }
    ]
  };
}

function buildHongshaEffect(group, context) {
  const trigger = getFirstBeSkill(group, context);
  const crippleBuff = context.buffById.get(255002401);
  if (!crippleBuff) throw new Error('红砂阵缺少技能位移效率降低配置');
  const cripplePercent = formatPercent(Math.abs(requirePathNumber(crippleBuff, ['value', 'per'], '红砂阵致残 Buff')));

  return {
    name: '红砂阵',
    summary: `保护分倒地时凝聚红砂助战，敌人靠近会自动下砸击飞，并生成持续伤害法阵。`,
    tags: ['保护分触发', '红砂助战', '击飞法阵'],
    cooldown: {
      display: `恢复 ${formatFramesAsSeconds(trigger.chargedCd)}`
    },
    sections: [
      {
        title: '触发与红砂',
        paragraphs: [
          `红砂阵在保护分倒地时触发，最多保留 ${trigger.chargedNumber} 次触发机会，触发机会每 ${formatFramesAsSeconds(trigger.chargedCd)} 恢复 1 次。`,
          `触发后会在自身头顶凝聚红砂助战，持续 ${trigger.attribute.time} 秒；敌人靠近时，红砂会自动下砸并击飞敌人。`
        ]
      },
      {
        title: '法阵与升级',
        paragraphs: [
          `红砂下砸后会生成法阵，对法阵内敌人持续造成伤害，并降低敌人的技能位移效率；传说品质下，技能位移效率降低 ${cripplePercent}，持续 ${formatFramesAsSeconds(crippleBuff.time)}。`,
          '升级提升红砂裂地伤害值；伤害系数固定为 900%，技能位移效率降低比例、触发机会数量和恢复时间不随等级变化。'
        ]
      }
    ],
    growthTables: [
      buildLevelTable(context, {
        title: '红砂阵等级成长属性表',
        skillIdPrefix: 217100104,
        columns: ['红砂伤害值', '伤害系数'],
        values: row => [String(row.damageAddVal), formatPercent(row.TriggerFactor)]
      })
    ]
  };
}

// ━━━ 法器/镇魂通用提取 ━━━ matrixCore.*.json ━━━━━━━
function extractMatrixCoreByType(groupTypeFilter, outputName, typeName) {
  const raw = u.loadTable('matrixCore');
  const typeRows = raw.filter(r => r.groupType === groupTypeFilter);
  const maxQualityByMatrix = new Map();
  for (const r of typeRows) {
    const old = maxQualityByMatrix.get(r.matrix);
    if (old == null || r.quality > old) maxQualityByMatrix.set(r.matrix, r.quality);
  }
  const filtered = typeRows.filter(r => r.quality === maxQualityByMatrix.get(r.matrix));
  // 按品质分组
  const byQuality = {};
  for (const r of filtered) {
    const q = r.quality;
    if (!byQuality[q]) byQuality[q] = { quality: q, records: [] };
    byQuality[q].records.push({
      id: r.id, name: r.name, group: r.group, matrix: r.matrix,
      // 升级消耗
      upLevelCost: u.parseCost(r.upLevelCost),
      // 洗练消耗
      clearCost: u.parseCost(r.clearCost),
      lockClear: u.parseCost(r.lockClear),
      luckClear: r.luckClear ? Object.fromEntries(
        Object.entries(r.luckClear).map(([lockNum, cost]) => [
          lockNum, { itemId: cost[0], name: u.itemName(cost[0]), count: cost[1] }
        ])
      ) : null,
      // 合成/分解
      sellCost: u.parseCost(r.sellCost),
      sellRatio: r.sellRatio,
      // 属性
      attribute: r.attribute,
      attributeBase: r.attributeBase,
      levelLimit: r.levelLimit
    });
  }
  u.saveOutput(outputName, Object.values(byQuality), {
    system: `角色 → 阵法系统 → ${typeName} → 升级/洗练/合成`,
    source: `matrixCore.*.json (groupType=${groupTypeFilter})`,
    costType: [
      `升级: upLevelCost(先天之气200000013)`,
      `洗练: clearCost(普通)/lockClear(锁定)/luckClear(强运·阵法27)`,
      `合成: sellCost`
    ].join('; '),
    dedup: `按品质(quality)分组; 每个阵法仅保留最高品质(原始${typeRows.length}条→保留${filtered.length}条)`
  });
}

// ━━━ 法器 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractMatrixFQ() {
  extractMatrixCoreByType(1, 'role_matrix_fq', '法器');
}

// ━━━ 镇魂 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractMatrixZH() {
  // 镇魂 groupType 不为1的其他类型
  const raw = u.loadTable('matrixCore');
  const groupTypes = [...new Set(raw.map(r => r.groupType))].filter(t => t !== 1);
  for (const gt of groupTypes) {
    extractMatrixCoreByType(gt, `role_matrix_zh_type${gt}`, `镇魂(type${gt})`);
  }
  // 如果只有 groupType=1 和另一个, 输出一个统一名
  if (groupTypes.length === 1) {
    // 重命名: 将 role_matrix_zh_typeX 改为 role_matrix_zh
    const fs = require('fs');
    const path = require('path');
    const src = path.join(u.OUTPUT_DIR, `role_matrix_zh_type${groupTypes[0]}.json`);
    const dst = path.join(u.OUTPUT_DIR, 'role_matrix_zh.json');
    if (fs.existsSync(src)) fs.renameSync(src, dst);
  }
}

// ━━━ 阵法技能 ━━━ matrixSkill.*.json ━━━━━━━━━━━━━━
function extractMatrixSkill() {
  const raw = u.loadTable('matrixSkill');
  const effectContext = createEffectContext();
  const maxQualityBySkill = new Map();
  for (const r of raw) {
    const old = maxQualityBySkill.get(r.matrixSkill);
    if (old == null || r.quality > old) maxQualityBySkill.set(r.matrixSkill, r.quality);
  }
  const filtered = raw.filter(r => r.quality === maxQualityBySkill.get(r.matrixSkill));
  // 按 matrixSkill + quality 分组
  const groups = {};
  for (const r of filtered) {
    const key = `${r.matrixSkill}_q${r.quality}`;
    if (!groups[key]) {
      groups[key] = {
        matrixSkill: r.matrixSkill,
        quality: r.quality,
        desName: r.desName,
        icon: r.icon,
        levels: []
      };
    }
    groups[key].levels.push({
      id: r.id, level: r.level,
      nextCost: u.parseCost(r.nextCost),
      upLimit: r.upLimit,
      beSkill: r.beSkill
    });
  }
  const records = Object.values(groups).map(group => {
    group.levels.sort((a, b) => a.level - b.level);
    group.effect = buildMatrixEffect(group, effectContext);
    return group;
  });
  u.saveOutput('role_matrix_skill', records, {
    system: '角色 → 阵法系统 → 技能 → 升级',
    source: 'matrixSkill.*.json; beskill.*.json; skillLevel.*.json; buff.*.json',
    costType: '阵图碎片 nextCost:[[200000011, count]]',
    dedup: `按 matrixSkill×quality 分组; 每个技能仅保留最高品质(原始${raw.length}条→保留${filtered.length}条)`
  });
}

function extract() {
  console.log('\n📦 角色 → 阵法系统');
  extractMatrixFQ();
  extractMatrixZH();
  extractMatrixSkill();
}

if (require.main === module) extract();
module.exports = extract;
