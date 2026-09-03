---
id: combat-damage-and-resistance-algorithms
title: 伤害计算链路、增减益修正叠加与全抗性算法深度解析
category: 战斗机制
readingMinutes: 8
sourceFile: 伤害计算链路详细分析报告.md
summary: 深度拆解造梦无双底层 14 项面板属性对伤害的计算链路、普通伤害与真实伤害判定、防御因子与副六维等级压制、增免伤非线性修正叠加法，以及控制抗性、抓取抗性、强攻抗性与属性/角色抗性的底层触发和判定规则。
---

## 玩家提问

造梦无双里的最终伤害到底是怎么计算的？命中闪避、暴击韧性如何换算？防御和穿透减伤是怎么生效的？为什么增伤和免伤不能直接加减？游戏里的绿抗、蓝抗、黄抗以及属性抗性与角色抗性又是怎么触发和判定的？

## 核心机制

- **14 项面板属性与分类体系**：
  游戏内角色、宠物、坐骑及怪物实体均拥有统一的 14 项核心面板属性（底层定义于 `godWarFightStarAttribute`）：
  1. **基础属性（6项）**：生命（`hp`）、攻击（`atk`）、防御（`def`）、回血（`healHp`）、魔法（`mp`）、回魔（`healMp`）；
  2. **副六维属性（6项）**：命中（`hitVal`）、闪避（`dodge`）、暴击（`crit`）、韧性（`tenacity`）、幸运（`lucky`）、守护（`guardian`）；
  3. **特殊属性（2项）**：穿透（`break`）、减伤（`protect`）。

- **伤害类型与分流判断**：
  伤害在底层入口分为普通伤害（普伤）与真实伤害（真伤）：
  1. **普通伤害（普伤）**：由绝大多数攻击或技能动作造成，受攻击方穿透、守方防御、减伤、暴击、格挡以及 $0.95 \sim 1.05$ 的数值浮动影响；
  2. **真实伤害（真伤）**：主要表现为灼烧、中毒等流血 BUFF 状态，无数值浮动，不受守方防御、穿透与减伤影响，直接按固定系数与属性抗性结算。

- **基础普伤计算公式**：
  一次标准普通伤害的基础公式为：
  $$
  D_{\text{base}} = \left( A_{\text{atk}} \times k_{\text{rand}} \times k_{\text{atk}} + V_{\text{atk}} \times k_{\text{rand}} + V_{\text{fix}} \right) \times (1 - m) \times (1 + k_{\text{crit}} - k_{\text{block}}) + (A_{\text{break}} - A_{\text{protect}}) \times k_{\text{rand}} \times k_{\text{break}}
  $$
  其中：
  - $A_{\text{atk}}$ 为攻击方面板攻击力；
  - $k_{\text{atk}}$ 为技能攻击百分比（`atkPer`），$V_{\text{atk}}$ 为技能固定攻击力（`atkVal`），$V_{\text{fix}}$ 为定伤加成（`fixAddDamage`）；
  - $k_{\text{rand}}$ 为随机浮动系数（区间为 $[0.95, 1.05]$）；
  - $m$ 为防御减伤因子；
  - $k_{\text{crit}}$ 为暴击额外增伤倍率，$k_{\text{block}}$ 为格挡减免率；
  - $(A_{\text{break}} - A_{\text{protect}}) \times k_{\text{rand}} \times k_{\text{break}}$ 为独立的穿透净收益通道（穿透系数 $k_{\text{break}}$ 绝大多数等于 $k_{\text{atk}}$）。

- **防御减伤因子 $m$ 的数学算法**：
  防御根据正负值走不同分支（$S_{\text{def}}$ 为攻方等级对应的防御抗值标准 `phyDefStandard`）：
  $$
  m = \begin{cases} 
  \frac{\text{def}}{\text{def} + S_{\text{def}}}, & \text{def} \ge 0 \\ 
  \frac{\text{def}}{S_{\text{def}}}, & \text{def} < 0 
  \end{cases}
  $$
  - 当防御为正时，$m \in [0, 1)$，受击系数 $(1 - m) = \frac{S_{\text{def}}}{\text{def} + S_{\text{def}}}$，表现为伤害按双曲线减免；
  - 当防御为负时，$m < 0$，受击系数 $(1 - m) = 1 + \frac{|\text{def}|}{S_{\text{def}}}$，表现为伤害线性放大；
  - 源码中不存在“防御大于攻击时额外减半”的逻辑。

