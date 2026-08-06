const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const REQUEST_BODY_MAX_BYTES = 64 * 1024;
const MAX_QUESTION_LENGTH = 1_000;
const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_MESSAGE_LENGTH = 2_000;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_MODEL_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CONTEXT_LENGTH = 18_000;
const MAX_DOCUMENTS_PER_FILE = 80;

const CHAT_KNOWLEDGE_TERMS = [
  '网站', '网页', '前端', '后端', '页面', '网址', '链接', '浏览器', '插件', '脚本',
  '登录', '登陆', '账号', '下载', '安装', '解压', '群文件', '群公告', '服务器', '推送',
  '上传', '排行榜', '仓库', '搜索', '查询', '电脑端', '手机端', '直装', '在线玩', '模块',
];

const DEFAULT_MODEL_ORDER = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'DeepSeek-V3.2',
  'gemini-3.5-flash',
  'gemini-3.5-flash-low',
  'gemini-3.5-flash-extra-low',
  'gemini-3-flash',
];

const ROLE_FILES = [
  ['悟空', 'role_wiki_wukong'],
  ['孙悟空', 'role_wiki_wukong'],
  ['唐僧', 'role_wiki_tangseng'],
  ['沙僧', 'role_wiki_shaseng'],
  ['八戒', 'role_wiki_bajie'],
  ['猪八戒', 'role_wiki_bajie'],
  ['敖雪', 'role_wiki_aoxue'],
  ['敖烈', 'role_wiki_aolie'],
  ['小焰', 'role_wiki_xiaoyan'],
  ['玄女', 'role_wiki_xuannv'],
  ['杨戬', 'role_wiki_yangjian'],
];

const PET_FILES = [
  ['白虎', 'pet_wiki_baihu'],
  ['猴王', 'pet_wiki_hou'],
  ['花仙', 'pet_wiki_huadiehubing'],
  ['玄蝶', 'pet_wiki_huadiehubing'],
  ['冰狐', 'pet_wiki_huadiehubing'],
  ['老鼠', 'pet_wiki_laoshu'],
  ['鼠王', 'pet_wiki_laoshu'],
  ['神牛', 'pet_wiki_niuxueren'],
  ['圆圆', 'pet_wiki_niuxueren'],
  ['麒麟', 'pet_wiki_qilin'],
  ['青龙', 'pet_wiki_qinglong'],
  ['天蛇', 'pet_wiki_tianshe'],
  ['兔皇', 'pet_wiki_tuzi'],
  ['王蛇', 'pet_wiki_wangshe'],
  ['玄武', 'pet_wiki_xuanwu'],
  ['朱雀', 'pet_wiki_zhuque'],
];

const RIDE_FILES = [
  ['帝听', 'ride_wiki_diting'],
  ['凤凰', 'ride_wiki_fenghuang'],
  ['金毛猴', 'ride_wiki_jinmaohou'],
  ['魔晶兽', 'ride_wiki_mojingshou'],
  ['年兽', 'ride_wiki_nianshou'],
  ['貔貅', 'ride_wiki_pixiu'],
  ['青狮', 'ride_wiki_qingshi'],
  ['旺旺', 'ride_wiki_wangwang'],
];

const OMIT_KEYS = new Set([
  'raw',
  'source',
  'sourceFile',
  'guidePath',
  'icon',
  'image',
  'metadata',
  'otherData',
  'makeUpBeskills',
  'initializeBeskills',
]);

class QaError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class ModelRequestError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function handleQaRequest({ request, env }) {
  try {
    const input = await parseRequest(request);
    const files = selectKnowledgeFiles(input.question);
    const documents = await loadKnowledgeDocuments(request, files);
    const ranked = rankDocuments(input.question, documents);

    if (String(env?.QA_MODE || '').trim().toLowerCase() === 'mock') {
      return jsonResponse({
        answer: `本地 Mock 已收到问题：${input.question}\n\n已检索 ${files.length} 个资料文件，可命中 ${ranked.documents.length} 条候选资料。`,
        citations: ranked.citations,
        model: 'mock',
        provider: 'local',
        files,
        attempts: [],
      });
    }

    const providers = readProviderConfigs(env);
    if (providers.length === 0) {
      throw new QaError(503, 'EQA_PROVIDER_NOT_CONFIGURED', '问答模型尚未配置，请设置 QA_BASE_URL 与 QA_API_KEY');
    }

    const completion = await completeWithFallback({
      providers,
      question: input.question,
      history: input.history,
      context: ranked.context,
    });

    return jsonResponse({
      answer: completion.answer,
      citations: ranked.citations,
      model: completion.model,
      provider: completion.provider,
      files,
      attempts: completion.attempts,
    });
  } catch (error) {
    if (error instanceof QaError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status);
    }
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: `问答服务失败：${message}`, code: 'EQA_INTERNAL' }, 500);
  }
}

