# 角色技能 Wiki 数据查询链路技术说明

本文只记录角色技能 Wiki 需要用到的数据来源、查表链路、字段含义和缺失数据处理规则。

本文不包含前端接入方案、输出文件设计、开发步骤、验收流程和实施排期。

## 1. 数据来源

### 1.1 dataApi 表

角色技能查询主要依赖以下 `dataApi` 表：

```text
roleInitial.*.json
role.*.json
monster.*.json
skill.*.json
skillAwaken.*.json
skillLevel.*.json
skillText.*.json
skillExtra.*.json
skillExtraLevel.*.json
skillFix.*.json
skillRange.*.json
buff.*.json
beskill.*.json
```

核心用途：

```text
roleInitial  角色技能槽、觉醒技能组、转职技能入口
role         角色基础信息、角色名
monster      角色/形态 monster、cfgFile、monster 技能绑定
skill        技能基础配置、动作名、CD、图标、派生技能、beSkill 绑定
skillAwaken  觉醒组到实际 skillId 的映射
skillLevel   等级成长、伤害倍率、固伤、耗蓝、升级消耗、bullet 分支
buff         buff 名称、文本、数值、持续时间、成长组
beskill      被动/机制技能配置
```

### 1.2 战斗配置文件

角色技能完整链路还需要战斗配置文件：

```text
file/bullets.json
file/entityCtg/*.json
```

等价来源可为：

```text
D:\zmws\GameAnalysis\dataile
/mnt/d/zmws/GameAnalysis/data/file
```

这两个资源用于查询：

```text
技能释放时间
动作 bullet
普通伤害按动作 bullet 展开的段数
bullet hitBuff
转职/变身技能真实 cfgFile
```

缺少 `bullets.json` 或 `entityCtg` 时，不能完整计算技能段数、释放时间和 buff 绑定，应直接报错或明确标记缺失，不能静默生成假数据。

## 2. 角色展示技能链路

展示技能是页面上的一张技能卡，例如：

```text
孙悟空 技能2 升龙斩
唐三藏 转职技能1 紧箍咒
```

展示技能从 `roleInitial` 查询。

基础技能链路：

```text
roleInitial.*.json
-> roleId
-> skill1 / skill2 / skill3 / skill4 / trick / transSkill1~4
-> skill.id
```

觉醒技能链路：

```text
roleInitial.*.json
-> skill1Awaken / skill2Awaken / skill3Awaken / skill4Awaken / trickAwaken / transSkill*Awaken
-> skillAwaken.skillGroup
-> skillAwaken.skillId
-> skill.id
```

展示层级：

```text
角色
-> 技能槽
-> 基础技能或觉醒技能
-> 展示技能 display unit
```

槽位含义：

```text
skill1       技能1
skill2       技能2
skill3       技能3
skill4       技能4
trick        绝技
transSkill1  转职技能1
transSkill2  转职技能2
transSkill3  转职技能3
transSkill4  转职技能4
```

查询时应以“展示技能”为主对象，而不是直接以单个 `skill.id` 为主对象。

原因：

```text
一个展示技能可能包含多个实际 skill.id
一个觉醒组可能对应多个觉醒等级的 skill.id
一个技能可能通过 otherSkill/connectSkill 派生后续技能
```

## 3. 具体技能展开链路

具体技能是实际参与 `skillLevel` 查表和动作配置解析的 `skill.id`。

链路：

```text
displaySkillId
-> skill.id
-> skill.otherSkill
-> skill.connectSkill
-> 递归收集所有存在于 skill 表中的派生技能
```

规则：

```text
对每个展示技能收集 concreteSkillIds
concreteSkillIds 保持查询顺序
同一个 concreteSkillId 去重
不存在于 skill 表的 id 不造对象，应记录 warning
```

典型例子：

```text
5001055 踏剑行·雨落
-> skill.otherSkill = [5001056]
-> 展示技能应包含 5001055 + 5001056
```

## 4. skillLevel 查表规则

每个具体技能按官方规则查询 `skillLevel`。

### 4.1 等级行 id

如果 `skill.skillLevelId` 存在：

