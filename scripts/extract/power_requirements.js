const u = require('../lib/utils');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const firstOrNull = (arr) => (Array.isArray(arr) && Number.isFinite(Number(arr[0])) ? Number(arr[0]) : null);

// ─── 1. 神魔星级 ─────────────────────────────────────
function extractGodwarStar() {
  const fights = u.loadTable('godWarFight');
  const toStars = (pairs) =>
    (Array.isArray(pairs) ? pairs : [])
      .map(([star, power]) => ({ star: Number(star), power: Number(power) }))
      .sort((a, b) => a.star - b.star);

  const rows = u.loadTable('godWarReward').map((r) => {
    const fight = fights.find(
      (f) => f.rewardLv === r.rewardLv && f.battlefield === r.battlefield
    );
    const row = {
      battlefield: r.battlefield,
      rewardLv: r.rewardLv,
      name: fight ? fight.name : null,
      battlefieldLv: fight ? fight.battlefieldLv : null,
      stars: toStars(r.plunderStar),
      rideStars: toStars(r.rideStar),
    };
    if (JSON.stringify(r.plunderStar) === JSON.stringify(r.rideStar)) row.sameRide = true;
    return row;
  });
  rows.sort((a, b) => a.battlefield - b.battlefield || a.rewardLv - b.rewardLv);
  return {
    key: 'godwar_star',
    label: '神魔星级',
    description: '神魔战场各阶掠夺/坐骑星级对应的战力门槛（0星无门槛）',
    rows,
  };
}

// ─── 2. 玲珑宝塔品阶 ─────────────────────────────────
function extractLinglongGrade() {
  const rows = u.loadTable('sacredTowerRewardLevel')
    .map((r) => ({
      level: Number(r.level),
      grades: (Array.isArray(r.lotusMonster) ? r.lotusMonster : []).map(Number),
      sweepPower: firstOrNull(r.sweepPowerOpen),
    }))
    .sort((a, b) => a.level - b.level);
  return {
    key: 'linglong_grade',
    label: '玲珑宝塔品阶',
    description: '玲珑宝塔各塔等级下莲藕人品阶（按玩家最高战力取最高达标档位）与扫荡解锁战力',
    columns: ['level', 'grades', 'sweepPower'],
    rows,
  };
}

// ─── 3. 副本推荐战力 ─────────────────────────────────
const STAGE_TYPE_LABELS = [
  [1, '主线关卡'],
  [2, '幻境'],
  [4, '罗汉堂'],
  [5, '神兽森林'],
  [6, '噩梦关卡'],
  [23, '昆仑副本'],
  [32, '混沌之门'],
  [33, '联盟BOSS'],
  [37, '精英副本'],
  [40, '福利秘境'],
  [43, '招摇山'],
  // type 55 关卡名为花果山/望风岭…（loading 表提示"无双极境"章节玩法，并非兜率宫）
  [55, '无双极境'],
];

function extractStagePower() {
  const stages = u.loadTable('stage');
  const groups = [];
  for (const [type, label] of STAGE_TYPE_LABELS) {
    const rows = stages
      .filter(
        (s) =>
          s.type === type &&
          Number.isFinite(Number(s.power)) &&
          Number(s.power) > 0 &&
          !String(s.name || '').includes('测试')
      )
      .sort((a, b) => a.id - b.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        lv: num(s.lv),
        power: Number(s.power),
        sweepPower: firstOrNull(s.sweepPowerOpen),
      }));
    if (rows.length === 0) {
      console.log(`  ⚠️ stage type ${type}(${label}) 无有效 power 行，跳过该组`);
      continue;
    }
    groups.push({ type, label, rows });
  }
  return {
    key: 'stage_power',
    label: '副本推荐战力',
    description: 'stage 表各类副本的推荐战力（power>0），sweepPower 为扫荡解锁战力',
    groups,
  };
}

// ─── 4. 万灵塔 ───────────────────────────────────────
function extractPetTower() {
  const rows = u.loadTable('petTower')
    .map((r) => ({ floor: Number(r.floor), stage: Number(r.stage), power: Number(r.power) }))
    .sort((a, b) => a.floor - b.floor || a.stage - b.stage);
  return {
    key: 'pet_tower',
    label: '万灵塔',
    description: '万灵塔每层每关守卫战力',
    columns: ['floor', 'stage', 'power'],
    rows,
  };
}

