# 角色技能 Wiki —— Agent 开发指南（流程 / 协作 / SOP）

> 本文是**给 AI agent 看的开发流程文档**。讲「怎么把一个新角色从零做到上线、卡在哪要停下来等用户」。
>
> **数据怎么查**不在本文——那是 [`角色wiki开发.md`](角色wiki开发.md) 的职责（数据来源、查表链路、字段含义、缺失处理铁律）。两份文档配合：本文讲流程，那份讲规则。**动手前两份都要读。**

---

## 0. 给接手 agent 的 TL;DR

你要做的是：给某个角色生成一份精确的技能 Wiki 数据，前端能渲染成「表头区（不成长）+ 成长区（随等级）」的技能卡。

铁律（违反即返工）：
- **只用真实数据，绝不 mock / 回填假值 / 猜 buff。** 缺数据写 warning。详见 `角色wiki开发.md` 第 11 节。
- **WSL/Bash 访问不了 D 盘。** 所有数据探查、跑脚本必须用 **PowerShell + node**，Windows 风格路径。
- **战斗配置已落地项目内**：`bullets.json` + `entityCtg/` 已复制到 `file/battle-config/`（性质同 map-cache：在 `.gitignore` 内，不进 git，是本地缓存）。引擎优先读这里，本地缺失才回退外部源 `D:/zmws/GameAnalysis/data/file`。游戏更新后需手动重新复制。
- **每个角色机制不同，不能一键导出。** 必须逐角色分析（觉醒是否合并、哪些 buff 要覆盖）。
- **前端是纯渲染层，永远不在前端做计算/解析。** 所有适配在导出脚本阶段完成。

**唯一强制停下来等用户确认的节点：动手前定机制**（见第 2 步）。其余节点正常推进，做完给用户看成品。

---

## 1. 四层架构（文件在哪）

```
第1层 通用查表引擎  scripts/extract/lib/skill-engine.js   ← 已稳定,一般不动
第2层 覆盖机制      scripts/extract/lib/overrides.js      ← 已稳定,一般不动
第2层 角色提取脚本  scripts/extract/role_wiki_<role>.js   ← 每角色一个,新角色照抄孙悟空改
第2层 覆盖文件      scripts/extract/overrides/<role>.json ← 每角色一个,手动适配 buff/技能文案
第3层 输出 JSON     output/role_wiki_<role>.json          ← 脚本产出,前端自动可读
第4层 前端          frontend/src/pages/RoleWiki.tsx       ← 注册角色一行
                    frontend/src/components/wiki/SkillCard.tsx ← 卡片组件,一般不动
```

样板：孙悟空 `role_wiki_wukong.js` / `overrides/wukong.json` / `output/role_wiki_wukong.json`。**新角色一律照抄孙悟空那套改，不要另起炉灶。**

引擎已封装的能力（直接调，别重写）：`resolveConcreteSkills` / `querySkillLevel` / `detectMaxLevel` / `resolveCfgFile` / `resolveReleaseTime` / `computeDamageSegments` / `scanBuffs` / `resolveBuffGrowth`。详见 `skill-engine.js` 注释与 `角色wiki开发.md`。

---

## 2. 标准开发流程（SOP）

### 第 0 步：读文档 + 读攻略
1. 读本文 + `角色wiki开发.md`（数据链路铁律）。
2. **攻略是权威对照答案。** 读 `temp/` 下的攻略 Excel（猴2猪 sheet 等），提取本角色相关行，作为引擎算出数值的「标准答案」。读法见记忆 `role-wiki-guide-xlsx`。无 xlsx 库时用 PowerShell Excel COM：`UsedRange.Value2 → ConvertTo-Json → UTF8 无 BOM`。

### 第 1 步：探数据（只读，不写脚本）
用 PowerShell + node 探这个角色：
- `roleInitial` 里该 roleId 的 9 个技能槽（skill1~4 / trick / transSkill1~4）+ 各槽觉醒 id。
- 本体 monster.id、cfgFile；变身/转职的形态 monster（makeupMonsterId）与其 cfgFile。
- 抽 1~2 个技能手工走通链路（skillLevel → bullet/动作 → 段数），跟攻略核对，确认引擎能算对。

### 第 2 步：⚠️ 定机制——【停下来等用户确认】
这是**唯一强制的人工介入点**（用户已确认：只在动手前介入）。把下面三件事列清楚给用户，等用户拍板再继续：

1. **特殊机制**：这角色有没有引擎默认链路覆盖不了的东西？（多阶段技能要合总固伤、变身形态、召唤物、被动叠层…）
2. **觉醒合并**：哪些觉醒与基础数值全等应合并成一张卡、哪些不同要独立展示？（先按「数值全等即合并」自动判定，列出判定结果让用户核对）
3. **需要覆盖的 buff**：哪些 buff 引擎默认渲染（如 `-13.6% + -9`）不可读、需要写 displayText？列出候选。

> 用户确认前不要大规模写提取脚本/覆盖文件。这一步对齐成本最低、返工成本最高。

### 第 3 步：写提取脚本
照抄 `role_wiki_wukong.js` 改：改 `ROLE_ID`、`ROLE_OVERRIDE`（角色英文短名，对应覆盖文件名）、`SLOTS`（一般不变）。多阶段总固伤等特殊机制按第 2 步确认的方案实现。

### 第 4 步：生成覆盖脚手架 + 填 displayText
```powershell
node scripts/extract/role_wiki_<role>.js --emit-template
```
→ 生成 `overrides/<role>.template.json`，每个 buff 列出 `_raw`（原始字段）、`_computed`（预算好的 `13.6%`/`5s` 等可直接抄）、`_engineDisplayText`（当前默认渲染）、`_usedBySkills`。