```text
skillLevelRowId = skill.skillLevelId + level - 1
baseSkillLevelId = skill.skillLevelId
```

如果 `skill.skillLevelId` 不存在：

```text
skillLevelRowId = skill.id * 1000 + level
baseSkillLevelId = skill.id * 1000 + 1
```

如果当前等级查不到：

```text
记录 missingSkillLevelIds / warning
不 mock
不回填假值
```

### 4.2 等级上限

等级上限不能写死。

规则：

```text
每个 concreteSkill 单独检测 skillLevel 连续等级数
展示技能 maxLevel = 该展示技能下所有 concreteSkill 的最大等级数
```

### 4.3 常用字段

`skillLevel` 常用字段：

```text
roleLevel           技能升级所需角色等级
consumeMp           当前等级耗蓝
soulCost            升级消耗
damageAddPer        普通倍率
damageAddVal        普通固伤
bullet              子弹分支 id 数组
bulletDamageAddPer  子弹分支倍率
bulletDamageAddVal  子弹分支固伤
addDefendVal        保护分/强攻相关字段
addDefendVal_1      子弹分支保护分/强攻字段
TriggerFactor       触发/召唤/被动部分会用的等级系数
breakAddPer         break/protect 通道倍率
roleAddPer          角色修正字段
custom              特殊字段
```

## 5. 动作配置 cfgFile 查询链路

释放时间、动作 bullet、动作 buff 来自 `entityCtg/{cfgFile}.json`。

基础链路：

```text
monster.*.json
-> monster.id = roleId
-> monster.cfgFile
-> file/entityCtg/{cfgFile}.json
-> skill.entityAction
-> entityCtg[entityAction]
-> entityCtg.time[entityAction]
```

不能只按 `roleId -> monster.cfgFile` 查询，因为转职/变身技能可能属于形态 monster。

### 5.1 转职/变身 cfgFile 解析

输入：展示技能 + 具体技能。

如果槽位是 `transSkill*`：

```text
先从 monster.skillIds / monster.skyskillIds / monster.vSkill 反查包含 skill.id 的 monster
在这些 monster.cfgFile 中寻找存在 skill.entityAction 的 cfgFile
找不到再尝试 roleId 对应的本体 cfgFile
```

如果槽位不是 `transSkill*`：

```text
先尝试 roleId 对应的本体 cfgFile
如果本体 cfgFile 不存在 skill.entityAction
再从包含 skill.id 的 monster.cfgFile 中寻找
```

建议记录的解析结果：

```text
cfgFileResolved
cfgResolveSource
cfgMonsterId
cfgMonsterName
hasActionCfg
```

典型例子：

```text
唐三藏 transSkill1 = 2001240 紧箍咒
skill.entityAction = skill2
唐僧本体 02-monster_cfg_ts.json 没有 skill2
monster 102 金蝉子 cfgFile = 102-monster_cfg_tsbs
102-monster_cfg_tsbs.json 存在 skill2
最终 cfgFileResolved = 102-monster_cfg_tsbs
```

## 6. 释放时间查询规则

释放时间来自已解析的动作配置：

```text
resolved entity cfg
-> time[skill.entityAction]
-> releaseFrames
-> releaseSeconds = releaseFrames / 30
```

源码默认规则：

```text
this.mActionCfg.time[e.entityAction] || 30
```

导出或分析时建议区分来源：

```text
如果 resolved cfg 存在 time[entityAction]：
releaseTimeSource = entityCtg.time
releaseFrames = 配置值

如果 resolved cfg 存在 action 但 time 缺失：
releaseTimeSource = sourceDefault30
releaseFrames = 30
记录 warning，说明来自源码默认 30 帧

如果没有 resolved cfg 或 action：
releaseTimeSource = actionCfgMissing
releaseFrames = null
不能伪造成 30
```

## 7. 伤害与段数查询链路

伤害展示总公式：

```text
攻击 * totalDamageAddPer + totalDamageAddVal
```

每个展示技能、每一级应合并所有具体技能的伤害组件。

伤害组件来源分三类。

### 7.1 子弹分支伤害 bullet

当 `skillLevel.bullet` 存在时：

