/**
 * 角色技能 Wiki — 派生指标引擎
 *
 * 在导出脚本阶段,基于 skill-engine 已算出的等级行/表头字段,声明式地计算派生指标,
 * 与原始数值同级写进 output;前端保持纯渲染。攻略(temp/*数值侧百科)是权威口径:
 *
 *   蓝转  = totalVal / consumeMp        固伤每点蓝(回血技能填回血量 → 即"血蓝比",同一个量)
 *   攻转  = totalPer / releaseSeconds   秒系数(攻略常规值约 3)
 *   秒固比 = 总固伤倍率 / releaseSeconds  (攻略普遍 >110%)
 *   闪避率 = 闪避值 / 对应学习等级通用抗值 → 中值,再 中值/(1+中值)   (攻略白龙满级≈88.8%)
 *   暴击/韧性/幸运/守护 = 属性值 / 对应学习等级通用抗值                (直除,不做两步)
 *
 * 复用 overrides.js 的公式引擎(evalArith / getPath / 容错)。本模块不假设 buff 结构,
 * 换算用哪个 buff、取哪个字段,由 overrides/<role>.json 的 metrics 段逐项声明。
 *
 * 指标定义(放 overrides/<role>.json 的 "metrics":[ ... ],或脚本内置通用默认):
 *   {
 *     "key":   "manaConv",          // 字段名(output 里的键)
 *     "label": "蓝转",              // 表头显示名(用户可自定义)
 *     "scope": "level" | "header",  // 随等级变 / 静态。默认 level
 *     // —— 二选一 ——
 *     "expr":  "totalVal / consumeMp",                              // ① 单则运算型(左到右,无优先级)
 *     "conv":  { "type":"dodge"|"hit"|"resist"|"heal",             // ② 抗值/蓝耗换算型
 *                "buff":"8000501", "valuePath":"value.0.0" },
 *     "when":  "totalVal",          // 可选:该字段为真(非 0)才产出此指标
 *     "format":"num" | "pct",       // 展示格式。pct 会 ×100 加 %
 *     "fixed": 2                    // 小数位,默认 2
 *   }
 *
 * 容错(同铁律:不崩、不 mock,坏数据写 warning):
 *   公式求值失败 → METRIC_BAD_EXPR;抗值缺失 → METRIC_MISSING_STANDARD;
 *   buff 取值失败 → METRIC_MISSING_BUFF_VALUE。指标值记 null,前端显示 "—"。
 */
const fs = require("fs");
const path = require("path");
const { getPath, evalArith } = require("./overrides");

const METRIC_WARN = {
  BAD_EXPR: "METRIC_BAD_EXPR",
  MISSING_STANDARD: "METRIC_MISSING_STANDARD",
  MISSING_BUFF_VALUE: "METRIC_MISSING_BUFF_VALUE",
  BAD_DEF: "METRIC_BAD_DEF",
};

/** 把指标值格式化成展示串。null/NaN → null(前端兜底 "—") */
function formatMetric(value, def) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return null;
  const fixed = def.fixed == null ? 2 : Number(def.fixed);
  if (def.format === "pct") return (value * 100).toFixed(fixed) + "%";
  // num:去掉多余尾零(1.70 -> 1.7,3.00 -> 3)
  return Number(value.toFixed(fixed));
}

/**
 * 换算型指标:把一个 buff 的数值按"对应学习等级通用抗值"或蓝耗换算。
 * @param helpers { buffValue(baseBuffId, valuePath, level) -> number|null,
 *                  standard(roleLevel) -> number|null }
 */