**覆盖归属（用户已确认：agent 先填，你再改）**：
- agent 结合攻略，把**能确定**的 buff 的 `displayText` 填进 `overrides/<role>.json`（不是 template 文件）。
- **拿不准的留空并标注**（比如在该项加 `"_todo": "20160 含义待确认"`），不要自己猜数值含义。
- 占位符语法见第 3 节。

### 第 5 步：跑正式导出 + 自查
```powershell
node scripts/extract/role_wiki_<role>.js
```
- 控制台摘要核对：段数 / per / 释放帧 / maxLevel 与攻略一致。
- 抽查 output JSON 里几个技能的总伤、buff displayText。
- **OVERRIDE_* / MISSING_* warning 数应合理**（覆盖文件没笔误时 OVERRIDE 类应为 0）。

### 第 6 步：前端注册（一行）
`frontend/src/pages/RoleWiki.tsx` 的 `ROLES` 数组加一项：
```ts
const ROLES = [
  { key: 'role_wiki_wukong', name: '孙悟空' },
  { key: 'role_wiki_<role>', name: '<角色中文名>' },  // ← 加这行
];
```
（App.tsx / useGameData.ts / SideNav.tsx 的 `role_wiki` system 接入孙悟空时已做过，新角色不用再动。）

### 第 7 步：验证
- `cd frontend && node node_modules/typescript/bin/tsc --noEmit` 零错。
- `node node_modules/vite/bin/vite.js build` 通过。
- `npm run dev` 开 role_wiki 页，切到新角色，9 槽卡片正常、拖 Lv 数值联动、觉醒合并/展开正确、buff 文案可读、无报错。
- **抽查总伤/buff 与攻略 Excel 吻合。**
- 交用户核对成品，按反馈迭代。

---

## 3. 覆盖机制速查（buff/技能文案手动适配）

**为什么需要**：每个 buff 数值含义千差万别（系数+固伤 / 每秒回血 / 减速% / 层数…），引擎压扁成 `{per,val}` 后只能机械拼。覆盖机制让你用占位符引用 buff 的**全部原始字段**，拼任意可读文字。引擎不假设结构。

**覆盖文件** `scripts/extract/overrides/<role>.json`：
```jsonc
{
  "_version": 1,
  "buffs": {
    // 键 = baseBuffId(全局生效) 或 "skillId:baseBuffId"(只对单技能,优先级更高)
    "1000701": {
      "displayText": "{value.0.0|pct}的攻击伤害+{value.0.1|abs}的固伤,{time|sec}"
      // 字段级覆盖:只写要改的键(displayText/name…),没写的回退引擎默认
    }
  },
  "skills": {
    // 键 = displaySkillId,覆盖卡头:支持 "header.xxx" 点路径
    "1001170": { "name": "烈焰风暴", "header.note": "蓄力满触发" }
  }
}
```

**占位符语法**：
- 点路径引用原始字段：`{value.0.0}`=`value[0][0]`、`{time}`、`{interval}`、`{totalPer}`。**自动适配任意数组形状**（`value.0` 或 `value.0.0` 都行，不特判 `[per,val]`）。
- filter（管道，可链）：

  | filter | 作用 | 例(`value.0.0=-0.136`) |
  |---|---|---|
  | `pct` | **取幅度** ×100 加 `%` | `13.6%` |
  | `signed` | 带符号百分比 | `-13.6%` |
  | `abs` | 绝对值 | `0.136` |
  | `neg` | ×-1 | `0.136` |
  | `sec` | 帧 ÷30 加 `s` | (`time=150`)`5s` |
  | `frame` | 加 `帧` | `150帧` |
  | `round N`/`fixed N`/`mul X`/`add X` | 数学 | |

- 自由运算（filter 不够用时）：`{= value.0.0 * -100 }` → `13.6`（左到右无优先级，非 eval）。

**容错（不崩、不 mock）**：坏路径 → 输出可见哨兵 `⟨value.9.9?⟩` + `OVERRIDE_BAD_PATH` warning；未知 filter → 透传 + `OVERRIDE_BAD_FILTER`；运算错 → `⟨=…?⟩` + `OVERRIDE_BAD_MATH`；覆盖键没匹配上任何 buff → `OVERRIDE_UNUSED_KEY`（抓 baseBuffId 笔误）；覆盖文件 JSON 坏 → 直接报错。所有 warning 汇入卡片「数据提示」折叠区。

**坑**：
- `time: -1` 表示**永久**，不要套 `time|sec`（会出 `-0.033s`），靠前端 buffDuration 显示「永久」。
- 成长 buff 的 displayText 引擎会**逐级重渲**（系数恒定、固伤随级长），覆盖键写 baseBuffId 即可，不用管等级。

样板实例：灼烧(1000701) → `13.6%的攻击伤害+9的固伤,5s`。

---

## 4. 协作约定

- **我先做，你再改**：agent 结合攻略自己做一版完整判断（觉醒合并、多阶段总固伤、buff 覆盖），产出成品；用户看成品后指问题，agent 逐个修。
- **介入点**：唯一强制停的是「第 2 步定机制」。其余推进时若遇到攻略对不上、机制看不懂、数据缺失无法判断，再停下来问。
- **批量**：机制就绪后，其他角色可用子 agent 群按本 SOP 并行推，每角色独立的提取脚本 + 覆盖文件，互不干扰。

---

## 5. 不做

- 不动前端计算逻辑（前端永远只渲染）。
- 不动旧 `scripts/extract/role_wukong.js` 与现有 pipeline（那是早期版本，保留不动）。
- 不用 `eval`；缺数据/坏路径一律 warning，绝不 mock。
- 没经用户在第 2 步确认机制前，不大规模写脚本。
