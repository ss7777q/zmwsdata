/**
 * 角色技能 Wiki — 通用「手动覆盖 / 模板」机制
 *
 * 目的:有些 buff/技能的数值含义千差万别(系数+固伤 / 每秒回血 / 减速% / 层数…),
 * 引擎压扁成 {per,val} 后前端只能机械拼成 "-13.6% + -9"。本模块在导出脚本阶段
 * 让用户用占位符模板自由引用 buff 的**全部原始字段**拼出可读文字,引擎不假设结构。
 *
 * 铁律(同 skill-engine):坏路径/坏 filter/坏运算一律输出可见哨兵 + warning,绝不静默造假。
 * 前端保持纯渲染:本模块只产出 displayText 字符串塞进输出 JSON。
 *
 * 覆盖文件:scripts/extract/overrides/<role>.json
 *   { "_version":1, "buffs":{ "<baseBuffId>"|"<skillId>:<baseBuffId>":{displayText,name,…} },
 *     "skills":{ "<skillId>":{name,"header.note",…} } }
 *
 * 占位符语法:
 *   {path|filter|filter}   path=value.0.0 / time / totalPer(点路径,适配任意数组形状)
 *   {= value.0.0 * -100 }  自由四则运算(左到右无优先级,非 eval)
 *   filter: pct signed abs neg sec frame | round N | fixed N | mul X | add X
 */
const fs = require("fs");
const path = require("path");

const OVERRIDE_DIR = path.join(__dirname, "..", "overrides");

const OVR_WARN = {
  BAD_PATH: "OVERRIDE_BAD_PATH",
  BAD_FILTER: "OVERRIDE_BAD_FILTER",
  BAD_MATH: "OVERRIDE_BAD_MATH",
  UNUSED_KEY: "补充效果未匹配",
};

// ─── 取值袋:原始 buff 行直通 ───────────────────────────
/** 直接返回原始 buff 行做取值根(点路径寻址全部字段)。null 安全。 */
function buildBuffBag(rawBuff) {
  return rawBuff && typeof rawBuff === "object" ? rawBuff : {};
}

/** 点路径取值:"value.0.0" -> bag.value[0][0]。任一段缺失返回 undefined。 */
function getPath(bag, p) {
  let cur = bag;
  for (const seg of p.split(".")) {
    if (cur == null) return undefined;
    const key = /^\d+$/.test(seg) ? Number(seg) : seg;
    cur = cur[key];
  }
  return cur;
}

// ─── filter ────────────────────────────────────────────
/** 去掉浮点尾零:13.60->13.6, 5.0->5 */
function trimNum(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return String(n);
  return String(Math.round(n * 1e6) / 1e6);
}

/**
 * 应用一个 filter。返回 {value, ok}。value 可能是数字(继续链)或字符串(已成文)。
 * 不认识的 filter -> ok:false(调用方记 BAD_FILTER 并透传)。
 */
function applyFilter(value, name, arg) {
  const num = typeof value === "number" ? value : Number(value);
  const isNum = typeof value === "number" || (value !== "" && value != null && !Number.isNaN(num));
  switch (name) {
    case "pct": // 取幅度 ×100 加 %(默认,符合 {-数值}% 直觉)
      if (!isNum) return { value, ok: true };
      return { value: trimNum(Math.abs(num) * 100) + "%", ok: true };
    case "signed": // 保留符号的百分比
      if (!isNum) return { value, ok: true };
      return { value: trimNum(num * 100) + "%", ok: true };
    case "abs":
      return isNum ? { value: Math.abs(num), ok: true } : { value, ok: true };
    case "neg":
      return isNum ? { value: -num, ok: true } : { value, ok: true };
    case "sec": // 帧 ÷30 加 s
      if (!isNum) return { value, ok: true };
      return { value: trimNum(num / 30) + "s", ok: true };
    case "frame":
      if (!isNum) return { value, ok: true };
      return { value: trimNum(num) + "帧", ok: true };
    case "round":
      return isNum ? { value: Math.round(num), ok: true } : { value, ok: true };
    case "fixed":
      return isNum ? { value: num.toFixed(arg == null ? 0 : Number(arg)), ok: true } : { value, ok: true };
    case "mul":
      return isNum ? { value: num * Number(arg), ok: true } : { value, ok: true };
    case "add":
      return isNum ? { value: num + Number(arg), ok: true } : { value, ok: true };
    default:
      return { value, ok: false };
  }
}

