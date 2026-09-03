const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { readColdKnowledgeArticles, buildColdKnowledgeResponse } = require('../scripts/extract/lib/cold-knowledge');

const repoRoot = path.resolve(__dirname, '..');

test('Cold Knowledge - 宠物与坐骑资质洗炼算法人话版文章解析与验证测试', async (t) => {
  await t.test('能够成功读取并解析所有冷知识文章', () => {
    const articles = readColdKnowledgeArticles({ root: repoRoot });
    assert.ok(Array.isArray(articles));
    assert.ok(articles.length >= 14, `文章总数应不小于 14，实际为 ${articles.length}`);
  });

  await t.test('资质洗炼人话版文章必须全部存在且字段完整', () => {
    const articles = readColdKnowledgeArticles({ root: repoRoot });
    const targetIds = [
      'pet-ride-aptitude-washing',
      'aptitude-washing-protection-and-tips',
    ];

    for (const id of targetIds) {
      const article = articles.find((item) => item.id === id);
      assert.ok(article, `未找到 ID 为 ${id} 的冷知识文章`);
      assert.equal(article.category, '养成系统', `文章 ${id} 分类必须为 养成系统`);
      assert.ok(article.title && article.title.length > 0, `文章 ${id} 标题不能为空`);
      assert.ok(typeof article.readingMinutes === 'number' && article.readingMinutes > 0, `文章 ${id} 阅读时间不合法`);
      assert.ok(article.summary && article.summary.length > 0, `文章 ${id} 摘要不能为空`);
      assert.ok(article.playerQuestion && article.playerQuestion.length > 0, `文章 ${id} 玩家提问不能为空`);
      assert.ok(Array.isArray(article.mechanism) && article.mechanism.length > 0, `文章 ${id} 核心机制不能为空`);
      assert.ok(Array.isArray(article.sourceExcerpt) && article.sourceExcerpt.length > 0, `文章 ${id} 来源摘录不能为空`);
    }
  });

  await t.test('资质洗炼算法文章 (pet-ride-aptitude-washing) 人话公式与数值验证', () => {
    const articles = readColdKnowledgeArticles({ root: repoRoot });
    const article = articles.find((item) => item.id === 'pet-ride-aptitude-washing');
    const mechanismText = article.mechanism.join('\n');

    assert.ok(mechanismText.includes('125%') || mechanismText.includes('125\\%'), '应包含上涨概率 125%');
    assert.ok(mechanismText.includes('30'), '应包含涨跌幅度 30');
    assert.ok(mechanismText.includes('15') && mechanismText.includes('45'), '应包含宠物高级洗炼增加 15~45 点');
    assert.ok(mechanismText.includes('75%') || mechanismText.includes('75\\%'), '应包含 75% 概率说明');
  });

  await t.test('避坑与保护机制文章 (aptitude-washing-protection-and-tips) 保护逻辑验证', () => {
    const articles = readColdKnowledgeArticles({ root: repoRoot });
    const article = articles.find((item) => item.id === 'aptitude-washing-protection-and-tips');
    const mechanismText = article.mechanism.join('\n');

    assert.ok(mechanismText.includes('取消') && mechanismText.includes('隐藏'), '应包含全涨隐藏取消按钮保护');
    assert.ok(mechanismText.includes('确定') && mechanismText.includes('隐藏'), '应包含全跌隐藏确定按钮保护');
    assert.ok(mechanismText.includes('资质已达上限'), '应包含资质已达上限提示');
    assert.ok(mechanismText.includes('先升星再洗炼'), '应包含先升星再洗炼策略');
  });

  await t.test('构建产物 output/cold_knowledge.json 结构验证', () => {
    const payload = buildColdKnowledgeResponse({ root: repoRoot });
    assert.equal(payload._meta.name, 'cold_knowledge');
    assert.equal(payload._meta.system, 'cold_knowledge');
    assert.ok(Array.isArray(payload.data) && payload.data.length >= 14);
  });
});