// ─── 5. 兽王挑战 ─────────────────────────────────────
function extractPetChampionTower() {
  const raw = u.loadTable('petChampionTower');
  const floorCount = new Map();
  for (const r of raw) floorCount.set(r.floor, (floorCount.get(r.floor) || 0) + 1);
  const rows = raw
    .map((r) => {
      const row = { floor: Number(r.floor), power: Number(r.power), point: Number(r.point) };
      if (floorCount.get(r.floor) > 1 && Array.isArray(r.worldLv)) {
        row.worldLv = [Number(r.worldLv[0]), Number(r.worldLv[1])];
      }
      return row;
    })
    .sort((a, b) => a.floor - b.floor || (a.worldLv?.[0] ?? 0) - (b.worldLv?.[0] ?? 0));
  return {
    key: 'pet_champion_tower',
    label: '兽王挑战',
    description: '兽王挑战各层守卫战力与积分（同层多条时按 worldLv 世界等级段区分）',
    columns: ['floor', 'power', 'point', 'worldLv'],
    rows,
  };
}

// ─── 6. 葬灵洞 ───────────────────────────────────────
function extractPetHole() {
  const rows = u.loadTable('petHole')
    .map((r) => {
      const power = Array.isArray(r.power) ? r.power : [];
      return {
        bossLevel: Number(r.bossLevel),
        elitePower: Number(power[0]) > 0 ? Number(power[0]) : null,
        recommendPower: Number(power[2]) > 0 ? Number(power[2]) : null,
      };
    })
    .sort((a, b) => a.bossLevel - b.bossLevel);
  return {
    key: 'pet_hole',
    label: '葬灵洞',
    description: '葬灵洞各级 BOSS 的推荐战力（power[2]）与精英战力（power[0]，-1 表示无）',
    columns: ['bossLevel', 'elitePower', 'recommendPower'],
    rows,
  };
}

// ─── 7. 联盟讨伐凶兽 ─────────────────────────────────
function extractLeagueBoss() {
  const pick = (r, kind) => ({
    kind,
    group: Number(r.group),
    name: r.name,
    level: Number(r.level),
    power: Number(r.power),
  });
  const rows = [
    ...u.loadTable('leagueBossCopy').map((r) => pick(r, '分身')),
    ...u.loadTable('leagueBossReally').map((r) => pick(r, '真身')),
  ].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === '分身' ? -1 : 1) ||
      a.group - b.group ||
      a.level - b.level
  );
  return {
    key: 'league_boss',
    label: '联盟讨伐凶兽',
    description: '联盟讨伐凶兽分身（leagueBossCopy）与真身（leagueBossReally）的挑战战力',
    columns: ['kind', 'group', 'name', 'level', 'power'],
    rows,
  };
}

// ─── 8. 七星浩劫 ─────────────────────────────────────
function extractStarHavoc() {
  const byGroup = new Map();
  for (const r of u.loadTable('starHavocEventReward')) {
    const g = Number(r.rewardGroup);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push({
      rewardGroup: g,
      value: Number(r.value),
      power: Number(r.power),
      sweepPower: firstOrNull(r.sweepPowerOpen),
    });
  }
  const groups = [...byGroup.keys()]
    .sort((a, b) => a - b)
    .map((g) => ({
      group: g,
      rows: byGroup.get(g).sort((a, b) => a.value - b.value),
    }));
  return {
    key: 'star_havoc',
    label: '七星浩劫',
    description: '七星浩劫各奖励组进度值对应的战力与扫荡解锁战力',
    groups,
  };
}

function extract() {
  console.log('\n⚔️ 战力需求');
  const sections = [
    extractGodwarStar(),
    extractLinglongGrade(),
    extractStagePower(),
    extractPetTower(),
    extractPetChampionTower(),
    extractPetHole(),
    extractLeagueBoss(),
    extractStarHavoc(),
  ];

  for (const s of sections) {
    const cnt = s.rows
      ? s.rows.length + '行'
      : s.groups.length + '组/' + s.groups.reduce((n, g) => n + g.rows.length, 0) + '行';
    console.log(`  · ${s.label} → ${cnt}`);
  }

  u.saveOutput('power_requirements', { sections }, {
    system: '战力需求',
    source:
      'godWarReward/sacredTowerRewardLevel/stage/petTower/petChampionTower/petHole/leagueBossCopy/leagueBossReally/starHavocEventReward.*.json',
    note:
      '汇总全游戏需要战力的模块：神魔星级(godWarReward.plunderStar/rideStar 星级战力门槛,战场名取自 godWarFight)；' +
      '玲珑宝塔品阶(sacredTowerRewardLevel.lotusMonster 五档品阶战力,sweepPowerOpen[0] 扫荡解锁)；' +
      '副本推荐战力(stage.power 按 type 分组,type55 为无双极境章节玩法)；' +
      '万灵塔(petTower.power 每层每关)；兽王挑战(petChampionTower.power/point,高层按 worldLv 段区分)；' +
      '葬灵洞(petHole.power[2] 推荐战力,power[0] 精英战力,-1 表示无)；' +
      '联盟讨伐凶兽(leagueBossCopy 分身/leagueBossReally 真身 power)；' +
      '七星浩劫(starHavocEventReward.power 按 rewardGroup 分组,sweepPowerOpen[0] 扫荡解锁)',
  });
}

if (require.main === module) {
  extract();
}

module.exports = extract;
