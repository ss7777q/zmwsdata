# 昆仑塔系解析 · 玩家文案规范

目标读者是普通玩家。玩家关心**机制怎么运作、数值是多少**,不关心数据从哪张表/哪个字段/哪个子弹 id 来的。

## 禁止出现在任何玩家可见字段中(overview / role / targeting / counters / weaknesses / synergy / levels[].mechanics / skills[].desc / skills[].name(如为槽位名) / buffs[].effect / special 的展示值)

- 表字段名与引擎参数名:lockRange、maxRadius、atkCd、atkIds、skillIds、vSkill、vskill1、appearSkill、initVskill、initBuff、entityAction、entityCtg、hitInteval、hitBuff、hitBuffNoFlyMonster、damageAddPer、decreasePercentage、fettersBuild、toMyCMId、otherData、replaceRule、maxPiles、debuff等级、value[...]、time=30、weight=[7,2]、atkPer、bId、com、cfg 等一切驼峰/内部命名
- 各类内部 id:子弹 id(102951 等)、buff id(4061201 等)、skill id(21569010101 等)、StringText id(60002 等)、monster id、特效资源名(quan_1、skill1_1、toumaota1 等)
- 数据溯源表述:"表内""配置里""entityCtg 挖出""在 xx 表中""字段为""据引擎代码"等。溯源信息只允许放在 sources 字段(该字段不面向玩家展示)
- 帧数原值:一律换算成秒后只写秒("持续1秒",不写"time=30")

## 应该怎么写

- 机制用大白话:"三道光束横在阴阳两塔之间,光束里的敌人每 0.4 秒受到一次阴塔攻击力 100% 的伤害,并被减速 50%(持续 1 秒,光束持续照射下近似常驻)"
- 数值直接给结论:攻击系数、真实数值、间隔秒数、概率百分比、持续秒数、范围用"约 X 距离/接近全屏"等玩家能感知的说法
- 攻击/伤害基数说清楚:"按塔攻击力的 x%"“按怪物最大生命的 x%”
- 等级差异写成对比:"2 级相比 1 级:攻击系数 0.624→1.392,跳伤间隔 1 秒→0.7 秒,新增命中减速 25%"
- 官方图鉴文案可引用(它本来就是给玩家看的)
- 不确定的内容留在 uncertainties(内部字段),正文里不要写"未查实/推断依据"之类的话;若必须提示不确定,最多用"(实测可能略有出入)"

## 字段用途约定

- skills[].name:写玩家视角的技能名("元磁光束""开启范围圈"),不写槽位("skill1""vskill1")
- skills[].desc:只写效果与数值
- buffs[].name/effect:写效果名与人话效果("移速弱化:-25% 移动速度,持续 1 秒")
- sources / uncertainties:内部字段,可保留技术细节,前端不展示或折叠展示
