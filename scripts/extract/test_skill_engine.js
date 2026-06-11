// 引擎冒烟测试:用文档已知例子断言升龙斩/火魔斩
const path = require("path");
const fs = require("fs");
const eng = require("./lib/skill-engine");

const DATA = path.resolve(__dirname, "..", "..", "dataApi");
function load(p) {
  const f = fs.readdirSync(DATA).find((x) => x.startsWith(p + ".") && x.endsWith(".json"));
  return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
}
const idx = (a) => new Map(a.map((r) => [r.id, r]));

const skillById = idx(load("skill"));
const skillLevelById = idx(load("skillLevel"));
const monsterById = idx(load("monster"));

function testSkill(name, skillId, slot, expectSegs, expectTotalPer, expectTotalVal) {
  const warnings = [];
  const skill = skillById.get(skillId);
  const cfg = eng.resolveCfgFile(skill, slot, 1, monsterById, warnings);
  const lv1 = eng.querySkillLevel(skill, 1, skillLevelById, warnings);
  const dmg = eng.computeDamageSegments(skill, lv1, cfg.actionCfg, warnings);
  const rel = eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);
  const segCount = dmg.segments.reduce((a, s) => a + s.maxHit, 0);
  const ok = segCount === expectSegs && Math.abs(dmg.totalPer - expectTotalPer) < 0.01 && dmg.totalVal === expectTotalVal;
  console.log(`\n${ok ? "✅" : "❌"} ${name} (${skillId})`);
  console.log(`   kind=${dmg.kind} 段数=${segCount}(期望${expectSegs}) totalPer=${dmg.totalPer}(期望${expectTotalPer}) totalVal=${dmg.totalVal}(期望${expectTotalVal})`);
  console.log(`   cfgFile=${cfg.cfgFileResolved} action=${skill.entityAction} 帧=${rel.releaseFrames}(${rel.releaseTimeSource})`);
  console.log(`   段明细: ${dmg.segments.map((s) => `${s.per}x${s.maxHit}+${s.val}`).join("  ")}`);
  if (warnings.length) console.log(`   warnings: ${warnings.map((w) => w.code).join(",")}`);
  return ok;
}

let pass = true;
// 升龙斩: normalActionBullet, 4段, 攻击×2.8+188
pass = testSkill("升龙斩", 1001160, "skill2", 4, 2.8, 188) && pass;
// 火魔斩: bullet, 7+1=8段, 攻击×4.603+(15×7+204×1=309)
pass = testSkill("火魔斩", 1001180, "skill4", 8, 4.603, 309) && pass;

console.log(`\n${pass ? "全部通过" : "有失败"}`);
process.exit(pass ? 0 : 1);
