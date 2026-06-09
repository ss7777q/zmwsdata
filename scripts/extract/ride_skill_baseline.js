/**
 * 坐骑技能基准值 X 自动反推
 *
 * 原理:
 *   - 攻略口径: 技能总固伤 = 基准固伤 * 固伤倍率 = 基准固伤 * CD * 修正比
 *   - 常规输出技能修正比约为 100%, 因此同等级 totalVal / cd 的最大主簇可作为该等级坐骑 X
 *
 * 本模块只消费已经完成伤害段合并的 ride_wiki_*.json,不读取攻略图片或倍率文本。
 * 缺 CD、缺固伤、0/1 占位伤害不进入样本;样本不足时只写 warning,不构造假基准值。
 */
const fs = require("fs");
const path = require("path");
const u = require("../lib/utils");

const OUTPUT_DIR = u.OUTPUT_DIR;
const RIDE_WIKI_FILE_RE = /^ride_wiki_.*\.json$/;
const OUTPUT_NAME = "ride_skill_baseline";

const ACTIVE_SLOT_KINDS = new Set(["active", "sp"]);
const BASELINE_CLUSTER_RELATIVE_TOLERANCE = 0.015;
const BASELINE_MIN_CLUSTER_SAMPLE_COUNT = 3;
const BASELINE_MIN_CLUSTER_SHARE = 0.35;
const NUMBER_DISPLAY_DIGITS = 6;
const RATIO_DISPLAY_DIGITS = 4;
const PERCENT_DISPLAY_DIGITS = 4;
const FIXED_MULTIPLIER_STATIC_RELATIVE_RANGE_LIMIT = 0.05;

function roundTo(n, digits) {
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function relativeDiff(a, b) {
  if (b === 0) return a === 0 ? 0 : Infinity;
  return Math.abs(a - b) / Math.abs(b);
}

function pushWarning(warnings, code, detail, extra = {}) {
  warnings.push({ code, detail, ...extra });
}

function listRideWikiFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  return fs.readdirSync(OUTPUT_DIR)
    .filter((file) => RIDE_WIKI_FILE_RE.test(file))
    .sort();
}

function collectSamples(warnings) {
  const samples = [];
  const files = listRideWikiFiles();

  if (!files.length) {
    pushWarning(warnings, "NO_RIDE_WIKI_OUTPUT", "output 目录没有 ride_wiki_*.json,无法反推坐骑技能基准值");
    return samples;
  }

  for (const file of files) {
    const fullPath = path.join(OUTPUT_DIR, file);
    const json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const variants = json.data?.variants || [];

    for (const variant of variants) {
      const ride = variant.ride || {};
      for (const slot of variant.slots || []) {
        const base = slot.base;
        const header = base?.header;
        if (!base || !header) continue;
        if (!ACTIVE_SLOT_KINDS.has(base.slotKind || slot.slotKind)) continue;

        const cd = header.cd;
        if (typeof cd !== "number" || !Number.isFinite(cd) || cd <= 0) {
          continue;
        }

        for (const levelRow of base.levels || []) {
          const totalVal = levelRow.totalVal;
          if (typeof totalVal !== "number" || !Number.isFinite(totalVal) || totalVal <= 1) {
            continue;
          }

          samples.push({
            file,
            rideId: ride.id ?? null,
            rideName: ride.name ?? null,
            slot: slot.slot || null,
            slotLabel: slot.slotLabel || null,
            slotKind: base.slotKind || slot.slotKind || null,
            skillId: base.skillId,
            skillName: base.name || null,
            level: levelRow.level,
            roleLevel: levelRow.roleLevel ?? null,
            cd,
            totalVal,
            totalValPerCd: totalVal / cd,
          });
        }
      }
    }
  }

  return samples;
}