- **副六维对立中值与等级压制机制**：
  副六维采用三组对立关系：【命中 vs 闪避】、【暴击 vs 韧性】、【幸运 vs 守护】。等级压制通过等级抗值表（`exp.json` 中的 `commonStandard`，设为 $S$）来实现：
  1. **命中与闪避几率**：
     属性中值差为：
     $$
     x = \frac{A_{\text{hit}}}{S_{\text{defender}}} - \frac{A_{\text{dodge}}}{S_{\text{attacker}}}
     $$
     最终命中率公式为：
     $$
     H = 1 + \frac{x}{|x| + 1} - B_{\text{dodge}} + B_{\text{hit}}
     $$
     当 $x \ge 0$ 时，$H \ge 100\%$ 必定命中；当 $x < 0$ 时，出现闪避，闪避率上限被压缩在 $100\%$ 以内。
  2. **暴击与格挡的互斥抵消**：
     暴击净值差为：
     $$
     C = \frac{A_{\text{crit}}}{S_{\text{defender}}} - \frac{A_{\text{tenacity}}}{S_{\text{attacker}}} + B_{\text{crit}}
     $$
     - 若 $C > 0$：暴击概率为 $C$；
     - 若 $C < 0$：该判定转为触发守方的格挡，格挡几率为 $|C|$。
  3. **暴击增伤与格挡减免幅度**：
     - **暴击额外倍率**：$k_{\text{crit}} = \text{clamp}\left(1 + \frac{A_{\text{lucky}}}{S_{\text{defender}}} - \frac{A_{\text{guard}}}{S_{\text{attacker}}}, 0, 3\right)$。基础倍率为 1（即造成 2 倍伤害），最大为 4 倍伤害；
     - **格挡减免率**：令 $raw = \text{clamp}\left(1 + \frac{A_{\text{guard}}}{S_{\text{attacker}}} - \frac{A_{\text{lucky}}}{S_{\text{defender}}}, 0, 3\right)$，减免比例为 $k_{\text{block}} = \frac{raw}{raw + 1}$。基础减免率为 50%，最大减免 75%。

- **增减益效果叠加的两套底层算法**：
  1. **常规加减法（面板属性 BUFF）**：
     适用于攻击、生命上限、防御、回血、暴击等直接数值：
     $$
     \Delta P = P_{\text{base}} \times \left(\sum \text{增幅} - \sum \text{降幅}\right) + \sum \text{固定增量} - \sum \text{固定减量}
     $$
  2. **增免伤与移速修正叠加法（非线性映射）**：
     适用于百分比增伤/免伤与移速。为了防止 100% 免伤被线性增伤直接抵消击穿，系统引入对偶尺度映射：
     - 任何免伤率 $y \in [0, 1)$ 转换为等效降幅：$y' = \frac{y}{1 - y}$；
     - 计算净修正幅度：$u = \sum x_i - \sum y'_j$；
     - 底层计算（`index.61e25.js:275390`）：
       $$
       c_{\text{final}} = \begin{cases}
       1 + u, & u \ge 0 \quad (\text{表现为净增伤}) \\
       1 - \frac{|u|}{1 + |u|} = \frac{1}{1 + |u|}, & u < 0 \quad (\text{表现为净免伤})
       \end{cases}
       $$
       最终伤害为 $D_{\text{base}} \times c_{\text{final}} + V_{\text{fix\_add}}$。

- **全抗性与霸体保护机制（经底层配置帧数校验，30帧=1秒）**：
  1. **控制抗性（绿抗，Buff ID 126000101）**：
     - 受控制异常（晕眩、冰冻、定身、魅惑等）时触发，每受 1 次增加 1 层，持续 **2700 帧（90 秒）**，加层不刷新时间；
     - 第 1 层减少 25% 控制时间，第 2 层减少 50%，第 3 层减少 100%（完全免疫控制）；
     - 妖王白条击破刷新期间（Buff ID 126000201）持续 **150 帧（5 秒）** 免疫控制；魔王复活（Buff ID 126000301）持续 **1800 帧（60 秒）** 免疫控制。
  2. **抓取抗性（蓝抗，Buff ID 221000101）**：
     - 普通霸体单位被特定附带抓取标记的技能命中时获得 1 层【抓取标记】（Buff ID 142002001，持续 2700 帧/90秒，加层刷新时间）；
     - 累积满 3 层后自动转化为【抓取抗性】（Buff ID 221000101），持续 **1800 帧（60 秒）**，期间完全免疫强制抓取。
  3. **强攻抗性（黄抗，Buff ID 197000101）**：
     - 普通霸体单位受到强攻（强制击飞）时获得 1 层【强攻标记】（Buff ID 142001401，持续 2700 帧/90秒）；
     - 累积满 2 层后转化为【强攻抗性】（Buff ID 197000101），持续 **2700 帧（90 秒）**；
     - **作用机制**：将单位的普通霸体临时升级为“超级霸体”（受到攻击无硬直，且无视强攻与抓取）。
  4. **伤害类抗性（属性抗性与角色抗性）**：
     - 10 种属性中，物理属性为真正无属性，无对应抗性；金属性仅在十绝阵阵主身上生效；
     - 抗性为正值时，减伤幅度为 $\frac{\text{resist}}{100 + \text{resist}}$（100抗性减伤 50%）；抗性为负值时，增伤幅度为 $\frac{|\text{resist}|}{100}$（-20抗性增伤 20%）；
     - 角色抗性（`monster.resistRole`）：用于副本中针对特定角色的伤害调整；
     - 天道角色抗性（`monster.resistRolePvp`）：仅在天道之战 PVP（`skyWar`）中生效的专属对位平衡抗性。
  5. **别称对照**：
     - 玩家俗称的“天机领域”即配置表中的“十绝阵”（天绝、地烈、风吼、寒冰、金光、化血、烈焰、落魂、红水、红砂）；
     - “天机噩梦”即“十绝阵·噩梦”（关卡 ID 999154104 ~ 999159104）。

## 报告校验片段

- g = 守方def
- m = g < 0 ? g / phyDefStandard : g / (g + phyDefStandard)
- this.mConfig.resistRolePvp[t.mConfig.groupId]
