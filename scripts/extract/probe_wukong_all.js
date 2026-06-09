// 孙悟空全技能 vs 攻略对照:跑引擎算 lv1 系数,与 wukong_guide.json 比对
const path = require("path");
const fs = require("fs");
const eng = require("./lib/skill-engine");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA = path.join(ROOT, "dataApi");
function load(p) {
  const f = fs.readdirSync(DATA).find((x) => x.startsWith(p + ".") && x.endsWith(".json"));
  return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
}
const idx = (a) => new Map(a.map((r) => [r.id, r]));

const roleInitial = load("roleInitial").find((r) => r.roleId === 1);
const skillById = idx(load("skill"));
const skillLevelById = idx(load("skillLevel"));
const monsterById = idx(load("monster"));
const guide = JSON.parse(fs.readFileSync(path.join(ROOT, "temp/guide_csv/wukong_guide.json"), "utf8"));
const guideById = new Map();
for (const g of guide) if (g.skillId) guideById.set(g.skillId, g);

const SLOTS = ["skill1", "skill2", "skill3", "skill4", "trick", "transSkill1", "transSkill2", "transSkill3", "transSkill4"];

function run(skillId, slot) {
  const warnings = [];
  const skill = skillById.get(skillId);
  if (!skill) return { skillId, error: "skill 缺失" };
  const concretes = eng.resolveConcreteSkills(skillId, skillById, warnings);
  const cfg = eng.resolveCfgFile(skill, slot, 1, monsterById, warnings);
  const lv1 = eng.querySkillLevel(skill, 1, skillLevelById, warnings);
  const dmg = eng.computeDamageSegments(skill, lv1, cfg.actionCfg, warnings);
  const rel = eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
  const maxLevel = eng.detectMaxLevel(skill, skillLevelById);
  const segCount = dmg.segments.reduce((a, s) => a + s.maxHit, 0);
  return {
    skillId, name: skill.desName, slot, concretes,
    kind: dmg.kind, segCount, totalPer: dmg.totalPer, totalVal: dmg.totalVal,
    frames: rel.releaseFrames, frameSrc: rel.releaseTimeSource,
    maxLevel, cfgFile: cfg.cfgFileResolved, cfgSrc: cfg.cfgResolveSource,
    warnings: warnings.map((w) => w.code),
  };
}

function cmp(r) {
  const g = guideById.get(r.skillId);
  if (!g) return "无攻略对照";
  const perOk = g.maxCoef != null && Math.abs(r.totalPer - g.maxCoef) < 0.01;
  const frameOk = g.frames == null || r.frames === g.frames;
  return `攻略max=${g.maxCoef}(${perOk ? "✓" : "✗算" + r.totalPer}) 帧=${g.frames}(${frameOk ? "✓" : "✗算" + r.frames})`;
}

for (const slot of SLOTS) {
  const v = roleInitial[slot];
  const base = Array.isArray(v) ? v[0] : v;
  const aw = roleInitial[slot + "Awaken"] || [];
  const baseR = run(base, slot);
  console.log(`\n【${slot}】${baseR.name} (${base})`);
  console.log(`  base: kind=${baseR.kind} 段=${baseR.segCount} per=${baseR.totalPer} val=${baseR.totalVal} 帧=${baseR.frames} maxLv=${baseR.maxLevel} cfg=${baseR.cfgFile}(${baseR.cfgSrc})`);
  console.log(`        ${cmp(baseR)} ${baseR.warnings.length ? "warn:" + baseR.warnings.join(",") : ""}`);
  for (const awId of (Array.isArray(aw) ? aw : [])) {
    const r = run(awId, slot);
    console.log(`  觉醒 ${r.name}(${awId}): kind=${r.kind} 段=${r.segCount} per=${r.totalPer} val=${r.totalVal} 帧=${r.frames} ${cmp(r)} ${r.warnings.length ? "warn:" + r.warnings.join(",") : ""}`);
  }
}