function buildClusters(samples) {
  const sorted = [...samples].sort((a, b) => a.totalValPerCd - b.totalValPerCd);
  const clusters = [];

  for (const sample of sorted) {
    let target = null;
    for (const cluster of clusters) {
      const center = median(cluster.samples.map((s) => s.totalValPerCd));
      if (relativeDiff(sample.totalValPerCd, center) <= BASELINE_CLUSTER_RELATIVE_TOLERANCE) {
        target = cluster;
        break;
      }
    }

    if (!target) {
      target = { samples: [] };
      clusters.push(target);
    }
    target.samples.push(sample);
  }

  return clusters.map((cluster) => {
    const values = cluster.samples.map((sample) => sample.totalValPerCd);
    const value = median(values);
    return {
      sampleCount: cluster.samples.length,
      value,
      valueNearestInteger: value == null ? null : Math.round(value),
      min: values.length ? values[0] : null,
      max: values.length ? values[values.length - 1] : null,
      examples: cluster.samples.slice(0, BASELINE_MIN_CLUSTER_SAMPLE_COUNT).map((sample) => ({
        rideName: sample.rideName,
        skillId: sample.skillId,
        skillName: sample.skillName,
        slotLabel: sample.slotLabel,
        totalVal: sample.totalVal,
        cd: sample.cd,
        totalValPerCd: roundTo(sample.totalValPerCd, NUMBER_DISPLAY_DIGITS),
      })),
    };
  }).sort((a, b) => b.sampleCount - a.sampleCount || a.value - b.value);
}

function inferBaselines(samples, warnings) {
  const byLevel = new Map();
  for (const sample of samples) {
    if (!byLevel.has(sample.level)) byLevel.set(sample.level, []);
    byLevel.get(sample.level).push(sample);
  }

  const baselines = [];
  for (const [level, levelSamples] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const clusters = buildClusters(levelSamples);
    const main = clusters[0] || null;
    if (!main) {
      pushWarning(warnings, "NO_BASELINE_CLUSTER", `技能等级 ${level} 没有可用聚类样本`);
      continue;
    }

    const clusterShare = main.sampleCount / levelSamples.length;
    if (
      main.sampleCount < BASELINE_MIN_CLUSTER_SAMPLE_COUNT ||
      clusterShare < BASELINE_MIN_CLUSTER_SHARE
    ) {
      pushWarning(warnings, "LOW_BASELINE_CONFIDENCE", `技能等级 ${level} 主簇样本不足或占比偏低`, {
        level,
        sampleCount: levelSamples.length,
        mainClusterSampleCount: main.sampleCount,
        mainClusterShare: roundTo(clusterShare, PERCENT_DISPLAY_DIGITS),
      });
    }

    baselines.push({
      level,
      xRaw: roundTo(main.value, NUMBER_DISPLAY_DIGITS),
      x: roundTo(main.value, NUMBER_DISPLAY_DIGITS),
      xNearestInteger: main.valueNearestInteger,
      sampleCount: levelSamples.length,
      mainClusterSampleCount: main.sampleCount,
      mainClusterShare: roundTo(clusterShare, PERCENT_DISPLAY_DIGITS),
      clusterTolerance: BASELINE_CLUSTER_RELATIVE_TOLERANCE,
      clusters: clusters.slice(0, BASELINE_MIN_CLUSTER_SAMPLE_COUNT).map((cluster) => ({
        sampleCount: cluster.sampleCount,
        xRaw: roundTo(cluster.value, NUMBER_DISPLAY_DIGITS),
        x: roundTo(cluster.value, NUMBER_DISPLAY_DIGITS),
        xNearestInteger: cluster.valueNearestInteger,
        min: roundTo(cluster.min, NUMBER_DISPLAY_DIGITS),
        max: roundTo(cluster.max, NUMBER_DISPLAY_DIGITS),
        examples: cluster.examples,
      })),
    });
  }

  return baselines;
}

