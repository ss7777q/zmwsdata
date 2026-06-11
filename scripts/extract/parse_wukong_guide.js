const fs = require("fs");
const path = require("path");

// 解析 temp 攻略 "猴2猪" sheet,提取孙悟空区(col 9-99)的对照数据。
// 产出: temp/guide_csv/wukong_guide.json,作为引擎验证基线。

const ROOT = "D:/zmws/Server/deployable-app";
const grid = JSON.parse(fs.readFileSync(path.join(ROOT, "temp/guide_csv/猴2猪.json"), "utf8"));

const cell = (r, c) => {
  const row = grid[r - 1];
  if (!row) return null;
  const v = row[c - 1];
  return v === null || v === undefined ? null : v;
};
const cols = grid[0].length;
const LV1_ROW = 19; // R19 = lv1
const MAX_LV = 100; // 表里铺到 100,但多数技能真实只到 20

// R3 技能名锚点
const anchors = [];
for (let c = 1; c <= cols; c++) {
  const v = cell(3, c);
  if (v !== null && String(v).trim() !== "") anchors.push({ col: c, name: String(v).trim() });
}
const ownerName = (c) => {
  let best = null;
  for (const a of anchors) {
    if (a.col <= c) best = a;
    else break;
  }
  return best ? best.name : null;
};

const STAGE_FIELDS = new Set(["单段", "斩击", "落地", "分身技单段", "旋转", "沙刃", "燃血", "灼烧", "闪避", "攻击", "持续回血", "小掌", "大掌", "落石"]);

const isErr = (v) => typeof v === "number" && v < -1000000000; // Excel 溢出错误值

// 找某列(固伤列)的真实最大等级
function realMaxLevel(col) {
  let last = 0;
  for (let lv = 1; lv <= MAX_LV; lv++) {
    const v = cell(LV1_ROW + lv - 1, col);
    if (v === null || isErr(v)) break;
    last = lv;
  }
  return last;
}

// 取某列各级固伤值(到 maxLv)
function levelVals(col, maxLv) {
  const out = [];
  for (let lv = 1; lv <= maxLv; lv++) {
    out.push(cell(LV1_ROW + lv - 1, col));
  }
  return out;
}

// 孙悟空区: col 9..99
const START = 9;
const END = 99;

// 按技能名分组列
const skillMap = new Map(); // name -> {name, cols:[{col,field,r4id,coef}]}
for (let c = START; c <= END; c++) {
  const field = cell(5, c);
  if (field === null || String(field).trim() === "") continue;
  const f = String(field).trim();
  const name = ownerName(c);
  if (!name) continue;
  if (!skillMap.has(name)) skillMap.set(name, { name, cols: [] });
  skillMap.get(name).cols.push({ col: c, field: f, r4id: cell(4, c), coef: cell(6, c) });
}

const result = [];
for (const [name, info] of skillMap) {
  const stages = [];
  let maxCol = null, frameCol = null;
  for (const col of info.cols) {
    if (col.field === "max") maxCol = col;
    else if (col.field === "帧数") frameCol = col;
    else if (STAGE_FIELDS.has(col.field)) stages.push(col);
  }
  // 用第一个 stage 列确定 maxLevel
  const maxLv = stages.length ? realMaxLevel(stages[0].col) : 0;
  const skill = {
    name,
    skillId: info.cols.find((c) => c.r4id != null && c.r4id > 1000000)?.r4id ?? null,
    frames: frameCol ? frameCol.coef : null,
    maxCoef: maxCol ? maxCol.coef : null,
    maxLevel: maxLv,
    stages: stages.map((s) => ({
      field: s.field,
      coef: s.coef,
      r4id: s.r4id,
      vals: levelVals(s.col, maxLv),
    })),
    totalVals: maxCol ? levelVals(maxCol.col, maxLv) : null,
  };
  result.push(skill);
}

const outFile = path.join(ROOT, "temp/guide_csv/wukong_guide.json");
fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
console.log("已写入", outFile);
console.log("技能数:", result.length);
for (const s of result) {
  console.log(`  ${s.name}: skillId=${s.skillId} maxCoef=${s.maxCoef} frames=${s.frames} maxLv=${s.maxLevel} stages=${s.stages.map((x) => x.field + "(" + x.coef + ")").join("+")}`);
}