// ─── 自由四则运算 {= expr }(左到右无优先级,非 eval)──────
/** token: 数字 / 路径 / 运算符。空白分隔。 */
function evalArith(expr, bag) {
  const tokens = expr.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { value: undefined, ok: false };
  const resolve = (tok) => {
    if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
    const v = getPath(bag, tok);
    return typeof v === "number" ? v : Number(v);
  };
  let acc = resolve(tokens[0]);
  if (Number.isNaN(acc)) return { value: undefined, ok: false };
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const rhs = resolve(tokens[i + 1]);
    if (rhs == null || Number.isNaN(rhs) || !"+-*/".includes(op)) return { value: undefined, ok: false };
    if (op === "+") acc += rhs;
    else if (op === "-") acc -= rhs;
    else if (op === "*") acc *= rhs;
    else if (op === "/") acc = rhs === 0 ? NaN : acc / rhs;
  }
  if (Number.isNaN(acc)) return { value: undefined, ok: false };
  return { value: trimNum(acc), ok: true };
}

// ─── 渲染一个模板串 ────────────────────────────────────
/**
 * @returns {text, warnings:[{code,detail}]}
 * 坏路径 -> 哨兵 ⟨path?⟩ + BAD_PATH;坏 filter -> 透传 + BAD_FILTER;坏运算 -> ⟨=expr?⟩ + BAD_MATH。
 */
function renderTemplate(tpl, bag, label = "") {
  const warnings = [];
  if (typeof tpl !== "string") return { text: tpl, warnings };
  const text = tpl.replace(/\{([^}]*)\}/g, (_m, inner) => {
    const body = inner.trim();
    // 自由运算
    if (body.startsWith("=")) {
      const r = evalArith(body.slice(1), bag);
      if (!r.ok) {
        warnings.push({ code: OVR_WARN.BAD_MATH, detail: `${label}运算 {${body}} 无法求值` });
        return `⟨=${body.slice(1).trim()}?⟩`;
      }
      return String(r.value);
    }
    // path|filter|filter
    const parts = body.split("|").map((s) => s.trim());
    const p = parts[0];
    let val = getPath(bag, p);
    if (val === undefined) {
      warnings.push({ code: OVR_WARN.BAD_PATH, detail: `${label}路径 ${p} 不存在` });
      return `⟨${p}?⟩`;
    }
    for (const f of parts.slice(1)) {
      const [fname, farg] = f.split(/\s+/);
      const r = applyFilter(val, fname, farg);
      if (!r.ok) {
        warnings.push({ code: OVR_WARN.BAD_FILTER, detail: `${label}未知 filter "${fname}"` });
        continue; // 透传原值
      }
      val = r.value;
    }
    return typeof val === "number" ? trimNum(val) : String(val);
  });
  return { text, warnings };
}

// ─── 字段级合并 ────────────────────────────────────────
/**
 * 引擎默认对象被 override 出现的键覆盖(浅合并)。displayText 单独渲染。
 * @returns {merged, warnings}
 */
function mergeBuff(engineBuff, overrideEntry, rawBuff, label = "") {
  const merged = { ...engineBuff };
  const warnings = [];
  if (!overrideEntry) return { merged, warnings };
  const bag = buildBuffBag(rawBuff);
  for (const [k, v] of Object.entries(overrideEntry)) {
    if (k.startsWith("_")) continue; // 脚手架文档键,忽略
    if (k === "displayText" && typeof v === "string") {
      const r = renderTemplate(v, bag, label);
      merged.displayText = r.text;
      warnings.push(...r.warnings);
    } else {
      merged[k] = v;
    }
  }
  return { merged, warnings };
}

// ─── 模板脚手架预算便利值 ──────────────────────────────
/** 生成 _computed 块:对几条常见路径预算 pct/abs/sec 等成文版本供用户照抄 */
function computeConvenience(rawBuff) {
  const bag = buildBuffBag(rawBuff);
  const out = {};
  const add = (expr) => {
    const r = renderTemplate(`{${expr}}`, bag);
    if (!/⟨.*\?⟩/.test(r.text)) out[expr] = r.text;
  };
  // value 数组(扁平或嵌套)各元素
  const v = rawBuff && rawBuff.value;
  if (Array.isArray(v)) {
    if (Array.isArray(v[0])) {
      v[0].forEach((_x, i) => { add(`value.0.${i}`); add(`value.0.${i}|pct`); add(`value.0.${i}|abs`); });
    } else {
      v.forEach((_x, i) => { add(`value.${i}`); add(`value.${i}|pct`); add(`value.${i}|abs`); });
    }
  }
  if (typeof rawBuff?.time === "number") { add("time|sec"); add("time|frame"); }
  if (typeof rawBuff?.interval === "number") add("interval|sec");
  return out;
}