function summarizeSkills(samples, baselines) {
  const baselineByLevel = new Map(baselines.map((row) => [row.level, row]));
  const grouped = new Map();

  for (const sample of samples) {
    const baseline = baselineByLevel.get(sample.level);
    if (!baseline || typeof baseline.xRaw !== "number" || baseline.xRaw <= 0) continue;
    const key = `${sample.file}|${sample.rideId}|${sample.slot}|${sample.skillId}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        file: sample.file,
        rideId: sample.rideId,
        rideName: sample.rideName,
        slot: sample.slot,
        slotLabel: sample.slotLabel,
        slotKind: sample.slotKind,
        skillId: sample.skillId,
        skillName: sample.skillName,
        cd: sample.cd,
        levels: [],
      });
    }

    grouped.get(key).levels.push({
      level: sample.level,
      roleLevel: sample.roleLevel,
      totalVal: sample.totalVal,
      xRaw: baseline.xRaw,
      x: baseline.xRaw,
      xNearestInteger: baseline.xNearestInteger,
      fixedMultiplier: roundTo(sample.totalVal / baseline.xRaw, RATIO_DISPLAY_DIGITS),
      correctionRatio: roundTo(sample.totalVal / baseline.xRaw / sample.cd, RATIO_DISPLAY_DIGITS),
    });
  }

  return [...grouped.values()].map((skill) => {
    skill.levels.sort((a, b) => a.level - b.level);
    const multipliers = skill.levels.map((level) => level.fixedMultiplier);
    const corrections = skill.levels.map((level) => level.correctionRatio);
    const multiplierMin = Math.min(...multipliers);
    const multiplierMax = Math.max(...multipliers);
    const multiplierMedian = median(multipliers);
    const multiplierRange = multiplierMax - multiplierMin;
    const multiplierRelativeRange = multiplierMedian
      ? multiplierRange / Math.abs(multiplierMedian)
      : null;
    const correctionMin = Math.min(...corrections);
    const correctionMax = Math.max(...corrections);
    const correctionMedian = median(corrections);
    const correctionRange = correctionMax - correctionMin;
    const correctionRelativeRange = correctionMedian
      ? correctionRange / Math.abs(correctionMedian)
      : null;
    const fixedMultiplierMode = multiplierRelativeRange != null &&
      multiplierRelativeRange > FIXED_MULTIPLIER_STATIC_RELATIVE_RANGE_LIMIT
        ? "growth"
        : "static";

    return {
      ...skill,
      fixedMultiplierMode,
      fixedMultiplierStats: {
        min: roundTo(multiplierMin, RATIO_DISPLAY_DIGITS),
        max: roundTo(multiplierMax, RATIO_DISPLAY_DIGITS),
        median: roundTo(multiplierMedian, RATIO_DISPLAY_DIGITS),
        range: roundTo(multiplierRange, RATIO_DISPLAY_DIGITS),
        relativeRange: multiplierRelativeRange == null ? null : roundTo(multiplierRelativeRange, PERCENT_DISPLAY_DIGITS),
      },
      correctionRatioStats: {
        min: roundTo(correctionMin, RATIO_DISPLAY_DIGITS),
        max: roundTo(correctionMax, RATIO_DISPLAY_DIGITS),
        median: roundTo(correctionMedian, RATIO_DISPLAY_DIGITS),
        range: roundTo(correctionRange, RATIO_DISPLAY_DIGITS),
        relativeRange: correctionRelativeRange == null ? null : roundTo(correctionRelativeRange, PERCENT_DISPLAY_DIGITS),
      },
      medianFixedMultiplier: roundTo(multiplierMedian, RATIO_DISPLAY_DIGITS),
      medianCorrectionRatio: roundTo(correctionMedian, RATIO_DISPLAY_DIGITS),
    };
  }).sort((a, b) =>
    String(a.file).localeCompare(String(b.file)) ||
    Number(a.rideId || 0) - Number(b.rideId || 0) ||
    String(a.slot || "").localeCompare(String(b.slot || "")) ||
    a.skillId - b.skillId
  );
}

function extract() {
  const warnings = [];
  const samples = collectSamples(warnings);
  const baselines = inferBaselines(samples, warnings);
  const skills = summarizeSkills(samples, baselines);

  u.saveOutput(OUTPUT_NAME, {
    baselines,
    skills,
    warnings,
  }, {
    system: "坐骑 → 技能数值基准值",
    source: "output/ride_wiki_*.json",
    method: "按技能等级聚类 totalVal / cd,最大主簇作为该等级坐骑 X;再计算 totalVal / X 和 (totalVal / X) / cd",
    clusterRelativeTolerance: BASELINE_CLUSTER_RELATIVE_TOLERANCE,
    fixedMultiplierStaticRelativeRangeLimit: FIXED_MULTIPLIER_STATIC_RELATIVE_RANGE_LIMIT,
    note: "不读取攻略倍率文本;缺 CD、缺固伤或仅有 0/1 占位伤害不补值;无有效 CD 的技能不进入样本",
  });
}

if (require.main === module) extract();

module.exports = extract;
