/** 黄龙专项解析：只读黄龙配置，分支技能不叠加，治疗不作为伤害样本。 */
const u = require('../lib/utils');
const eng = require('./lib/skill-engine');
const { computeFirstHitBulletSegments } = require('./lib/ride-skill-engine');

const index = (rows) => new Map(rows.map((row) => [row.id, row]));
const round = (n) => Math.round(n * 1e6) / 1e6;
const pct = (n) => `${round(n * 100)}%`;
const gainPct = (n) => `${Number((n * 100).toFixed(2))}%`;
const metric = (key, label, value, display = round(value)) => ({ key, label, value: round(value), display });

function required(map, id, table) {
  const row = map.get(id);
  if (!row) throw new Error(`黄龙解析缺少 ${table} ${id}`);
  return row;
}

function damageSegments(row, bullet, count = 1) {
  // 非伤害判定也会递增 hitIdx，必须保留它在伤害数组中的位置。
  const hits = (bullet.com || []).filter((com) => com.type === 1)
    .sort((a, b) => a.t - b.t);
  return hits.flatMap((com, i) => com.isNotDamage ? [] : [{
    per: row.bulletDamageAddPer?.[0]?.[i] ?? row.damageAddPer,
    val: row.bulletDamageAddVal?.[0]?.[i] ?? row.damageAddVal,
    maxHit: (com.maxHit || 1) * count,
    from: `bullet:${bullet.id}@${com.t}`,
  }]);
}