async function parseRequest(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > REQUEST_BODY_MAX_BYTES) {
    throw new QaError(413, 'EQA_REQUEST_TOO_LARGE', '问题请求过大');
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    throw new QaError(400, 'EQA_INVALID_JSON', '请求体不是有效 JSON');
  }

  const question = typeof payload?.question === 'string' ? payload.question.trim() : '';
  if (!question) {
    throw new QaError(400, 'EQA_EMPTY_QUESTION', '请输入问题');
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new QaError(400, 'EQA_QUESTION_TOO_LONG', `问题不能超过 ${MAX_QUESTION_LENGTH} 个字符`);
  }

  const history = Array.isArray(payload?.history)
    ? payload.history
      .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
      .slice(-MAX_HISTORY_ITEMS)
      .map((item) => ({
        role: item.role,
        content: item.content.trim().slice(0, MAX_HISTORY_MESSAGE_LENGTH),
      }))
      .filter((item) => item.content)
    : [];

  return { question, history };
}

function selectKnowledgeFiles(question) {
  const normalized = question.toLowerCase();
  const files = new Set(['cold_knowledge']);
  const addMatches = (entries) => {
    for (const [keyword, file] of entries) {
      if (question.includes(keyword) || normalized.includes(keyword.toLowerCase())) files.add(file);
    }
  };

  addMatches(ROLE_FILES);
  addMatches(PET_FILES);
  addMatches(RIDE_FILES);

  if (question.includes('角色') || question.includes('技能') || question.includes('段数') || question.includes('伤害')) {
    files.add('role_wiki_skill_extra');
  }
  if (question.includes('宠物') || question.includes('灵宠') || question.includes('神兽')) {
    files.add('pet_wiki_index');
    files.add('pet_skill');
  }
  if (question.includes('坐骑')) {
    files.add('ride_wiki_index');
    files.add('ride_skill');
  }
  if (question.includes('BOSS') || normalized.includes('boss') || question.includes('关卡') || question.includes('主线')) {
    files.add('boss_index');
    if (question.includes('主线')) files.add('boss_type_0001_mainline');
    if (question.includes('昆仑')) files.add('boss_type_0023_kunlun');
  }
  if (question.includes('昆仑')) files.add('kunlun_analysis');
  if (question.includes('战力')) files.add('power_requirements');
  if (question.includes('资源') || question.includes('宝箱') || question.includes('商店')) files.add('resource_acquisition');
  if (CHAT_KNOWLEDGE_TERMS.some((term) => question.includes(term) || normalized.includes(term.toLowerCase()))) {
    files.add('chat_qa');
  }

  return [...files].slice(0, 6);
}

async function loadKnowledgeDocuments(request, files) {
  const results = await Promise.all(files.map(async (file) => {
    try {
      const payload = await loadJsonAsset(request, file);
      return buildDocuments(file, payload);
    } catch {
      return [];
    }
  }));
  return results.flat();
}

async function loadJsonAsset(request, file) {
  const url = new URL(`/data/${encodeURIComponent(file)}.json`, request.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`资料文件 ${file}.json 不可用`);
  const length = Number(response.headers.get('Content-Length') || 0);
  if (length > MAX_ASSET_BYTES) throw new Error(`资料文件 ${file}.json 超过限制`);
  const text = await readBoundedText(response, MAX_ASSET_BYTES);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`资料文件 ${file}.json 格式错误`);
  }
}

