#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'output', 'chat_qa.json');

const DIRECT_TERMS = [
  '网站', '网页', '前端', '后端', '页面', '网页端', '电脑端', '手机端', '浏览器',
  '插件', '脚本', '登录', '登陆', '仓库', '推送', '搜索', '查询', '下载', '群文件',
  '群公告', '网址', '链接', '账号', '报错', '打不开', '服务器', '排行榜', '上传',
  '安装', '解压', '启动器', '在线玩', '直装', '模块', 'data.zmwsrank',
];

const QUESTION_TERMS = [
  '?', '？', '怎么', '如何', '为什么', '为啥', '为何', '能不能', '可不可以', '有没有',
  '有无', '哪里', '哪个', '哪种', '多少', '啥', '什么', '咋', '怎样', '是否', '什么时候',
];

// QQ sometimes exports a normal follow-up as a separate text message instead of a reply.
// These are the clearly paired website answers found in this export; they are kept explicit
// so future imports do not silently treat every nearby chat message as an answer.
const CURATED_PAIRS = [
  { question: '问一下那个造梦西游之黎尤浩劫篇的数据站是哪个网址啊', answer: 'https://zmxy6.zmwsrank.top/', sourceDate: '2026-07-07' },
  { question: '有哪位大佬有造梦西游六wiki网站吗', answer: 'zmxy6.zmwsrank.top', sourceDate: '2026-07-09' },
  { question: '网址里面可以做战力对比吗？', answer: '其实做了', sourceDate: '2026-07-11' },
  { question: '这个网站的文本内容都是ai读代码生成的吗？', answer: '大部分是吧；我只写了格式示例', sourceDate: '2026-07-31' },
  { question: '为什么网页版的很卡总是连接中，用群主的这个就很流畅呀', answer: '之前倒是做过一个类似的微端，那样直接把文件路由到本地目录的', sourceDate: '2026-07-11' },
  { question: '手机网页的有人能发下吗？', answer: '我修了一下，等一下我传个新版本', sourceDate: '2026-07-13' },
  { question: '这啥？就只是打开造梦无双吗？', answer: '其实是打开网页版的造梦无双', sourceDate: '2026-07-13' },
  { question: '这个网站为什么用不了', answer: '你换个浏览器试试', sourceDate: '2026-07-06' },
  { question: '手机的能用电脑的下载不了诶', answer: '你换个浏览器试试', sourceDate: '2026-07-06' },
  { question: '这个群文件怎么用', answer: '应该是直接用吧；手机版不支持', sourceDate: '2026-06-24' },
  { question: '下载完怎么弄嘞', answer: '直接安装啊', sourceDate: '2026-06-24' },
  { question: '所以软件这本质是网页版的吗', answer: '对，本质上是网页版', sourceDate: '2026-06-24' },
  { question: '为什么我电脑版的没有图标', answer: '你重新下载一下', sourceDate: '2026-06-24' },
  { question: '那渠道服咋用？', answer: '渠道服只能原生安装包', sourceDate: '2026-06-26' },
  { question: '话说要咋更新呀', answer: '脚本是可以云更新的；主程序文件得手动下载', sourceDate: '2026-07-13' },
  { question: '打开方式不对是啥意思', answer: '可能是网络啥的吧', sourceDate: '2026-07-13' },
  { question: '浏览器打开就没有', answer: '你往下划一下试试', sourceDate: '2026-06-18' },
  { question: '为什么我看不了宠物装备属性百分比', answer: '网站上没这个东西', sourceDate: '2026-06-21' },
  { question: '为什么手机版还是打不开', answer: '手机浏览器的 bug', sourceDate: '2026-07-15' },
];

const GENERIC_ANSWERS = new Set([
  '有', '有的', '没有', '不会', '可以', '对', '是', '嗯', '哦', '好', '好的', '没',
  '不知道', '不清楚', '看情况', '应该吧', '可能吧', '确实', '感谢', '谢谢', '支持',
  '难', '包的包的', 'yes', 'forever', '刷新一下', '没必要吧', '肯定有啊', '我也不知道',
  '这是什么', '这倒确实', '太乱了，不知道哪个是',
]);

function includesAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function cleanText(value) {
  return String(value || '')
    .replace(/\[(?:图片|视频|文件)(?::[^\]]+)?\]/g, '')
    .replace(/\[表情\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanQuestion(value) {
  return cleanText(value).replace(/^(?:@[^\s]+\s*)+/, '').replace(/^@\s*/, '').trim();
}

function cleanAnswer(value) {
  return cleanText(value)
    .replace(/^\[回复消息\]\s*/, '')
    .replace(/^@[^\s]*\s*/, '')
    .trim();
}

function getReplyText(message) {
  const textParts = (message.content?.elements || [])
    .filter((element) => element.type === 'text' && typeof element.data?.text === 'string')
    .map((element) => element.data.text)
    .join('');
  return cleanAnswer(textParts || message.content?.text);
}

function looksLikeQuestion(question) {
  if (question.length < 4) return false;
  return includesAny(question, QUESTION_TERMS) || /[吗呢?？]$/.test(question);
}

function isUsefulAnswer(answer) {
  if (answer.length < 4) return false;
  if (GENERIC_ANSWERS.has(answer.toLowerCase())) return false;
  if (/^\[图片|^\[视频|^\[文件/.test(answer)) return false;
  if (/^[.?？\s]+$/.test(answer)) return false;
  if (/[?？]/.test(answer) || /(?:吗|呢)$/.test(answer)) return false;
  if (includesAny(answer, QUESTION_TERMS.slice(2)) && !/https?:\/\//i.test(answer)) return false;
  if (/^(?:不知道|不清楚|没用过|我也不知道)/.test(answer)) return false;
  if (/(?:回错了|卧槽|我操|哈哈|猜猜|插叉子|插件插件|大夫当插件自己用了|跟挂一样|大夫攒够|大福攒够|给大福赞助|还能这样|大夫奉命|作弊分|没有被攻击过的服务器|强烈需要|开盒|报j|盒武器|666)/.test(answer)) return false;
  return true;
}

function isRelevantQuestion(question, answer) {
  if (/(?:开挂|挂|充钱|充多少|翻译|mcjava|脚本包封|自动扫荡|根据登录信息查到具体地点)/.test(`${question}\n${answer}`)) return false;
  if (/新号.*仓库功能/.test(question) && /客户端/.test(answer)) return false;
  return true;
}

function isWebsiteContext(question, answer) {
  return includesAny(question, DIRECT_TERMS) || includesAny(answer, DIRECT_TERMS);
}

function categoryFor(question, answer) {
  const text = `${question}\n${answer}`;
  if (includesAny(text, ['网站', '网页', '网址', '链接', '前端', '后端', '页面', '排行榜', '搜索', '查询'])) {
    return '网站与数据';
  }
  if (includesAny(text, ['插件', '脚本', '模块', '直装', '在线玩'])) return '插件与直装';
  if (includesAny(text, ['下载', '安装', '解压', '登录', '登陆', '浏览器', '电脑端', '手机端'])) {
    return '安装与登录';
  }
  return '运行与更新';
}

function stableId(question, answers) {
  const digest = crypto.createHash('sha1')
    .update(`${question.toLowerCase()}\n${answers.join('\n')}`)
    .digest('hex')
    .slice(0, 16);
  return `chat-${digest}`;
}

function confidenceFor(question, answers) {
  let confidence = 0.55;
  if (includesAny(question, DIRECT_TERMS)) confidence += 0.12;
  if (answers.some((answer) => /https?:\/\/|(?:[a-z0-9-]+\.)+[a-z]{2,}/i.test(answer))) confidence += 0.12;
  if (answers.some((answer) => answer.length >= 12)) confidence += 0.04;
  return Number(Math.min(confidence, 0.85).toFixed(2));
}

async function extractChatQa(inputFile, outputFile = DEFAULT_OUTPUT) {
  if (!fs.existsSync(inputFile)) throw new Error(`聊天记录不存在：${inputFile}`);

  const seenIds = new Set();
  const grouped = new Map();
  let recordCount = 0;
  let replyCount = 0;
  let selectedCount = 0;

  const input = fs.createReadStream(inputFile, { encoding: 'utf8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    recordCount += 1;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (seenIds.has(message.id)) continue;
    seenIds.add(message.id);
    if (message.type !== 'reply' || message.recalled) continue;
    replyCount += 1;

    const referenced = message.content?.elements?.find((element) => element.type === 'reply')?.data;
    const question = cleanQuestion(referenced?.content);
    const answer = getReplyText(message);
    if (!question || !answer || !looksLikeQuestion(question) || !isRelevantQuestion(question, answer) || !isUsefulAnswer(answer)) continue;
    if (!isWebsiteContext(question, answer)) continue;

    const key = question.toLowerCase();
    const current = grouped.get(key) || {
      question,
      answers: [],
      timestamps: [],
      sourceMessageIds: [],
      referencedMessageIds: [],
    };
    if (!current.answers.includes(answer)) current.answers.push(answer);
    if (message.time) current.timestamps.push(message.time);
    if (message.id) current.sourceMessageIds.push(message.id);
    if (referenced?.referencedMessageId) current.referencedMessageIds.push(referenced.referencedMessageId);
    grouped.set(key, current);
    selectedCount += 1;
  }

  const directData = [...grouped.values()]
    .map((item) => {
      const answers = item.answers.slice(0, 6);
      const timestamp = item.timestamps.slice().sort()[0] || null;
      return {
        id: stableId(item.question, answers),
        title: item.question.slice(0, 160),
        category: categoryFor(item.question, answers.join('\n')),
        question: item.question,
        answer: answers.join('\n'),
        answers,
        confidence: confidenceFor(item.question, answers),
        evidence: 'direct_reply',
        sourceDate: timestamp ? timestamp.slice(0, 10) : null,
        sourceMessageIds: [...new Set(item.sourceMessageIds)],
        referencedMessageIds: [...new Set(item.referencedMessageIds)],
      };
    });

  const curatedData = CURATED_PAIRS.map((item) => ({
    id: stableId(item.question, [item.answer]),
    title: item.question.slice(0, 160),
    category: categoryFor(item.question, item.answer),
    question: item.question,
    answer: item.answer,
    answers: [item.answer],
    confidence: confidenceFor(item.question, [item.answer]),
    evidence: 'adjacent_messages',
    sourceDate: item.sourceDate,
    sourceMessageIds: [],
    referencedMessageIds: [],
  }));

  const merged = new Map();
  for (const entry of [...directData, ...curatedData]) {
    const key = entry.question.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      continue;
    }
    existing.answers = [...new Set([...existing.answers, ...entry.answers])];
    existing.answer = existing.answers.join('\n');
    existing.confidence = Math.max(existing.confidence, entry.confidence);
    existing.evidence = existing.evidence === entry.evidence
      ? existing.evidence
      : `${existing.evidence},${entry.evidence}`;
    existing.sourceMessageIds = [...new Set([...existing.sourceMessageIds, ...entry.sourceMessageIds])];
    existing.referencedMessageIds = [...new Set([...existing.referencedMessageIds, ...entry.referencedMessageIds])];
    existing.sourceDate = [existing.sourceDate, entry.sourceDate].filter(Boolean).sort()[0] || null;
    existing.id = stableId(existing.question, existing.answers);
  }
  const data = [...merged.values()].sort((left, right) => left.question.localeCompare(right.question, 'zh-CN'));

  const payload = {
    _meta: {
      name: 'chat_qa',
      system: 'chat_qa',
      extractedAt: new Date().toISOString(),
      source: path.basename(inputFile),
      sourceRecords: recordCount,
      sourceReplies: replyCount,
      selectedReplies: selectedCount,
      selectedAdjacentPairs: curatedData.length,
      uniqueQuestions: data.length,
      notes: '由直接回复和明确相邻问答整理；内容可能过时，仅作辅助参考。',
    },
    data,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Generated ${path.relative(REPO_ROOT, outputFile)} with ${data.length} unique questions from ${selectedCount} replies.`);
  return payload;
}

if (require.main === module) {
  const inputFile = process.argv[2] || process.env.CHAT_QA_INPUT;
  const outputFile = process.argv[3] || DEFAULT_OUTPUT;
  if (!inputFile) {
    console.error('Usage: node scripts/extract/chat_qa.js <chat-export.jsonl> [output.json]');
    process.exitCode = 1;
  } else {
    extractChatQa(path.resolve(inputFile), path.resolve(outputFile)).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { extractChatQa };