function extract() {
  const ctx = {
    rides: index(u.loadTable('ride')), monsters: index(u.loadTable('monster')),
    skills: index(u.loadTable('skill')), levels: index(u.loadTable('skillLevel')),
    buffs: index(u.loadTable('buff')), passives: index(u.loadTable('beskill')),
    riding: u.loadTable('riding'),
  };
  const passive = (id) => required(ctx.passives, id, 'beskill').attribute;
  const buff = (id) => required(ctx.buffs, id, 'buff');
  const wet = buff(136028201);
  const base = passive(7084051), riding = passive(7084071);
  const water = passive(7084052), waterRide = passive(7084072);
  const electric = passive(7084058), electricRide = passive(7084078);
  const healBuff = buff(1071701);
  const healRatio = healBuff.value[0][6];
  const decay = passive(7084062).valPers.map((value) => 1 + value);
  const count = decay.length;
  const healScale = decay.reduce((sum, value) => sum + value, 0);
  const referenceRide = required(ctx.rides, 201902, 'ride');
  const referenceMonster = required(ctx.monsters, referenceRide.monsterId, 'monster');
  const referenceCfg = eng.loadEntityCfg(referenceMonster.cfgFile);
  const referenceBase = passive(7084007), referenceRiding = passive(7084021);
  const referenceWet = buff(136027801);
  const descriptions = {
    20635030001: '向前释放水刃，造成一段水属性伤害。地面和飞行时均可使用；身后有水球时，普攻会带动水球追击敌人。',
    20635030101: '展开双翼，在周身形成电网攻击并麻木敌人。电网尚未命中时，可再次按键，将其压缩为雷球向前发射。',
    20635030201: '化作闪电向前冲刺，期间大幅提升闪避。长按可继续消耗独立能量，延长位移。',
    20635030301: '召唤六颗跟随水球。再次按键可治疗附近生命比例较低的友方，也可以通过普攻或无双将水球转为水钻头追击敌人。',
    20635030303: '身后有水球时，普攻或无双带动六颗水球转为水钻头，向前方敌人发起追击。',
    20635030401: '进入飞行姿态并积蓄雷能，松开按键释放雷柱。蓄力越久，雷柱伤害和范围越大，吐息可推退霸体敌人。',
    20635030501: '神瑞帝龙跃起盘旋，以龙形江流聚拢敌人，持续攻击后引发水爆。',
    20635030601: '二段跳后再次按跳跃键进入飞行，可在空中自由移动，落地后恢复地面姿态。',
    20635030602: '持续积蓄雨力。蓄雨越充足，骑乘时的回血、攻击、闪避加成越高，技能冷却与充能越快。水属性攻击附加雨湿，雷属性攻击消耗雨湿造成电击。',
    20635030603: '强化蓄雨容量、回复和属性加成，提高水雷连招效果，并额外继承角色的生命、闪避、攻击和暴击。',
  };
  const waterText = (skillId, hits) => {
    const [cost, piles] = water.consumeValues[skillId];
    const [rideCost, ridePiles] = waterRide.consumeValues[skillId];
    return `每次使用消耗 ${cost} 点蓄雨，每次命中附加 ${piles} 层雨湿，${hits} 段全中共 ${hits * piles} 层。解锁骑术后，每次使用消耗 ${rideCost} 点，每次命中附加 ${ridePiles} 层，全中共 ${hits * ridePiles} 层。蓄雨按整次攻击扣除一次；蓄雨不足时，保留攻击伤害，暂停附加雨湿。`;
  };
  const electricText = (skillId) => {
    const cap = electric.maxReadPilesSkills[skillId] ?? electric.maxReadPiles;
    const rideCap = electricRide.maxReadPilesSkills[skillId] ?? electricRide.maxReadPiles;
    return `命中带有雨湿的敌人时，消耗其雨湿追加电击伤害，每层相当于 ${pct(electric.per)} 基础攻击力。单次最多消耗 ${cap} 层，追加伤害最高 ${pct(cap * electric.per)}；解锁骑术后最多消耗 ${rideCap} 层，最高 ${pct(rideCap * electricRide.per)}。实际电击伤害随敌人当前雨湿层数变化。`;
  };
  const rainText = `蓄雨初始 ${base.initVal} 点，上限 ${base.maxVal} 点，每秒回复 ${round(base.addVal * 30)} 点。解锁骑术后，初始与上限均为 ${riding.maxVal} 点，每秒回复 ${round(riding.addVal * 30)} 点。相比神天应龙的 ${referenceBase.maxVal} / ${referenceRiding.maxVal} 点，容量与回复速度均翻倍。`;
  const wetText = `每个敌人最多叠加 ${wet.maxPiles} 层雨湿，比神天应龙的 ${referenceWet.maxPiles} 层增加 ${wet.maxPiles - referenceWet.maxPiles} 层。雨湿每隔 ${wet.time} 帧（约 ${round(wet.time / 30)} 秒）减少一层。解锁骑术前后，敌人的雨湿上限均为 ${wet.maxPiles} 层。`;
  const propsText = (id) => passive(id).map(([name, per]) => `${({ healHp: '回血', healMp: '回魔', atk: '攻击', dodge: '闪避' })[name]} +${pct(per)}`).join('、');

  function buildVariant(rideId) {
    const ride = required(ctx.rides, rideId, 'ride');
    const monster = required(ctx.monsters, ride.monsterId, 'monster');
    const cfg = eng.loadEntityCfg(monster.cfgFile);
    if (!cfg?.skill3_1 || !cfg?.time) throw new Error(`缺少最新黄龙动作资源 ${monster.cfgFile}`);
    const spawnCount = cfg.skill3_1.com.find((com) => com.type === 58 && !com.notActive)?.count;
    if (spawnCount !== count) throw new Error(`黄龙水球数量 ${spawnCount} 与治疗衰减数组 ${count} 不一致`);
    const slots = [];

    function card(skillId, slot, slotLabel, slotKind) {
      const skill = required(ctx.skills, skillId, 'skill');
      const isPassive = slotKind === 'passive';
      const isHeal = skillId === 20635030301;
      const isChase = skillId === 20635030303;
      const isCharge = skillId === 20635030401;
      const damageId = isCharge ? 20635030403 : skillId;
      const damageSkill = required(ctx.skills, damageId, 'skill');
      const maxLevel = isPassive ? 1 : eng.detectMaxLevel(damageSkill, ctx.levels);
      if (!maxLevel) throw new Error(`缺少黄龙技能成长 ${damageId}`);
      let frames = isPassive || isChase ? null : cfg.time[skill.entityAction] ?? null;
      let timeSource = frames == null ? 'effectOnly' : 'entityCtg.time';
      if (isChase) timeSource = 'triggeredChase';
      if (isCharge) {
        // 无蓄力分母也必须包含起手 + 吐息，不能拿 13 帧起手除以整套伤害。
        frames = cfg.time.skill4_1 + cfg.time.skill4_3;
        timeSource = 'sequence:skill4_1+skill4_3';
      }
      if (skillId === 20635030201) {
        const release = cfg.skill2_1.com.find((com) => com.type === 134 && !com.notActive);
        const endFrames = Object.keys(release).filter((key) => /^frames\d+$/.test(key)).map((key) => release[key][1]);
        // type134 在区间末帧直接 releaseSkill 切入收招，原动作不会继续播到动画末帧。
        frames = Math.max(...endFrames) + cfg.time.skill2_3;
        timeSource = 'sequence:skill2_1+skill2_3';
      }
      const seconds = frames == null ? null : frames / 30;
      const mechanics = [];
      const add = (label, value) => mechanics.push({ label, value });
      let bulletId = null;
      const dashBullets = skillId === 20635030201
        ? cfg.skill2_1.com.filter((com) => com.type === 2 && !com.notActive).map((com) => com.bId)
        : [];
      if (slotKind === 'attack') {
        add('水刃与追击', `水刃对单个敌人造成 1 段 220% 水属性伤害。身后有水球时，带动 ${count} 颗水钻头追击，追击的伤害与治疗选择见「瑞汐凝珠」。`);
        add('消耗蓄雨', waterText(skillId, 1));
        add('相比神天应龙', '普攻的攻击倍率相同，单次附加雨湿由 4 层提高至 7 层；解锁骑术后由 5 层提高至 9 层，增加 80%。');
      } else if (skillId === 20635030101) {
        bulletId = cfg.skill1_1.com.find((com) => com.type === 2 && !com.notActive).bId;
        const currentBullet = eng.getBullet(bulletId, []);
        const referenceBullet = eng.getBullet(referenceCfg.skill1_1.com.find((com) => com.type === 2 && !com.notActive).bId, []);
        const hitRect = Object.values(currentBullet.rect).find(Array.isArray);
        const currentSize = round(hitRect[2] * currentBullet.viewScaleX);
        const referenceSize = round(hitRect[2] * referenceBullet.viewScaleX);
        add('电网与雷球', '电网共 5 段，每段 74.8%，总攻击倍率 374%。电网尚未命中时，可再次按键射出雷球，改为从远处攻击；雷球同样最多命中 5 次，总攻击倍率 374%。');
        add('相比神天应龙', `电网的实际命中范围由 ${referenceSize}×${referenceSize} 扩大至 ${currentSize}×${currentSize}（游戏距离单位），宽、高各增加 ${gainPct(currentSize / referenceSize - 1)}，新增向前发射雷球的用法。未解锁骑术时，单次引爆雨湿上限由 65 层提高至 130 层；解锁骑术后两者均为 183 层。`);
        const numb = buff(114005301);
        const numbEffect = numb.value && typeof numb.value === 'object' && numb.value.type === 1
          ? `使敌人${buff(numb.value.tempBuffId).name} ${round(numb.value.val / 30)} 秒，实际控制时间受抗性影响`
          : `使可受控的敌人僵直 ${numb.value} 秒`;
        add('麻木', `首次命中施加麻木，持续 ${numb.time / 30} 秒，每隔 ${numb.interval / 30} 秒${numbEffect}。`);
        add('水络电涌', electricText(skillId));
      } else if (skillId === 20635030201) {
        const power = passive(ride.rank === 2 ? 7084065 : 7084061);
        const hitCounts = dashBullets.map((id) => damageSegments({}, eng.getBullet(id, [])).reduce((sum, s) => sum + s.maxHit, 0));
        const referencePower = passive(7084015);
        const referenceRelease = referenceCfg.skill2_1.com.find((com) => com.type === 134 && !com.notActive);
        const referenceHoldFrames = Math.max(...Object.keys(referenceRelease).filter((key) => /^frames\d+$/.test(key)).map((key) => referenceRelease[key][1]));
        const holdFrames = frames - cfg.time.skill2_3;
        add('能量上限提升', `独立能量上限由神天应龙的 ${referencePower.maxEnergy} 提高至 ${power.maxEnergy}，增加 ${gainPct(power.maxEnergy / referencePower.maxEnergy - 1)}。入场时拥有 ${power.initEnergy} 点能量。`);
        add('短按与长按', `短按一次至少需要并消耗 ${power.canEnergy} 点能量；长按会继续消耗能量，冲得更远，松手或能量不足时开始收招。从按下技能到开始收招，最长由神天应龙的约 ${Number((referenceHoldFrames / 30).toFixed(2))} 秒延长至 ${Number((holdFrames / 30).toFixed(2))} 秒。`);
        add('充能与伤害', `每秒回复 ${power.energyAdd * 30} 点独立能量，施放期间暂停回复。前后两段冲刺各最多命中 ${hitCounts.join('、')} 次，每次 42.5%，全部命中共 340%，比神天应龙的 255% 提高 33.33%。完整长按含收招共 ${frames} 帧（约 ${Number(seconds.toFixed(3))} 秒）；提前松手可缩短位移。`);
        add('释放方式', '通过独立能量发动，能量足够即可使用。冲刺能否全部命中，取决于敌人的位置和移动情况。');
        add('水络电涌', electricText(skillId));
      } else if (isHeal) {
        const connect = cfg.skill3_1.com.find((com) => com.type === 121 && com.connectSkillId === 20635030302);
        const follow = eng.getBullet(7558, []);
        const targetRange = cfg.vskill3_2.com.find((com) => com.type === 169).range;
        const referenceRange = referenceCfg.vskill3_2.com.find((com) => com.type === 169).range;
        add('水球与治疗', `召唤 ${count} 颗水球，跟随 ${follow.maxTimeFrame / 30} 秒。${connect.disableTime} 秒后可再次按键，优先治疗范围内生命比例较低的友方，包含自身；多个水球可以选中同一目标。普攻或无双可使水球发起追击。`);
        add('每球治疗量', `每颗水球的满额治疗为施法者 ${pct(healRatio)} 最大生命值，加上随技能等级提升的固定治疗量。对同一目标，首球恢复满额的 ${pct(decay[0])}，即 3.57% 最大生命值＋0.6 倍固定治疗量；后续每球恢复满额的 ${pct(decay[1])}，即 0.595% 最大生命值＋0.1 倍固定治疗量。`);
        add('集中与分散治疗', `六球集中治疗一个目标，共恢复 ${pct(healRatio * healScale)} 最大生命值＋${round(healScale)} 倍固定治疗量，比神天应龙提高 10%。分别治疗六个不同目标，合计恢复 ${pct(healRatio * count * decay[0])} 最大生命值＋${round(count * decay[0])} 倍固定治疗量，比神天应龙的五球总治疗量提高 20%。每球治疗量分别取整。`);
        add('治疗范围提升', `可选择友方的范围由神天应龙的 ${referenceRange[2]}×${referenceRange[3]} 扩大至 ${targetRange[2]}×${targetRange[3]}（游戏距离单位），水球数量由 5 颗增加至 ${count} 颗。水球跟随期间可选择发动治疗，或用普攻、无双带动追击。`);
      } else if (isChase) {
        bulletId = 7566;
        add('追击伤害提升', `水钻头由神天应龙的 5 颗增加至 ${count} 颗，每颗造成 1 段 90% 水属性伤害，总攻击倍率由 450% 提高至 540%，总固定伤害也提高 20%。`);
        add('追击联动', '身后有水球时，普攻或无双自动带动水钻头追击。追击随「瑞汐凝珠」的技能等级提升，共用该技能的 25 秒冷却。');
        add('消耗蓄雨', waterText(skillId, count));
        add('挂湿能力提升', '六球全中附加雨湿由神天应龙的 35 层提高至 78 层；解锁骑术后由 45 层提高至 108 层，达到 2.4 倍。');
      } else if (isCharge) {
        bulletId = 7570;
        const charge = cfg.skill4_2.com.find((com) => com.type === 134);
        const ranges = Object.keys(charge).filter((key) => /^frames\d+$/.test(key)).map((key) => charge[key]);
        const maxFrames = Math.max(...ranges.map((range) => range[1]));
        const perFrame = passive(7084063).per;
        const fullSeconds = (frames + maxFrames) / 30;
        const firstRow = required(ctx.levels, eng.skillLevelRowId(damageSkill, 1), 'skillLevel');
        const segments = computeFirstHitBulletSegments(firstRow, eng.getBullet(bulletId, []), ctx.buffs, 1);
        const maxRow = required(ctx.levels, eng.skillLevelRowId(damageSkill, maxLevel), 'skillLevel');
        const maxSegments = computeFirstHitBulletSegments(maxRow, eng.getBullet(bulletId, []), ctx.buffs, maxLevel);
        const hits = segments.reduce((sum, segment) => sum + segment.maxHit, 0);
        const basePer = segments.reduce((sum, segment) => sum + segment.per * segment.maxHit, 0);
        const fullPer = basePer + hits * maxFrames * perFrame;
        const formatDamage = (value) => Math.round(value).toLocaleString('en-US');
        const fixedAtLevelOne = segments.reduce((sum, segment) => sum + segment.val * segment.maxHit, 0);
        const fixedAtMaxLevel = maxSegments.reduce((sum, segment) => sum + segment.val * segment.maxHit, 0);
        add('蓄力与伤害', `${ranges.length} 档蓄力，最长 ${maxFrames / 30} 秒（${maxFrames} 帧）。每个目标首次命中时额外结算一段 ${pct(segments[0].per)} 攻击倍率 + 固定伤害，雷柱本体另有 ${hits - 1} 段各 ${pct(segments[1].per)} 攻击倍率 + 固定伤害。固伤随技能等级成长：Lv.1 首次附加 ${formatDamage(segments[0].val)}、本体其余每段 ${formatDamage(segments[1].val)}（全中 ${formatDamage(fixedAtLevelOne)}）；Lv.${maxLevel} 首次附加 ${formatDamage(maxSegments[0].val)}、本体其余每段 ${formatDamage(maxSegments[1].val)}（全中 ${formatDamage(fixedAtMaxLevel)}）。每蓄力一帧，每段攻击倍率增加 ${pct(perFrame)}；满蓄后每段增加 ${pct(maxFrames * perFrame)}，${hits} 段总攻击倍率由 ${pct(basePer)} 提高至 ${pct(fullPer)}。蓄力只提高攻击倍率，不改变固伤。`);
        add('释放时间', `起手 ${cfg.time.skill4_1} 帧、吐息 ${cfg.time.skill4_3} 帧，未蓄力共 ${frames} 帧（约 ${Number(seconds.toFixed(3))} 秒），攻转 ${round(basePer / seconds)}。满蓄共 ${frames + maxFrames} 帧（约 ${Number(fullSeconds.toFixed(3))} 秒），攻转约 ${round(fullPer / fullSeconds)}。`);
        add('范围与出手提升', '相比神天应龙，吐息提前 5 帧（约 0.167 秒）出现。每档蓄力的雷柱大小加成为 8%，由原来的 2% 提高至四倍；六档蓄满时，这项大小加成由 12% 提高至 48%。吐息还能推退霸体敌人。');
        add('姿态与体力', '起手切换飞行，蓄力时可以低速移动，蓄满前体力消耗与地面一致。');
        add('水络电涌', electricText(damageId));
      } else if (skillId === 20635030501) {
        bulletId = 7571;
        add('水流绞杀', `持续攻击 8 次，每次 12%，最终水爆 1 次、504%，总攻击倍率 600%。终段施加 ${round(buff(136020301).time / 30)} 秒弱控标记，控制强度 ${buff(136020301).weakCtrlScore}，并对可抓取的敌人形成聚拢控制。`);
        add('消耗蓄雨', waterText(skillId, 9));
        add('相比神天应龙', '基础伤害、固定伤害、2 秒释放时间与 21 秒冷却相同。九段全中附加雨湿由 45 层提高至 81 层；解锁骑术后由 54 层提高至 108 层，翻倍。');
      } else if (skillId === 20635030601) {
        add('飞行姿态', '二段跳后再次按跳跃键进入飞行，可在空中自由移动；落地恢复地面姿态。');
        add('飞行体力', '飞行额外消耗相当于地面基础耗体的 250%，合计为基础耗体的 350%，与神天应龙相同。');
      } else {
        const isRiding = skillId === 20635030603;
        add('蓄雨槽', rainText);
        add('雨湿层数', wetText);
        add('蓄雨属性加成', `蓄雨越充足，骑乘回血、攻击和闪避提升越高，技能冷却与充能越快。当前各项加成上限为 ${pct(passive(isRiding ? 7084073 : 7084053).per)}。${isRiding ? '骑术将各项上限从 4.29% 提高至 6%。' : '解锁骑术后，各项上限提高至 6%。'}相比神天应龙，新增了骑乘攻击与闪避加成。`);
        add('角色本体属性', propsText(isRiding ? 7084079 : 7084059));
        add('主人属性提升', `相比神天应龙，在原有回血与回魔加成之外，还使主人攻击、闪避各提高 ${isRiding ? '1.29%' : '0.92%'}。`);
        if (isRiding) add('骑术继承', '额外继承角色 8% 的生命、闪避、攻击、暴击。相比神天应龙，原本的 8% 回血继承改为 8% 闪避继承，其余三项相同。');
        add('水络电涌', '雷属性攻击消耗敌人的雨湿，每层追加 6.7% 基础攻击力的电击伤害。一、二、四技能单次最多消耗 130、20、134 层；解锁骑术后分别提高至 183、29、187 层。');
        add('相比神天应龙', '未解锁骑术时，一、二、四技能的单次引爆上限分别由 65、10、68 层提高至 130、20、134 层。解锁骑术后，一、二技能上限相同；四技能可引爆 187 层，比神天应龙实际可储存并引爆的 185 层多 2 层。');
      }
      const levels = [];
      for (let level = 1; level <= maxLevel; level++) {
        const row = isPassive ? null : required(ctx.levels, eng.skillLevelRowId(damageSkill, level), 'skillLevel');
        let segments = [];
        if (slotKind === 'attack') segments = [{ per: row.damageAddPer, val: row.damageAddVal, maxHit: 1, from: '共享命中组水刃' }];
        else if (skillId === 20635030201) {
          segments = dashBullets.flatMap((id) => damageSegments(row, eng.getBullet(id, [])));
        } else if (isCharge) segments = computeFirstHitBulletSegments(row, eng.getBullet(bulletId, []), ctx.buffs, level);
        else if (bulletId) segments = damageSegments(row, eng.getBullet(bulletId, []), isChase ? count : 1);
        const totalPer = segments.length ? round(segments.reduce((sum, s) => sum + s.per * s.maxHit, 0)) : null;
        // 0/1 为占位固伤，多个占位值相加也不能变成有效固伤样本。
        const totalVal = isHeal ? round(buff(1071701 + level - 1).value[0][1] * healScale)
          : segments.some((s) => s.val > 1) ? round(segments.reduce((sum, s) => sum + s.val * s.maxHit, 0)) : null;
        const rowMetrics = [];
        if (totalPer > 0 && seconds > 0) rowMetrics.push(metric('atkConv', '攻转', totalPer / seconds));
        if (isHeal) {
          const val = buff(1071701 + level - 1).value[0][1];
          rowMetrics.push(metric('healFirstVal', '首球固定治疗量(60%)', val * decay[0]), metric('healDecayedVal', '后续单球固定治疗量(10%)', val * decay[1]));
        }
        levels.push({ level, roleLevel: row?.roleLevel ?? null, consumeMp: row?.consumeMp ?? null, soulCost: row?.soulCost ?? null,
          segmentVals: segments.map(({ val, maxHit }) => ({ val, maxHit })), totalPer, totalVal, growthBuffs: [], metrics: rowMetrics });
      }
      const ref = levels.at(-1);
      const referenceRow = isPassive ? null : required(ctx.levels, eng.skillLevelRowId(damageSkill, maxLevel), 'skillLevel');
      let headerSegments = [];
      if (slotKind === 'attack') headerSegments = [{ per: referenceRow.damageAddPer, maxHit: 1 }];
      else if (skillId === 20635030201) headerSegments = dashBullets.flatMap((id) => damageSegments(referenceRow, eng.getBullet(id, [])));
      else if (isCharge) headerSegments = computeFirstHitBulletSegments(referenceRow, eng.getBullet(bulletId, []), ctx.buffs, maxLevel);
      else if (bulletId) headerSegments = damageSegments(referenceRow, eng.getBullet(bulletId, []), isChase ? count : 1);
      const result = {
        skillId, name: slotKind === 'attack' ? '普攻' : isChase ? `${skill.desName}·水钻头` : skill.desName,
        icon: skill.icon || null, attribute: skill.attribute, entityAction: skill.entityAction,
        concreteSkillIds: [damageId], desIntro: descriptions[skillId] ?? null,
        header: { kind: isPassive || isHeal ? 'effectOnly' : 'bullet', totalValLabel: isHeal ? `六球固定治疗量（${pct(healScale)}）` : null,
          segments: headerSegments.map(({ per, maxHit, from }) => ({ per, maxHit, from })), segCount: headerSegments.reduce((sum, s) => sum + s.maxHit, 0),
          totalPer: ref.totalPer, releaseFrames: frames, releaseSeconds: seconds, releaseTimeSource: timeSource,
          cd: isPassive ? null : isChase ? ctx.skills.get(20635030301).cd : skill.cd,
          addDefendVal: referenceRow?.addDefendVal ?? null, cfgFileResolved: monster.cfgFile, cfgResolveSource: 'rideMonster', referenceLevel: maxLevel,
          fixedBuffs: [], mechanics, note: null,
          metrics: isHeal ? [metric('healTotalRatio', `${count}球单体治疗比例`, healRatio * healScale, `${pct(healRatio * healScale)} HP`)] : [],
        }, maxLevel, slotLabel, slotKind, levels, warnings: [],
      };
      slots.push({ slot, slotLabel, slotKind, base: result });
    }
    card(monster.atkIds[0], 'attack1', '普攻', 'attack');
    ride.skillActive.forEach((id, i) => {
      card(id, `skillActive${i + 1}`, `技能${i + 1}`, 'active');
      if (id === 20635030301) card(20635030303, `skillActive${i + 1}_chase`, '技能3·追击', 'active');
    });
    ride.skillSp.forEach((id, i) => card(id, `skillSp${i + 1}`, '无双', 'sp'));
    ride.skillPassive.forEach((id, i) => card(id, `skillPassive${i + 1}`, '被动', 'passive'));
    const ridingItem = ctx.riding.find((row) => row.rideGroupId === ride.idGroup);
    ridingItem.skills.filter((id) => !ride.skillPassive.includes(id)).forEach((id, i) => card(id, `riding${i + 1}`, '骑术', 'passive'));
    return { ride: { id: ride.id, idGroup: ride.idGroup, name: ride.name, rank: ride.rank, type: ride.type, monsterId: ride.monsterId, monsterName: monster.name, cfgFile: monster.cfgFile }, slots };
  }
  const variants = [201904].map(buildVariant);
  u.saveOutput('ride_wiki_huanglong', {
    rideGroup: {
      key: 'huanglong', name: '黄龙', rideIds: variants.map((v) => v.ride.id),
      introduction: '神瑞帝龙是神天应龙异化后的超进化形态。强化蓄雨、水雷连招、冲刺与水球覆盖，并新增远程雷球和霸体推退。以下均与超进化形态「神天应龙」比较。',
      improvements: [
        { label: '资质与养成', value: '各星级力量资质、体质资质分别增加 111 点，幸运和敏捷资质相同。同阶基础攻防与移动速度相同。神天应龙消耗 1 个黄龙玉鳞即可异化为神瑞帝龙。' },
        { label: '蓄雨翻倍', value: '容量由 185 提高至 370，骑术由 260 提高至 520；每秒回复由 5.6166 提高至 11.2332，骑术由 7.8633 提高至 15.7266。敌人雨湿上限由 185 提高至 260 层。' },
        { label: '攻击与闪避', value: '新增随蓄雨比例提高的骑乘攻击、闪避，上限各 4.29%，骑术各 6%；额外使主人攻击、闪避各提高 0.92%，骑术各 1.29%。骑术的 8% 回血继承改为 8% 闪避继承，生命、攻击、暴击继承仍各为 8%。' },
        { label: '一技能与冲刺', value: '一技能命中范围宽、高各增加 8.8%，并可将未命中的电网射成雷球。二技能能量上限由 9000 提高至 12000，短按一次至少需要并消耗 6000 点能量；长按可继续消耗能量、冲得更远，全中攻击倍率由 255% 提高至 340%。' },
        { label: '水球与治疗', value: '水球由 5 颗增加至 6 颗，追击攻击倍率由 450% 提高至 540%，总固定伤害增加 20%。集中治疗同一目标提高 10%，分散治疗的总量提高 20%；治疗选择范围由 1250×1250 扩大至 1400×1400。' },
        { label: '雷柱与挂湿', value: '四技能吐息提前约 0.167 秒出现，蓄力带来的大小加成最高由 12% 提高至 48%，并可推退霸体敌人。骑术追击全中雨湿由 45 层提高至 108 层，无双由 54 层提高至 108 层。' },
      ],
    }, variants,
  }, { system: 'ride_wiki', sourceFiles: ['ride.*.json', 'skill.*.json', 'skillLevel.*.json', 'monster.*.json', 'beskill.*.json', 'buff.*.json', 'riding.*.json', 'bullets.json', 'entityCtg/206350*-*.json'], note: '黄龙独立数据，不回退或套用应龙数值。时间按 30 帧/秒换算。' });
}

if (require.main === module) extract();
module.exports = extract;