```text
skillLevel.bullet[index]
-> bulletDamageAddPer[index]
-> bulletDamageAddVal[index]
-> addDefendVal_1[index] 或 addDefendVal
-> bullets.json 中按 bullet.id 查找 bullet
-> bullet.com[]
-> 过滤顶层 isNotDamage === 1 的非伤害 com
-> 每个有效顶层伤害 com 形成一个 damage component
-> com.maxHit 决定该阶段最大命中次数，缺失时按 1
```

注意：

```text
bullet 查找必须使用 bullet.id
不能用 bullets 数组下标兜底
```

数组取值规则：

```text
如果 bulletDamageAddPer[index] 是数组：
第 N 个有效伤害 com 使用数组第 N 项
超出数组长度使用最后一项

如果 bulletDamageAddVal[index] 是数组：
同上
```

典型例子：

```text
1001180 火魔斩
skillLevel.bullet = [11]
bulletDamageAddPer = [[0.221, 3.056]]
bulletDamageAddVal = [[15, 204]]
bullet 11 有两个有效顶层伤害 com
com[0].maxHit = 7
com[1].maxHit = 1
总计 7 段低伤 + 1 段高伤
```

### 7.2 普通字段 + 动作 bullet normalActionBullet

当 `skillLevel.bullet` 为空，但动作配置里有 bullet：

```text
entityCtg[entityAction].com[]
-> type === 2
-> bId
-> bullets.json 中按 bullet.id 查找 bullet
-> bullet.com[] 有效顶层伤害 com
-> 使用 skillLevel.damageAddPer / damageAddVal
-> 按 com.maxHit 展开段数
```

典型例子：

```text
1001160 升龙斩
skillLevel 没有 bullet
damageAddPer = 0.7
damageAddVal = 47
动作 bullet 有 4 次有效命中
正确总伤 = 攻击 * 2.8 + 188
```

### 7.3 普通 1 段 normal

当没有 `skillLevel.bullet`，动作配置也没有有效伤害 bullet：

```text
使用 skillLevel.damageAddPer / damageAddVal
maxHit = 1
```

### 7.4 非伤害 com 与 buff com

`bullet.com[]` 顶层 `isNotDamage === 1` 时，不应计入伤害段数。

但这类 com 及其子 `com[]` 仍可能携带 buff，例如：

```text
hitBuff
hitBuffFlyMonster
hitBuffNoFlyMonster
hitBuffPet
hitBuffRide
```

因此伤害计算和 buff 扫描要分开处理：

```text
伤害段：只统计顶层有效伤害 com
buff：可以递归扫描 action.com 与 bullet.com 的 buff 字段
```

典型例子：

```text
2001240 紧箍咒
bullet 100 顶层 com isNotDamage = 1，maxHit = 99
该段用于持续控制和 buff，不应按 99 段计入伤害
紧箍咒 lv20 总伤应为 攻击 * 2.3 + 41380
```

## 8. buff / beskill 查询链路

buff 绑定来源至少有 5 类。

### 8.1 skill.beSkill / skill.beSkill2

链路：

```text
skill.beSkill / skill.beSkill2
-> beskill.*.json
-> beskill.attribute / otherData / effect / initEffect
```

输出或分析归类：

```text
bindSource = beSkill 或 beSkill2
targetKind = beskill
```

### 8.2 entityAction.com 直接 buff

链路：

```text
entityCtg/{cfgFile}.json
-> entityAction
-> com[]
-> buff / buffId / buffIds / mainBuffIds / initBuffs / dieBuffs / lineBuffs / offBuffs 等字段
-> buff.*.json
```

归类：

```text
bindSource = entityActionComBuff
targetKind = buff
```

### 8.3 bullet hitBuff

链路：

```text
entityAction.com[].type = 2
-> bId
-> bullets.json 对应 bullet
-> bullet.com[].com[].hitBuff / hitBuffFlyMonster / hitBuffNoFlyMonster / hitBuffPet / hitBuffRide
-> buff.*.json
```

归类：

```text
bindSource = bulletHitBuff
targetKind = buff
```

典型例子：

