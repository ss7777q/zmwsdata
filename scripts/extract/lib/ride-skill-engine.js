/** 坐骑专用规则，避免改变角色、宠物的既有解析口径。 */
const eng = require('./skill-engine');

function resolveReleaseTime(entityCfg, action, hasActionCfg, warnings, skill) {
  // entityLogic.getSkillFrame: loopTime 优先于 entityCtg.time，单位为秒。
  if (typeof skill?.loopTime === 'number' && skill.loopTime > 0) {
    const releaseFrames = Math.ceil(30 * skill.loopTime);
    return { releaseFrames, releaseSeconds: releaseFrames / 30, releaseTimeSource: 'skill.loopTime' };
  }
  if (Array.isArray(skill?.loopTime)) {
    warnings.push({ code: 'VARIABLE_RELEASE_TIME', detail: `skill ${skill.id} 使用随机 loopTime，不生成固定攻转` });
    return { releaseFrames: null, releaseSeconds: null, releaseTimeSource: 'skill.loopTime:variable' };
  }
  return eng.resolveReleaseTime(entityCfg, action, hasActionCfg, warnings);
}

// notActive 组件可以被 start/end 等信号唤起，不能一律删掉，也不能全部累加。
const SIGNAL_FIELDS = ['startCom', 'endCom', 'endHitCom', 'endNoHitCom', 'hitDeadCom', 'hitDeadCom2', 'hitCom', 'comIds'];
function reachableActionComs(actionCfg) {
  const all = actionCfg?.com || [];
  const reached = new Set(all.filter(c => !c.notActive));
  const queue = [...reached];
  for (let i = 0; i < queue.length; i++) {
    for (const field of SIGNAL_FIELDS) {
      for (const sign of [].concat(queue[i][field] || [])) {
        for (const next of all) {
          if (next.sign === sign && !reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
      }
    }
  }
  return all.filter(c => reached.has(c));
}

function computeActionDamage(skill, row, actionCfg, warnings) {
  if (row?.bullet?.length) return eng.computeDamageSegments(skill, row, actionCfg, warnings);
  const segments = [];
  const shared = new Map();
  for (const c of reachableActionComs(actionCfg)) {
    if (c.type !== 2 || c.bId == null) continue;
    const bullet = eng.getBullet(c.bId, warnings);
    const coms = (bullet?.com || []).filter(hit => hit.isNotDamage !== 1);
    const hits = coms.reduce((sum, hit) => sum + (hit.maxHit || 1), 0);
    if (!hits) continue;
    // bulletLogic.recordHitList / bulletUtils.syncShareHit 共享同一目标的命中计数。
    if (c.shareHit) {
      const prev = shared.get(c.shareHit);
      if (prev) {
        prev.maxHit = Math.max(prev.maxHit, hits);
        continue;
      }
    }
    const segment = { per: row?.damageAddPer ?? 0, val: row?.damageAddVal ?? 0,
      maxHit: hits, from: `actionBullet:${c.bId}` };
    segments.push(segment);
    if (c.shareHit) shared.set(c.shareHit, segment);
  }
  return {
    kind: segments.length ? 'normalActionBullet' : 'effectOnly', segments,
    totalPer: segments.length ? segments.reduce((sum, s) => sum + s.per * s.maxHit, 0) : null,
    totalVal: segments.length ? segments.reduce((sum, s) => sum + s.val * s.maxHit, 0) : null,
  };
}

function computeFirstHitBulletSegments(row, bullet, buffById, level) {
  if (!bullet) throw new Error('缺少首次命中伤害弹幕配置');
  const hitComponents = (bullet.com || []).filter((com) => com.type === 1).sort((a, b) => a.t - b.t);
  const perValues = row.bulletDamageAddPer?.[0];
  const valValues = row.bulletDamageAddVal?.[0];
  if (!Array.isArray(perValues) || !Array.isArray(valValues)) {
    throw new Error(`弹幕 ${bullet.id} 缺少分段伤害数组`);
  }
  const segments = [];
  for (const baseId of bullet.firstHitAddBuffs || []) {
    const buff = buffById.get(baseId + level - 1);
    if (buff?.type !== 155 || typeof buff.value?.atkPer !== 'number' || typeof buff.value?.atkVal !== 'number') {
      throw new Error(`弹幕 ${bullet.id} 缺少等级 ${level} 的首次命中伤害 ${baseId}`);
    }
    segments.push({ per: buff.value.atkPer, val: buff.value.atkVal, maxHit: 1, from: `首次命中附加:${buff.id}` });
  }
  hitComponents.forEach((com, index) => {
    if (com.isNotDamage) return;
    if (typeof perValues[index] !== 'number' || typeof valValues[index] !== 'number') {
      throw new Error(`弹幕 ${bullet.id} 的伤害数组缺少判定 ${index + 1}`);
    }
    segments.push({ per: perValues[index], val: valValues[index], maxHit: com.maxHit || 1, from: `bullet:${bullet.id}@${com.t}` });
  });
  return segments;
}

module.exports = { ...eng, resolveReleaseTime, reachableActionComs, computeActionDamage, computeFirstHitBulletSegments };