function computeConversion(conv, bag, helpers, warnings, label) {
  if (!conv.buff || !conv.valuePath) {
    warnings.push({ code: METRIC_WARN.BAD_DEF, detail: `${label} conv 缺 buff/valuePath` });
    return null;
  }
  const buffVal = helpers.buffValue(conv.buff, conv.valuePath, bag.level);
  if (typeof buffVal !== "number" || Number.isNaN(buffVal)) {
    warnings.push({ code: METRIC_WARN.MISSING_BUFF_VALUE, detail: `${label} buff ${conv.buff} 路径 ${conv.valuePath} 取不到数值` });
    return null;
  }

  // 血蓝比:回血量 / 蓝耗(不经抗值)
  if (conv.type === "heal") {
    if (!bag.consumeMp) return null;
    return buffVal / bag.consumeMp;
  }

  // 其余都需要对应学习等级的通用抗值
  const std = helpers.standard(bag.roleLevel);
  if (typeof std !== "number" || std <= 0) {
    warnings.push({ code: METRIC_WARN.MISSING_STANDARD, detail: `${label} 学习等级 ${bag.roleLevel} 无通用抗值` });
    return null;
  }
  const mid = buffVal / std; // 闪避中值 / 命中中值 / 属性比率

  // 闪避、命中:两步换算成真实概率
  if (conv.type === "dodge" || conv.type === "hit") {
    return mid / (1 + mid);
  }
  // 暴击/韧性/幸运/守护:直接用比率
  return mid;
}

/**
 * 计算某 scope 下的全部指标。
 * @param defs    指标定义数组
 * @param scope   "level" | "header"
 * @param bag     取值袋(scope=level:含 level/roleLevel/consumeMp/totalPer/totalVal/releaseSeconds…;
 *                       scope=header:含 totalPer/releaseSeconds/segCount…)
 * @param helpers { buffValue, standard }(换算型需要;纯 expr 可传 {})
 * @param warnings 收集 warning 的数组
 * @returns [{ key, label, value:number|null, display:string|number|null }]
 */
function computeMetrics(defs, scope, bag, helpers, warnings) {
  const out = [];
  for (const def of defs || []) {
    if ((def.scope || "level") !== scope) continue;
    if (def.skill != null && bag.skillId !== def.skill) continue; // 限定只对某展示技能产出(如血蓝比只给回血技能)
    if (!def.key) { warnings.push({ code: METRIC_WARN.BAD_DEF, detail: "指标缺 key" }); continue; }
    const label = `[metric ${def.key}]`;

    // when:字段为真才产出(如 totalVal>0 才显示蓝转)
    if (def.when != null) {
      const w = getPath(bag, def.when);
      const cond = w !== undefined ? w : evalArith(def.when, bag).value;
      if (cond == null || Number(cond) === 0 || Number.isNaN(Number(cond))) continue;
    }

    let value = null;
    if (def.conv) {
      value = computeConversion(def.conv, bag, helpers || {}, warnings, label);
    } else if (def.expr) {
      const r = evalArith(def.expr, bag);
      if (!r.ok) {
        warnings.push({ code: METRIC_WARN.BAD_EXPR, detail: `${label} 公式 "${def.expr}" 求值失败(字段缺失或除零)` });
      } else {
        value = Number(r.value);
      }
    } else {
      warnings.push({ code: METRIC_WARN.BAD_DEF, detail: `${label} 既无 expr 也无 conv` });
    }

    out.push({ key: def.key, label: def.label || def.key, value, display: formatMetric(value, def) });
  }
  return out;
}

/**
 * 加载通用抗值表(output/exp.json 的 commonStandard,按角色等级索引)。
 * 暴击/韧性/幸运/守护/命中/闪避共用 commonStandard;换算用"对应学习等级"的值。
 * @returns Map<level:number, commonStandard:number>
 */
function loadCommonStandards() {
  // __dirname = scripts/extract/lib → ../../.. = 仓库根
  const fp = path.resolve(__dirname, "..", "..", "..", "output", "exp.json");
  const map = new Map();
  if (fs.existsSync(fp)) {
    const json = JSON.parse(fs.readFileSync(fp, "utf8"));
    for (const r of json.data || []) {
      if (r && typeof r.level === "number" && typeof r.commonStandard === "number") map.set(r.level, r.commonStandard);
    }
    return map;
  }

  const u = require("../../lib/utils");
  for (const r of u.loadTable("exp") || []) {
    const level = Number(r.level);
    const commonStandard = Number(r.hitStandard);
    if (Number.isFinite(level) && Number.isFinite(commonStandard)) map.set(level, commonStandard);
  }
  if (map.size === 0) throw new Error("缺少抗值表: output/exp.json 不存在且 dataApi/exp 无有效 hitStandard");
  return map;
}

module.exports = { METRIC_WARN, computeMetrics, formatMetric, loadCommonStandards };