```text
2001240 紧箍咒
102-monster_cfg_tsbs.skill2.com[0] -> bId = 99
102-monster_cfg_tsbs.skill2.com[2] -> bId = 100
bullet 99 -> hitBuff [26000301]
bullet 100 -> hitBuff [4003301, 120000301, 8000501]
```

### 8.4 buff.endSourceSkill

链路：

```text
buff.*.json
-> endSourceSkill
-> skill.id
```

归类：

```text
bindSource = buff.endSourceSkill
targetKind = skill
```

### 8.5 custom / otherData 特殊字段

`custom`、`otherData` 等字段可能描述特殊机制，但不应强行解释成伤害或 buff。

处理原则：

```text
保留原始摘要
不参与总伤计算
不伪造成 buff
```

## 9. buff 成长查询规则

buff 分为固定 buff 与成长 buff。

判断规则：

```text
baseBuffId = 配置源头写的 buffId

如果 buff 表存在 baseBuffId + 1：
levelMode = growth
effectiveBuffId = baseBuffId + level - 1

如果 buff 表不存在 baseBuffId + 1：
levelMode = fixed
effectiveBuffId = baseBuffId

如果判断为 growth 但某一级 effectiveBuffId 缺失：
levelMode = fallback
effectiveBuffId = baseBuffId
记录 warning
```

典型例子：

```text
2001240 紧箍咒
26000301 禁足：fixed
4003301 移速弱化：fixed
120000301 禁跳：fixed
8000501 闪避弱化：growth，lv20 -> 8000520
```

治疗类成长 buff 示例：

```text
2001050 天降甘露
通过动作配置或 bullet buff 找到治疗 buff 基础 id
lv1 与 lv20 的 effectiveBuffId 不同
buff.value 随等级变化
```

易伤类成长 buff 示例：

```text
3001042 开天辟地·透劲
从 bullet hitBuff 扫到成长易伤 buff
lv1 -> 71000101
lv20 -> 71000120
```

## 10. 关键查询样例

### 10.1 火魔斩

```text
角色：孙悟空
技能：1001180 火魔斩
链路：roleInitial.skill4 -> skill 1001180 -> skillLevel -> bullet 11
伤害来源：skillLevel.bullet
段数：7 + 1
```

### 10.2 升龙斩

```text
角色：孙悟空
技能：1001160 升龙斩
链路：roleInitial.skill2 -> skill 1001160 -> entityAction -> action bullet -> bullet 9
伤害来源：normalActionBullet
段数：1 + 1 + 2
```

### 10.3 踏剑行·雨落

```text
角色：龙女
技能：5001055 踏剑行·雨落
链路：skill 5001055 -> otherSkill [5001056]
展示技能应合并 5001055 与 5001056
```

### 10.4 紧箍咒

```text
角色：唐三藏
槽位：transSkill1
技能：2001240 紧箍咒
本体 cfgFile：02-monster_cfg_ts
形态 monster：102 金蝉子
真实 cfgFile：102-monster_cfg_tsbs
entityAction：skill2
releaseFrames：24
lv20 总伤：攻击 * 2.3 + 41380
固定 buff：26000301 / 4003301 / 120000301
成长 buff：8000501，lv20 -> 8000520
```

## 11. 缺失与异常处理原则

禁止：

```text
禁止 mock 不存在的 skillLevel
禁止把缺失 cfgFile 当作 30 帧真实配置
禁止用 bullets 数组下标兜底 bullet.id
禁止把固定 buff 伪装成成长 buff
禁止把转职技能强行绑定到本体 cfgFile
禁止把 isNotDamage === 1 的控制类 bullet com 计入伤害段数
```

必须：

```text
缺少关键资源直接报错
缺少单个技能等级写入 warning
缺少 bullet 写入 warning
缺少 buff 写入 warning
缺少 beskill 写入 warning
缺少 action cfg 写入 warning
```

建议 warning code：

```text
MISSING_SKILL
MISSING_SKILL_LEVEL
MISSING_BULLET
MISSING_BUFF
MISSING_BESKILL
MISSING_ENTITY_CFG
MISSING_ACTION_CFG
SOURCE_DEFAULT_30_FRAMES
GROWTH_BUFF_LEVEL_MISSING
```