async function readBoundedText(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('响应体超过限制');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function buildDocuments(file, payload) {
  const data = payload?.data ?? payload;
  if (file === 'chat_qa' && Array.isArray(data)) {
    return data.map((entry) => ({
      id: `${file}:${entry.id || entry.question}`,
      title: entry.title || entry.question || file,
      source: `${file}.json / ${entry.sourceDate || '群聊直接回复'}`,
      text: [
        '以下内容来自群聊直接回复，可能已经过时或存在个别错误，仅作辅助参考。',
        `用户问题：${entry.question}`,
        `群聊回复：${entry.answer}`,
        entry.category ? `分类：${entry.category}` : '',
      ].filter(Boolean).join('\n'),
    }));
  }
  if (file === 'cold_knowledge' && Array.isArray(data)) {
    return data.map((article) => ({
      id: `${file}:${article.id || article.title}`,
      title: article.title || article.id || file,
      source: `${file}.json / ${article.id || article.title || 'article'}`,
      text: [
        article.title,
        article.category,
        article.summary,
        article.playerQuestion,
        article.playerQuestionMarkdown,
        ...(Array.isArray(article.mechanism) ? article.mechanism : []),
        article.mechanismMarkdown,
        ...(Array.isArray(article.sourceExcerpt) ? article.sourceExcerpt : []),
      ].filter(Boolean).join('\n'),
    }));
  }

  if (file.startsWith('role_wiki_') && data?.role && Array.isArray(data.slots)) {
    return data.slots.map((slot) => buildRoleSkillDocument(file, data.role.name, slot)).filter(Boolean);
  }

  const documents = [];
  collectGenericDocuments(data, file, '$', documents, 0);
  return documents.slice(0, MAX_DOCUMENTS_PER_FILE);
}

function buildRoleSkillDocument(file, roleName, slot) {
  const base = slot?.base;
  if (!base?.name) return null;
  const levels = Array.isArray(base.levels) ? base.levels : [];
  const compactLevels = levels.map((level) => ({
    level: level.level,
    roleLevel: level.roleLevel,
    segmentVals: level.segmentVals,
    totalPer: level.totalPer,
    totalVal: level.totalVal,
    growthBuffs: level.growthBuffs,
    metrics: level.metrics,
    effects: level.effects,
  }));
  const compact = {
    role: roleName,
    slot: slot.slot,
    slotLabel: slot.slotLabel,
    name: base.name,
    maxLevel: base.maxLevel,
    header: base.header,
    levelCount: levels.length,
    levels: compactLevels,
  };
  return {
    id: `${file}:${slot.slot}:${base.name}`,
    title: `${roleName || ''} ${base.name}`.trim(),
    source: `${file}.json / ${slot.slot || base.name}`,
    text: JSON.stringify(compactValue(compact), null, 2),
  };
}

function collectGenericDocuments(value, file, path, documents, depth) {
  if (documents.length >= MAX_DOCUMENTS_PER_FILE || value == null || depth > 6) return;
  if (Array.isArray(value)) {
    value.slice(0, 120).forEach((item, index) => collectGenericDocuments(item, file, `${path}[${index}]`, documents, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;

  const compact = compactValue(value);
  const text = JSON.stringify(compact, null, 2);
  const label = value.title || value.name || value.skillName || value.petName || value.id || path;
  if (text.length >= 80) {
    documents.push({
      id: `${file}:${path}`,
      title: String(label).slice(0, 180),
      source: `${file}.json / ${path}`,
      text,
    });
  }

  for (const [key, child] of Object.entries(value)) {
    if (OMIT_KEYS.has(key)) continue;
    if (Array.isArray(child) || (child && typeof child === 'object')) {
      collectGenericDocuments(child, file, `${path}.${key}`, documents, depth + 1);
    }
    if (documents.length >= MAX_DOCUMENTS_PER_FILE) break;
  }
}

function compactValue(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 900 ? `${value.slice(0, 900)}…` : value;
  if (depth > 5) return '[nested data omitted]';
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => compactValue(item, depth + 1));
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (OMIT_KEYS.has(key)) continue;
    result[key] = compactValue(child, depth + 1);
  }
  return result;
}

function rankDocuments(question, documents) {
  const terms = getSearchTerms(question);
  const ranked = documents.map((document) => {
    const title = document.title.toLowerCase();
    const text = document.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 12;
      if (text.includes(term)) score += 2;
    }
    return { document, score };
  }).sort((left, right) => right.score - left.score);

  const selected = ranked.filter((item) => item.score > 0).slice(0, 8);
  if (selected.length === 0) selected.push(...ranked.slice(0, 5));

  let used = 0;
  const contextParts = [];
  const citations = [];
  for (const item of selected) {
    const remaining = MAX_CONTEXT_LENGTH - used;
    if (remaining < 200) break;
    const text = item.document.text.slice(0, Math.min(remaining - 120, 8_000));
    const index = citations.length + 1;
    contextParts.push(`[${index}] ${item.document.title}\n来源：${item.document.source}\n${text}`);
    citations.push({ index, title: item.document.title, source: item.document.source, score: item.score });
    used += contextParts.at(-1).length + 2;
  }

  return { documents: selected.map((item) => item.document), context: contextParts.join('\n\n'), citations };
}

function getSearchTerms(question) {
  const normalized = question.toLowerCase().replace(/\s+/g, '');
  const terms = new Set();
  for (const word of normalized.match(/[a-z0-9][a-z0-9._-]+/g) || []) terms.add(word);
  for (const group of normalized.match(/[\u4e00-\u9fff]+/g) || []) {
    if (group.length <= 4) terms.add(group);
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index + size <= group.length; index += 1) terms.add(group.slice(index, index + size));
    }
  }
  return [...terms].filter((term) => term.length >= 2);
}

