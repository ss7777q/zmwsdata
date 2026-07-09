const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_REPORT_ROOT = 'D:\\zmws\\GameAnalysis\\report';
const frontMatterFields = ['id', 'title', 'category', 'readingMinutes', 'summary'];

function normalizeText(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readTextFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return normalizeText(buffer.toString('utf16le', 2));
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return normalizeText(buffer.toString('utf8', 3));
  }
  return normalizeText(buffer.toString('utf8'));
}

function readReport(reportRoot, fileName) {
  const filePath = path.join(reportRoot, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing report file: ${filePath}`);
  }
  return readTextFile(filePath);
}

function assertIncludes(text, fileName, snippets) {
  for (const snippet of snippets) {
    if (!text.includes(snippet)) {
      throw new Error(`Missing required snippet in ${fileName}: ${snippet}`);
    }
  }
}

function pickExcerpt(text, snippets) {
  return snippets.map((snippet) => {
    const index = text.indexOf(snippet);
    if (index < 0) return snippet;
    const lineStart = text.lastIndexOf('\n', index) + 1;
    const lineEnd = text.indexOf('\n', index + snippet.length);
    return text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd).trim();
  });
}

function parseFrontMatter(raw, filePath) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    throw new Error(`Missing front matter: ${filePath}`);
  }

  const meta = {};
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':');
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    meta[key] = value.replace(/^['"]|['"]$/g, '');
  }

  for (const field of frontMatterFields) {
    if (!meta[field]) {
      throw new Error(`Missing front matter field ${field}: ${filePath}`);
    }
  }

  const readingMinutes = Number(meta.readingMinutes);
  if (!Number.isInteger(readingMinutes) || readingMinutes <= 0) {
    throw new Error(`Invalid readingMinutes in ${filePath}: ${meta.readingMinutes}`);
  }

  return {
    meta: { ...meta, readingMinutes },
    body: raw.slice(match[0].length),
  };
}

function parseSections(body) {
  const sections = new Map();
  const headingPattern = /^##\s+(.+)$/gm;
  const headings = [...body.matchAll(headingPattern)];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const title = heading[1].trim();
    const start = heading.index + heading[0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : body.length;
    sections.set(title, body.slice(start, end).trim());
  }

  return sections;
}

function requireSection(sections, title, filePath) {
  const section = sections.get(title);
  if (!section) {
    throw new Error(`Missing section ${title}: ${filePath}`);
  }
  return section;
}

function optionalSection(sections, title) {
  return sections.get(title) || '';
}

function parseList(section, sectionTitle, filePath) {
  if (!section) return [];
  const lines = section.split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const listMarkerRegex = /^(?:[-*]\s+|\d+(?:\.\d+)?\.\s+)/;
  const items = [];

  for (const line of lines) {
    if (listMarkerRegex.test(line)) {
      items.push(line.replace(/^(?:[-*]\s+|\d+(?:\.\d+)?\.\s+)/, '').trim());
    } else if (items.length > 0) {
      items[items.length - 1] += '\n' + line;
    } else {
      items.push(line);
    }
  }

  if (items.length === 0 || items.some((item) => !item)) {
    throw new Error(`Invalid list section ${sectionTitle}: ${filePath}`);
  }
  return items;
}

function parseArticle(filePath) {
  const { meta, body } = parseFrontMatter(readTextFile(filePath), filePath);
  const sections = parseSections(body);
  const playerQuestionMarkdown = optionalSection(sections, '玩家提问');
  const mechanismMarkdown = optionalSection(sections, '核心机制');
  const requiredSnippets = parseList(optionalSection(sections, '报告校验片段'), '报告校验片段', filePath);

  return {
    ...meta,
    playerQuestion: playerQuestionMarkdown,
    playerQuestionMarkdown,
    mechanism: parseList(mechanismMarkdown, '核心机制', filePath),
    mechanismMarkdown,
    requiredSnippets,
  };
}

function getColdKnowledgePaths(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  return {
    root,
    articleRoot: options.articleRoot || path.join(root, 'scripts', 'extract', 'cold_knowledge'),
    reportRoot: options.reportRoot || DEFAULT_REPORT_ROOT,
  };
}

function readColdKnowledgeArticles(options = {}) {
  const { articleRoot, reportRoot } = getColdKnowledgePaths(options);
  if (!fs.existsSync(articleRoot)) {
    throw new Error(`Missing cold knowledge article directory: ${articleRoot}`);
  }

  const files = fs.readdirSync(articleRoot)
    .filter((fileName) => fileName.endsWith('.md') && !fileName.startsWith('_'))
    .sort((left, right) => left.localeCompare(right));

  return files.map((fileName) => parseArticle(path.join(articleRoot, fileName)))
    .map((article) => {
      if (article.requiredSnippets.length === 0) {
        return { ...article, sourceExcerpt: [] };
      }
      if (!article.sourceFile) {
        throw new Error(`Missing sourceFile for required snippets in article: ${article.id}`);
      }
      const sourceText = readReport(reportRoot, article.sourceFile);
      assertIncludes(sourceText, article.sourceFile, article.requiredSnippets);
      return {
        ...article,
        sourceExcerpt: pickExcerpt(sourceText, article.requiredSnippets),
      };
    })
    .map(({ requiredSnippets, ...article }) => article);
}

function buildColdKnowledgeResponse(options = {}) {
  const articles = readColdKnowledgeArticles(options);
  return {
    _meta: {
      name: 'cold_knowledge',
      system: 'cold_knowledge',
      extractedAt: new Date().toISOString(),
      source: 'scripts/extract/cold_knowledge/*.md',
    },
    data: articles,
  };
}

module.exports = {
  buildColdKnowledgeResponse,
  getColdKnowledgePaths,
  readColdKnowledgeArticles,
};
