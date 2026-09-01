import { useState, useMemo } from 'react';
import CostBadge from '../ui/CostBadge';
import { clsx } from 'clsx';

interface Props {
  dataSources: Record<string, any>;
}

export default function PetGodWeapon({ dataSources }: Props) {
  const godWeaponData = (dataSources['pet_god_weapon'] as any)?.data;
  const [subSection, setSubSection] = useState<'forge' | 'upgrade' | 'star' | 'enchant' | 'synthesis'>('forge');

  // 词条搜索与品质过滤
  const [enchantSearch, setEnchantSearch] = useState<string>('');
  const [enchantQualityFilter, setEnchantQualityFilter] = useState<number | 'all'>('all');

  if (!godWeaponData) {
    return (
      <div className="card text-center py-16 border border-dashed border-border bg-surface">
        <div className="text-textSub font-medium">正在载入宠物神器数据...</div>
      </div>
    );
  }

  const {
    levelSummary,
    stars = [],
    forgePools = [],
    enchants = [],
    enchantRules,
    synthesisRules,
    qingqiuInfo
  } = godWeaponData;

  // 仅展示已开放的打造池
  const displayedForgePools = useMemo(() => {
    return forgePools.filter((p: any) => p.isOnline);
  }, [forgePools]);

  // 词条过滤
  const filteredEnchants = useMemo(() => {
    return enchants.filter((e: any) => {
      const matchSearch = !enchantSearch || e.name.includes(enchantSearch) || e.skillName?.includes(enchantSearch) || e.skillText?.includes(enchantSearch);
      const matchQuality = enchantQualityFilter === 'all' || e.quality === enchantQualityFilter;
      return matchSearch && matchQuality;
    });
  }, [enchants, enchantSearch, enchantQualityFilter]);

  // 计算等级强化的本段消耗与累计需求
  const computedLevelTiers = useMemo(() => {
    if (!levelSummary?.tiers) return [];
    const accumMap = new Map<number, { itemId: number; name: string; count: number }>();
    return levelSummary.tiers.map((tier: any) => {
      const levelCount = tier.levelEnd - tier.levelStart + 1;
      const tierTotalCosts = (tier.singleCost || []).map((c: any) => ({
        itemId: c.itemId,
        name: c.name,
        count: c.count * levelCount,
      }));

      tierTotalCosts.forEach((c: any) => {
        const prev = accumMap.get(c.itemId) || { itemId: c.itemId, name: c.name, count: 0 };
        accumMap.set(c.itemId, { ...prev, count: prev.count + c.count });
      });

      const cumulativeCosts = Array.from(accumMap.values()).map((v) => ({ ...v }));

      return {
        ...tier,
        levelCount,
        tierTotalCosts,
        cumulativeCosts,
      };
    });
  }, [levelSummary]);

  const getQualityColor = (quality: number) => {
    switch (quality) {
      case 1: return 'text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800';
      case 2: return 'text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30';
      case 3: return 'text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30';
      case 4: return 'text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-950/30';
      case 5: return 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30';
      case 6: return 'text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-600 bg-rose-50 dark:bg-rose-950/30';
      default: return 'text-textSub border-border bg-surface';
    }
  };

  return (
    <div className="space-y-6 fade-in duration-300">
      {/* 二级导航 */}
      <div className="flex gap-1.5 p-1 bg-surface border border-border rounded-xl w-max max-w-full overflow-x-auto custom-scrollbar shadow-sm">
        {[
          { id: 'forge', label: '打造与保底灵池' },
          { id: 'upgrade', label: '等级强化' },
          { id: 'star', label: '升星进阶' },
          { id: 'enchant', label: '附魔词条' },
          { id: 'synthesis', label: '灵炼与青丘奇旅' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubSection(tab.id as any)}
            className={clsx(
              "px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 shrink-0",
              subSection === tab.id
                ? "bg-primary text-white shadow-sm"
                : "text-textSub hover:text-textMain hover:bg-slate-200/60 dark:hover:bg-white/5"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ━━━━━━━━ 2. 打造与保底灵池 ━━━━━━━━ */}
      {subSection === 'forge' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {displayedForgePools.map((pool: any) => (
              <div key={pool.id} className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-border bg-textMain/5 flex justify-between items-center shrink-0">
                  <h3 className="font-bold text-base text-textMain flex items-center gap-2">
                    <span className="w-1.5 h-4 rounded-full bg-primary shrink-0"></span>
                    {pool.name}
                  </h3>
                </div>

                <div className="p-5 space-y-4 flex-1">
                  {/* 单次打造消耗 */}
                  <div className="bg-textMain/5 border border-border/60 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-textMain flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      单次打造消耗材料
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {pool.cost?.map((c: any, cIdx: number) => (
                        <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} />
                      ))}
                    </div>
                  </div>

                  {/* 4 档能量保底灵池 */}
                  {pool.freeEnergyTiers?.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="text-xs font-semibold text-textMain flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cta"></span>
                        灵石保底阶梯
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {pool.freeEnergyTiers.map((tier: any, tIdx: number) => (
                          <div key={tIdx} className="bg-textMain/5 border border-border/50 rounded-lg p-3 space-y-1.5">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-xs text-primary font-mono">
                                档位 {tIdx + 1} · {tier.thresholdEnergy} 次
                              </span>
                              <span className="text-[11px] font-semibold text-textMain">
                                保底：{tier.rewardGodWeaponName}
                              </span>
                            </div>
                            <div className="text-[11px] text-textSub space-y-0.5 font-mono">
                              <div>资质保底：≥ {tier.minQualityPercent}%</div>
                              <div>成长保底：≥ {tier.minGrowthPercent}%</div>
                              <div>词条保底：≥ {tier.minEnchantCount} 个</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ━━━━━━━━ 3. 等级强化 (0~119级) ━━━━━━━━ */}
      {subSection === 'upgrade' && (
        <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-textMain/5 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-base text-textMain flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-primary shrink-0"></span>
                宠物神器强化等级消耗表
              </h3>
            </div>
            <div className="text-xs font-mono text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg">
              共 {levelSummary?.tiers?.length || 0} 个强化阶梯
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs text-left">
              <thead className="bg-textMain/5 border-b border-border text-textSub">
                <tr>
                  <th className="p-3">等级区间</th>
                  <th className="p-3">单级消耗材料</th>
                  <th className="p-3">本段小计</th>
                  <th className="p-3">达成累计需求</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {computedLevelTiers.map((tier: any, idx: number) => (
                  <tr key={idx} className="hover:bg-textMain/5 transition-colors">
                    <td className="p-3 font-mono font-bold text-textMain whitespace-nowrap">
                      Lv.{tier.levelStart} ~ Lv.{tier.levelEnd}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {tier.singleCost?.map((c: any, cIdx: number) => (
                          <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} />
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {tier.tierTotalCosts?.map((c: any, cIdx: number) => (
                          <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} />
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {tier.cumulativeCosts?.map((c: any, cIdx: number) => (
                          <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ━━━━━━━━ 4. 升星进阶 (0~4星) ━━━━━━━━ */}
      {subSection === 'star' && (
        <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-textMain/5 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-base text-textMain flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-primary shrink-0"></span>
                宠物神器升星进阶阶梯
              </h3>
            </div>
            <div className="text-xs font-mono text-cta bg-cta/10 border border-cta/20 px-2.5 py-1 rounded-lg">
              目前全品质(白绿蓝)宠物神器消耗相同
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs text-left">
              <thead className="bg-textMain/5 border-b border-border text-textSub">
                <tr>
                  <th className="p-3">星级</th>
                  <th className="p-3">成长百分比区间</th>
                  <th className="p-3">升下一星消耗</th>
                  <th className="p-3">达成累计消耗底子</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-mono">
                {stars.map((s: any) => (
                  <tr key={s.star} className="hover:bg-textMain/5 transition-colors">
                    <td className="p-3 font-bold text-textMain text-sm">
                      ★ {s.star} 星
                    </td>
                    <td className="p-3 text-primary font-bold">
                      {s.growthMinPer} ~ {s.growthMaxPer}
                    </td>
                    <td className="p-3">
                      {s.upgradeCostSameGodWeapon > 0 ? (
                        <span className="bg-cta/10 text-cta border border-cta/20 px-2 py-0.5 rounded font-bold">
                          同名 0 星神器 ×{s.upgradeCostSameGodWeapon}
                        </span>
                      ) : (
                        <span className="text-textSub font-normal">已达满星上限</span>
                      )}
                    </td>
                    <td className="p-3 text-textMain">
                      {s.accumCostToReach} 件
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ━━━━━━━━ 5. 附魔词条池 (145条) ━━━━━━━━ */}
      {subSection === 'enchant' && (
        <div className="space-y-6">
          {/* 官方打书概率规则卡片 */}
          <div className="bg-surface border border-border rounded-xl shadow-sm p-5 space-y-3">
            <h3 className="font-bold text-base text-textMain flex items-center gap-2">
              <span className="w-1.5 h-4 rounded-full bg-cta shrink-0"></span>
              官方附魔打书顶替与共存概率机制
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {enchantRules?.officialReplaceRates?.map((rule: any, rIdx: number) => (
                <div key={rIdx} className="bg-textMain/5 border border-border/60 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between items-center text-xs font-bold text-textMain">
                    <span>当前已有词条：{rule.currentCount} 条</span>
                    <span className="text-cta font-mono">共存率 {rule.addRate}</span>
                  </div>
                  <div className="text-xs text-textSub">
                    {rule.resultDesc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 词条池列表 */}
          <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-textMain/5 flex flex-wrap justify-between items-center gap-3">
              <h3 className="font-bold text-base text-textMain flex items-center gap-2">
                <span className="w-1.5 h-4 rounded-full bg-primary shrink-0"></span>
                有效附魔词条全景表
              </h3>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="搜索词条名称或效果..."
                  value={enchantSearch}
                  onChange={(e) => setEnchantSearch(e.target.value)}
                  className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-textMain w-44"
                />
                <select
                  value={enchantQualityFilter}
                  onChange={(e) => setEnchantQualityFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-textMain"
                >
                  <option value="all">全部品质</option>
                  <option value={1}>普通</option>
                  <option value={2}>优秀</option>
                  <option value={3}>精良</option>
                  <option value={4}>史诗</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar max-h-[600px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-textMain/5 border-b border-border text-textSub sticky top-0 bg-surface z-10">
                  <tr>
                    <th className="p-3">词条名称</th>
                    <th className="p-3">品质</th>
                    <th className="p-3">技能/词条效果</th>
                    <th className="p-3">互斥组</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredEnchants.map((enc: any) => (
                    <tr key={enc.id} className="hover:bg-textMain/5 transition-colors">
                      <td className="p-3 font-bold text-textMain">
                        {enc.name}
                      </td>
                      <td className="p-3">
                        <span className={clsx("px-2 py-0.5 rounded border text-[11px] font-semibold", getQualityColor(enc.quality))}>
                          {enc.qualityLabel}
                        </span>
                      </td>
                      <td className="p-3 text-primary font-mono font-medium">
                        {enc.skillText || enc.skillName || '—'}
                      </td>
                      <td className="p-3 font-mono text-textSub">
                        {enc.repelGroup > 0 ? `组 ${enc.repelGroup}` : '无互斥'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ━━━━━━━━ 6. 灵炼与青丘奇旅 ━━━━━━━━ */}
      {subSection === 'synthesis' && (
        <div className="space-y-6">
          {/* 灵炼规则卡片 */}
          <div className="bg-surface border border-border rounded-xl shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-base text-textMain flex items-center gap-2 border-b border-border pb-3">
              <span className="w-1.5 h-4 rounded-full bg-primary shrink-0"></span>
              宠物神器灵炼
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-textMain/5 border border-border/60 rounded-lg p-3">
                <div className="text-xs font-bold text-textMain flex justify-between">
                  <span>资质遗传浮动</span>
                  <span className="text-primary font-mono">{synthesisRules?.aptitudeInheritance?.minRate} ~ {synthesisRules?.aptitudeInheritance?.maxRate}</span>
                </div>
              </div>

              <div className="bg-textMain/5 border border-border/60 rounded-lg p-3">
                <div className="text-xs font-bold text-textMain flex justify-between">
                  <span>成长值遗传浮动</span>
                  <span className="text-primary font-mono">{synthesisRules?.growthInheritance?.minRate} ~ {synthesisRules?.growthInheritance?.maxRate}</span>
                </div>
              </div>

              <div className="bg-textMain/5 border border-border/60 rounded-lg p-3">
                <div className="text-xs font-bold text-textMain flex justify-between">
                  <span>附魔词条继承率</span>
                  <span className="text-cta font-mono">逐条 {synthesisRules?.enchantInheritance?.independentRate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 青丘奇旅关卡速查 */}
          <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-textMain/5 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-textMain flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-full bg-cta shrink-0"></span>
                  青丘奇旅关卡与挂机产出
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar max-h-[500px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-textMain/5 border-b border-border text-textSub sticky top-0 bg-surface z-10">
                  <tr>
                    <th className="p-3">关卡层数</th>
                    <th className="p-3">首通通关掉落</th>
                    <th className="p-3">每5分钟挂机掉落</th>
                    <th className="p-3">24h挂机期望</th>
                    <th className="p-3">快速奇旅获取</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono">
                  {qingqiuInfo?.stages?.map((stage: any) => (
                    <tr key={stage.stageId} className="hover:bg-textMain/5 transition-colors">
                      <td className="p-3 font-bold text-textMain whitespace-nowrap">
                        第 {stage.floor} 层 · 第 {stage.sort} 关 · Lv.{stage.level}
                      </td>
                      <td className="p-3 font-sans">
                        <div className="flex gap-1.5 flex-wrap">
                          {stage.rewardBoss?.map((c: any, cIdx: number) => (
                            <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} />
                          ))}
                        </div>
                      </td>
                      <td className="p-3 font-sans">
                        <div className="flex gap-1.5 flex-wrap">
                          {stage.dropShow?.map((d: any, dIdx: number) => (
                            <span key={dIdx} className="bg-background border border-border/60 text-xs px-2 py-0.5 rounded font-mono text-textMain flex items-center gap-1">
                              <span>{d.name}</span>
                              <span className="text-primary font-bold">×{d.rangeText}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 font-sans">
                        <div className="flex gap-1.5 flex-wrap">
                          {stage.dropShow?.map((d: any, dIdx: number) => {
                            const expected24h = Math.round(((d.min + d.max) / 2) * 288);
                            return (
                              <CostBadge key={dIdx} itemId={d.itemId} name={d.name} count={expected24h} />
                            );
                          })}
                        </div>
                      </td>
                      <td className="p-3 font-sans">
                        <div className="flex gap-1.5 flex-wrap">
                          {stage.rewardFast?.map((c: any, cIdx: number) => (
                            <CostBadge key={cIdx} itemId={c.itemId} name={c.name} count={c.count} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