function buildSystemPrompt(context) {
  return `你是“造梦无双”资料问答助手。回答必须以提供的资料为依据，不能凭空补全游戏数值。

规则：
1. 先直接回答问题，再补充必要解释；数值、等级、段数、消耗和机制要明确。
2. 每个关键结论都尽量在句末标注资料编号，例如 [1]、[2]。
3. 资料没有覆盖的问题，要明确说“当前资料未找到”，不要假装确定。
4. 如果资料之间出现冲突，指出冲突并优先采用带有明确来源和计算说明的条目。
5. 使用简洁中文，不输出与问题无关的模型或系统信息。
6. 群聊问答只代表当时的用户经验；如果它与结构化资料或当前页面状态冲突，明确说明群聊内容可能已过时。

资料：
${context || '没有检索到匹配资料。'}`;
}

function readProviderConfigs(env) {
  const defaultModels = parseModels(env?.QA_MODEL_ORDER);
  const providers = [];
  const rawJson = String(env?.QA_PROVIDERS_JSON || '').trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const provider = normalizeProvider(item, defaultModels);
          if (provider) providers.push(provider);
        }
      }
    } catch {
      // Fall back to the single-provider variables below.
    }
  }

  if (providers.length === 0) {
    const provider = normalizeProvider({
      name: env?.QA_PROVIDER_NAME || 'default',
      baseUrl: env?.QA_BASE_URL || env?.QA_MODEL_BASE_URL,
      apiKey: env?.QA_API_KEY || env?.QA_MODEL_API_KEY,
      authHeader: env?.QA_AUTH_HEADER,
      models: defaultModels,
    }, defaultModels);
    if (provider) providers.push(provider);
  }
  return providers;
}

function normalizeProvider(item, fallbackModels) {
  if (!item || typeof item !== 'object') return null;
  const baseUrl = normalizeBaseUrl(item.baseUrl || item.base_url);
  const apiKey = String(item.apiKey || item.api_key || '').trim();
  if (!baseUrl || !apiKey) return null;
  const models = parseModels(item.models || item.modelOrder || item.model_order || fallbackModels);
  return {
    name: String(item.name || 'provider').trim() || 'provider',
    baseUrl,
    apiKey,
    authHeader: String(item.authHeader || item.auth_header || 'Authorization').trim() || 'Authorization',
    authPrefix: String(item.authPrefix || item.auth_prefix || 'Bearer').trim() || 'Bearer',
    models,
  };
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/\.$/, '').replace(/\/$/, '');
}

function parseModels(value) {
  const models = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  const normalized = models.map((model) => String(model).trim()).filter(Boolean);
  return [...new Set(normalized.length > 0 ? normalized : DEFAULT_MODEL_ORDER)];
}

async function completeWithFallback({ providers, question, history, context }) {
  const attempts = [];
  const system = buildSystemPrompt(context);
  for (const provider of providers) {
    for (const model of provider.models) {
      try {
        const answer = await callModel({ provider, model, question, history, system });
        return { answer, provider: provider.name, model, attempts };
      } catch (error) {
        attempts.push({
          provider: provider.name,
          model,
          status: error instanceof ModelRequestError ? error.status : 500,
          error: sanitizeErrorMessage(error),
        });
      }
    }
  }
  throw new QaError(503, 'EQA_ALL_MODELS_FAILED', `所有模型渠道均不可用：${attempts.at(-1)?.error || '未知错误'}`);
}

async function callModel({ provider, model, question, history, system }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [provider.authHeader]: `${provider.authPrefix} ${provider.apiKey}`.trim(),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          ...history,
          { role: 'user', content: question },
        ],
        temperature: 0.15,
        max_tokens: 1_200,
      }),
      signal: controller.signal,
    });

    const text = await readBoundedText(response, MAX_MODEL_RESPONSE_BYTES);
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ModelRequestError('模型返回了非 JSON 响应', response.status || 502);
    }
    if (!response.ok) {
      throw new ModelRequestError(sanitizeErrorMessage(payload?.error?.message || payload?.error || `HTTP ${response.status}`), response.status);
    }
    const content = extractCompletionText(payload);
    if (!content) throw new ModelRequestError('模型返回了空答案', response.status || 502);
    return content.trim();
  } catch (error) {
    if (error?.name === 'AbortError') throw new ModelRequestError('模型请求超时', 504);
    if (error instanceof ModelRequestError) throw error;
    throw new ModelRequestError(sanitizeErrorMessage(error), 502);
  } finally {
    clearTimeout(timeout);
  }
}

function extractCompletionText(payload) {
  const message = payload?.choices?.[0]?.message?.content;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) {
    return message.map((part) => typeof part === 'string' ? part : part?.text || '').join('');
  }
  const text = payload?.choices?.[0]?.text;
  return typeof text === 'string' ? text : '';
}

function sanitizeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  return message.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').slice(0, 240);
}