// ─── 加载 + 解析器 ─────────────────────────────────────
/**
 * @returns 安全解析器(文件缺失也返回空壳):
 *   { resolveBuff(skillId, baseBuffId), recordBuff(skillId, baseBuffId, rawBuff, engineText, usedBy),
 *     writeTemplate(force), warnings, _seenKeys }
 */
function loadOverrides(roleName) {
  const fp = path.join(OVERRIDE_DIR, `${roleName}.json`);
  let data = { _version: 1, buffs: {}, skills: {} };
  if (fs.existsSync(fp)) {
    try {
      data = JSON.parse(fs.readFileSync(fp, "utf8"));
    } catch (e) {
      throw new Error(`覆盖文件 ${fp} JSON 解析失败:${e.message}(请检查刚编辑的内容)`);
    }
    data.buffs = data.buffs || {};
    data.skills = data.skills || {};
  }

  const usedBuffKeys = new Set();
  const tmplBuffs = {}; // 脚手架累积

  function resolveBuff(skillId, baseBuffId) {
    const scoped = `${skillId}:${baseBuffId}`;
    if (data.buffs[scoped]) { usedBuffKeys.add(scoped); return data.buffs[scoped]; }
    if (data.buffs[String(baseBuffId)]) { usedBuffKeys.add(String(baseBuffId)); return data.buffs[String(baseBuffId)]; }
    return null;
  }

  function resolveSkill(skillId) {
    return data.skills[String(skillId)] || null;
  }

  function recordBuff(skillId, baseBuffId, rawBuff, engineText) {
    const key = String(baseBuffId);
    if (tmplBuffs[key]) {
      if (!tmplBuffs[key]._usedBySkills.includes(skillId)) tmplBuffs[key]._usedBySkills.push(skillId);
      return;
    }
    const raw = {};
    for (const f of ["name", "text", "value", "time", "interval", "attribute", "type", "maxPiles"]) {
      if (rawBuff && rawBuff[f] !== undefined) raw[f] = rawBuff[f];
    }
    tmplBuffs[key] = {
      _raw: raw,
      _computed: computeConvenience(rawBuff),
      _engineDisplayText: engineText ?? null,
      _usedBySkills: [skillId],
      displayText: "", // 用户填
    };
  }

  /** 跑完报未用到的覆盖键(笔误) */
  function finalizeWarnings() {
    const out = [];
    for (const k of Object.keys(data.buffs)) {
      if (!usedBuffKeys.has(k)) out.push({ code: OVR_WARN.UNUSED_KEY, detail: "补充效果暂未匹配到当前技能，已跳过展示" });
    }
    return out;
  }

  /** 写脚手架。默认 <role>.template.json,force 才覆盖正式 <role>.json */
  function writeTemplate(force = false) {
    if (!fs.existsSync(OVERRIDE_DIR)) fs.mkdirSync(OVERRIDE_DIR, { recursive: true });
    const target = force ? fp : path.join(OVERRIDE_DIR, `${roleName}.template.json`);
    const payload = {
      _version: 1,
      _hint: "把要自定义的项写进 displayText。未写的项用引擎默认。占位符: {value.0.0|pct} {time|sec} 自由数学 {= value.0.0 * -100 }。_ 前缀键仅供参考,可删。",
      buffs: tmplBuffs,
      skills: {},
    };
    fs.writeFileSync(target, JSON.stringify(payload, null, 2), "utf8");
    return target;
  }

  /** 角色特有的派生指标定义(overrides 文件的 "metrics" 段);无则空数组。过滤无 key 的注释/占位项(如 _todo) */
  function getMetrics() {
    return Array.isArray(data.metrics) ? data.metrics.filter((m) => m && m.key) : [];
  }

  return { resolveBuff, resolveSkill, recordBuff, writeTemplate, finalizeWarnings, getMetrics };
}

module.exports = {
  OVR_WARN,
  loadOverrides,
  buildBuffBag,
  renderTemplate,
  mergeBuff,
  computeConvenience,
  getPath,
  // 公式引擎部件(供派生指标引擎 metrics.js 复用,不重造)
  evalArith,
  applyFilter,
  trimNum,
};
